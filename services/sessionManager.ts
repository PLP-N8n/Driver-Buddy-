import { getAccountId, getDeviceSecret } from './deviceId';

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const WORKER_URL = env?.VITE_SYNC_WORKER_URL ?? '';
const SESSION_REFRESH_WINDOW_MS = 5 * 60_000;

let cachedToken: string | null = null;
let cachedAccountId: string | null = null;
let cachedExpiry = 0;

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

async function getDeviceSecretHash(): Promise<string> {
  return sha256Hex(getDeviceSecret());
}

async function registerAccount(accountId: string): Promise<boolean> {
  if (!WORKER_URL) return false;
  if (registeredAccounts.has(accountId)) return true;

  const pendingRequest = registrationRequests.get(accountId);
  if (pendingRequest) return pendingRequest;

  const request = (async () => {
    const deviceSecretHash = await getDeviceSecretHash();
    const response = await fetch(`${WORKER_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, deviceSecretHash }),
    });

    if (!response.ok) {
      return false;
    }

    registeredAccounts.add(accountId);
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      registrationRequests.delete(accountId);
    });

  registrationRequests.set(accountId, request);
  return request;
}

export async function getSessionToken(accountId = getAccountId()): Promise<string | null> {
  if (!WORKER_URL) return null;

  if (
    cachedToken &&
    cachedAccountId === accountId &&
    cachedExpiry - Date.now() > SESSION_REFRESH_WINDOW_MS
  ) {
    return cachedToken;
  }

  const registered = await registerAccount(accountId);
  if (!registered) return null;

  const timestamp = Date.now();
  const deviceSecretHash = await getDeviceSecretHash();
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
  accountId = getAccountId()
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'X-Device-ID': accountId,
  };

  const token = await getSessionToken(accountId);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export function clearSessionCache(): void {
  cachedToken = null;
  cachedAccountId = null;
  cachedExpiry = 0;
}
