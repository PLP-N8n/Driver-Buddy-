import { getAccountId, getDeviceSecret } from './deviceId';

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const WORKER_URL = env?.VITE_SYNC_WORKER_URL ?? '';
const SESSION_REFRESH_WINDOW_MS = 5 * 60_000;

let cachedToken: string | null = null;
let cachedAccountId: string | null = null;
let cachedExpiry = 0;
let lastDeviceCount: number | null = null;

const registeredAccounts = new Set<string>();
const registrationRequests = new Map<string, Promise<boolean>>();

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

export async function getDeviceSecretHash(deviceSecret = getDeviceSecret()): Promise<string> {
  return sha256Hex(deviceSecret);
}

async function registerAccount(accountId: string, deviceSecret = getDeviceSecret()): Promise<boolean> {
  if (!WORKER_URL) return false;
  const cacheKey = `${accountId}:${await getDeviceSecretHash(deviceSecret)}`;
  if (registeredAccounts.has(cacheKey)) return true;

  const pendingRequest = registrationRequests.get(cacheKey);
  if (pendingRequest) return pendingRequest;

  const request = (async () => {
    const deviceSecretHash = await getDeviceSecretHash(deviceSecret);
    const response = await fetch(`${WORKER_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, deviceSecretHash }),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json().catch(() => ({}))) as { deviceCount?: number };
    lastDeviceCount = typeof data.deviceCount === 'number' && Number.isFinite(data.deviceCount) ? data.deviceCount : null;
    registeredAccounts.add(cacheKey);
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      registrationRequests.delete(cacheKey);
    });

  registrationRequests.set(cacheKey, request);
  return request;
}

export async function getSessionToken(accountId = getAccountId(), deviceSecret = getDeviceSecret()): Promise<string | null> {
  if (!WORKER_URL) return null;

  const deviceSecretHash = await getDeviceSecretHash(deviceSecret);
  if (
    cachedToken &&
    cachedAccountId === accountId &&
    cachedExpiry - Date.now() > SESSION_REFRESH_WINDOW_MS
  ) {
    return cachedToken;
  }

  const registered = await registerAccount(accountId, deviceSecret);
  if (!registered) return null;

  const timestamp = Date.now();
  const proof = await sha256Hex(`${deviceSecretHash}${timestamp}`);

  try {
    const response = await fetch(`${WORKER_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, timestamp, proof }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { token?: string; expiresAt?: number; expiresIn?: number };
    if (!data.token) return null;

    cachedToken = data.token;
    cachedAccountId = accountId;
    cachedExpiry =
      typeof data.expiresAt === 'number' && Number.isFinite(data.expiresAt)
        ? data.expiresAt
        : parseTokenExpiry(data.token) || Date.now() + (data.expiresIn ?? 3600) * 1000;

    return cachedToken;
  } catch {
    return null;
  }
}

export async function buildAuthHeaders(
  accountId = getAccountId(),
  deviceSecret = getDeviceSecret()
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'X-Device-ID': accountId,
  };

  const token = await getSessionToken(accountId, deviceSecret);
  if (token) {
    headers['X-Session-Token'] = token;
  }

  return headers;
}

export function clearSessionCache(): void {
  cachedToken = null;
  cachedAccountId = null;
  cachedExpiry = 0;
}

export function clearRegistrationCache(accountId?: string): void {
  if (accountId) {
    registeredAccounts.delete(accountId);
    registrationRequests.delete(accountId);
    return;
  }

  registeredAccounts.clear();
  registrationRequests.clear();
}

export function getLastDeviceCount(): number | null {
  return lastDeviceCount;
}

export function getSyncWorkerUrl(): string {
  return WORKER_URL;
}
