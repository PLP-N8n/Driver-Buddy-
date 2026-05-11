import { getAccountId, getDeviceSecret } from './deviceId';

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const WORKER_URL = env?.VITE_SYNC_WORKER_URL ?? '';
const SESSION_REFRESH_WINDOW_MS = 5 * 60_000;

export type AuthFailureReason =
  | 'not_registered'
  | 'account_claimed'
  | 'rate_limited'
  | 'network'
  | 'cors_or_preflight'
  | 'unknown';

export type SessionResult =
  | { ok: true; token: string }
  | { ok: false; reason: AuthFailureReason };

export type AuthHeadersResult =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; reason: AuthFailureReason };

let cachedToken: string | null = null;
let cachedAccountId: string | null = null;
let cachedExpiry = 0;
let lastDeviceCount: number | null = null;
let lastAuthFailure: AuthFailureReason | null = null;

const registeredAccounts = new Set<string>();
const registrationRequests = new Map<string, Promise<boolean>>();

function clearCachedSessionToken(): void {
  cachedToken = null;
  cachedAccountId = null;
  cachedExpiry = 0;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bufferToHex(digest);
}

function parseTokenExpiry(token: string): number {
  const parts = token.split(':');
  if (parts.length !== 3) return 0;

  const expiresAt = Number(parts[1]);
  return Number.isFinite(expiresAt) ? expiresAt : 0;
}

// 401 during session issuance means "no valid session" (not_registered).
// During registration, callers override this to 'account_claimed' — meaning
// "account exists with different device credentials."
function mapHttpError(status: number): AuthFailureReason {
  if (status === 401) return 'not_registered';
  if (status === 429) return 'rate_limited';
  return 'unknown';
}

function mapFetchError(): AuthFailureReason {
  return 'network';
}

export async function getDeviceSecretHash(deviceSecret = getDeviceSecret()): Promise<string> {
  return sha256Hex(deviceSecret);
}

async function registerAccount(accountId: string, deviceSecret = getDeviceSecret()): Promise<boolean> {
  const result = await registerAccountWithReason(accountId, deviceSecret);
  return result.ok;
}

async function registerAccountWithReason(
  accountId: string,
  deviceSecret = getDeviceSecret()
): Promise<{ ok: true } | { ok: false; reason: AuthFailureReason }> {
  if (!WORKER_URL) return { ok: false, reason: 'unknown' };
  const cacheKey = `${accountId}:${await getDeviceSecretHash(deviceSecret)}`;
  if (registeredAccounts.has(cacheKey)) return { ok: true };

  const pendingRequest = registrationRequests.get(cacheKey);
  if (pendingRequest) {
    const result = await pendingRequest;
    return result ? { ok: true } : { ok: false, reason: lastAuthFailure ?? 'unknown' };
  }

  const request = (async () => {
    const deviceSecretHash = await getDeviceSecretHash(deviceSecret);
    try {
      const response = await fetch(`${WORKER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, deviceSecretHash }),
      });

      if (!response.ok) {
        const reason = response.status === 401 ? 'account_claimed' : mapHttpError(response.status);
        lastAuthFailure = reason;
        console.warn(`[sessionManager] registerAccount failed: HTTP ${response.status} ${response.statusText} (${reason})`);
        return false;
      }

      const data = (await response.json().catch(() => ({}))) as { deviceCount?: number };
      lastDeviceCount = typeof data.deviceCount === 'number' && Number.isFinite(data.deviceCount) ? data.deviceCount : null;
      registeredAccounts.add(cacheKey);
      lastAuthFailure = null;
      return true;
    } catch {
      lastAuthFailure = 'network';
      return false;
    }
  })()
    .finally(() => {
      registrationRequests.delete(cacheKey);
    });

  registrationRequests.set(cacheKey, request);
  const result = await request;
  return result ? { ok: true } : { ok: false, reason: lastAuthFailure ?? 'unknown' };
}

export async function getSessionToken(accountId = getAccountId(), deviceSecret = getDeviceSecret()): Promise<string | null> {
  const result = await getSessionTokenWithReason(accountId, deviceSecret);
  return result.ok ? result.token : null;
}

export async function getSessionTokenWithReason(
  accountId = getAccountId(),
  deviceSecret = getDeviceSecret()
): Promise<SessionResult> {
  if (!WORKER_URL) return { ok: false, reason: 'unknown' };

  const deviceSecretHash = await getDeviceSecretHash(deviceSecret);
  if (
    cachedToken &&
    cachedAccountId === accountId &&
    cachedExpiry - Date.now() > SESSION_REFRESH_WINDOW_MS
  ) {
    return { ok: true, token: cachedToken };
  }

  const registration = await registerAccountWithReason(accountId, deviceSecret);
  if (!registration.ok) return { ok: false, reason: registration.reason };

  const timestamp = Date.now();
  const proof = await sha256Hex(`${deviceSecretHash}${timestamp}`);

  try {
    const response = await fetch(`${WORKER_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, timestamp, proof }),
    });

    if (!response.ok) {
      const reason = mapHttpError(response.status);
      console.warn(`[sessionManager] getSessionToken failed: HTTP ${response.status} ${response.statusText} (${reason})`);
      return { ok: false, reason };
    }

    const data = (await response.json()) as { token?: string; expiresAt?: number; expiresIn?: number };
    if (!data.token) return { ok: false, reason: 'unknown' };

    cachedToken = data.token;
    cachedAccountId = accountId;
    cachedExpiry =
      typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt)
        ? data.expiresAt
        : parseTokenExpiry(data.token) || Date.now() + (data.expiresIn ?? 3600) * 1000;

    return { ok: true, token: cachedToken };
  } catch {
    return { ok: false, reason: mapFetchError() };
  }
}

export async function buildAuthHeaders(
  accountId = getAccountId(),
  deviceSecret = getDeviceSecret()
): Promise<AuthHeadersResult> {
  const result = await getSessionTokenWithReason(accountId, deviceSecret);
  if (!result.ok) return { ok: false, reason: result.reason };

  return {
    ok: true,
    headers: {
      'X-Device-ID': accountId,
      'X-Session-Token': result.token,
    },
  };
}

export function getLastAuthFailure(): AuthFailureReason | null {
  return lastAuthFailure;
}

export function clearSessionCache(): void {
  clearCachedSessionToken();
}

export function clearRegistrationCache(accountId?: string): void {
  if (accountId) {
    registeredAccounts.delete(accountId);
    registrationRequests.delete(accountId);

    for (const cacheKey of registeredAccounts) {
      if (cacheKey.startsWith(`${accountId}:`)) {
        registeredAccounts.delete(cacheKey);
      }
    }

    for (const cacheKey of registrationRequests.keys()) {
      if (cacheKey.startsWith(`${accountId}:`)) {
        registrationRequests.delete(cacheKey);
      }
    }

    if (cachedAccountId === accountId) {
      clearCachedSessionToken();
    }
    return;
  }

  registeredAccounts.clear();
  registrationRequests.clear();
  clearCachedSessionToken();
}

export function getLastDeviceCount(): number | null {
  return lastDeviceCount;
}

export function getSyncWorkerUrl(): string {
  return WORKER_URL;
}
