import { jsonErr, jsonErrWithRetry, jsonOk } from '../lib/json';
import { checkRateLimit } from '../lib/rateLimit';
import { issueSessionToken } from '../lib/session';
import { getAuthenticatedAccountId } from '../lib/auth';

export interface Env {
  DB: D1Database;
  RECEIPT_SECRET: string;
  EXTRA_ALLOWED_ORIGINS?: string;
}

type AuthRegisterBody = {
  accountId?: string;
  deviceSecretHash?: string;
};

type AuthSessionBody = {
  accountId?: string;
  timestamp?: number;
  proof?: string;
};

const ACCOUNT_ID_RE = /^[a-zA-Z0-9-]{6,36}$/;
const SHA256_HEX_RE = /^[a-fA-F0-9]{64}$/;

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleAuthRegister(request: Request, env: Env): Promise<Response> {
  const { limited, retryAfter } = await checkRateLimit(request, 'auth_register', env.DB, 5);
  if (limited) return jsonErrWithRetry(request, 'too many requests', 429, retryAfter, env);

  let body: AuthRegisterBody;

  try {
    body = (await request.json()) as AuthRegisterBody;
  } catch {
    return jsonErr(request, 'invalid json', 400, env);
  }

  if (!body.accountId || typeof body.accountId !== 'string') {
    return jsonErr(request, 'accountId required', 400, env);
  }

  if (!ACCOUNT_ID_RE.test(body.accountId)) {
    return jsonErr(request, 'invalid accountId', 400, env);
  }

  if (!body.deviceSecretHash || typeof body.deviceSecretHash !== 'string') {
    return jsonErr(request, 'deviceSecretHash required', 400, env);
  }

  if (!SHA256_HEX_RE.test(body.deviceSecretHash)) {
    return jsonErr(request, 'invalid deviceSecretHash', 400, env);
  }

  const normalizedHash = body.deviceSecretHash.toLowerCase();
  const existingDevices = await env.DB.prepare(
    'SELECT device_secret_hash FROM account_devices WHERE account_id = ?'
  )
    .bind(body.accountId)
    .all();
  const deviceHashes = ((existingDevices.results ?? []) as Array<{ device_secret_hash: string }>)
    .map((row) => row.device_secret_hash.toLowerCase());

  if (deviceHashes.length > 0 && !deviceHashes.includes(normalizedHash)) {
    return jsonErr(request, 'account already has registered devices', 401, env);
  }

  await env.DB.prepare(
    "INSERT INTO account_devices (account_id, device_secret_hash, added_at, added_via) VALUES (?, ?, ?, 'register') ON CONFLICT(account_id, device_secret_hash) DO NOTHING"
  )
    .bind(body.accountId, normalizedHash, Date.now())
    .run();

  const countRow = await env.DB.prepare('SELECT COUNT(*) as count FROM account_devices WHERE account_id = ?')
    .bind(body.accountId)
    .first();
  const deviceCount = Number((countRow as { count?: number | string } | null)?.count ?? 0);

  return jsonOk(request, { registered: true, deviceCount }, 200, env);
}

export async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  let body: AuthSessionBody;

  try {
    body = (await request.json()) as AuthSessionBody;
  } catch {
    return jsonErr(request, 'invalid json', 400, env);
  }

  if (!body.accountId || typeof body.accountId !== 'string') {
    return jsonErr(request, 'accountId required', 400, env);
  }

  if (!ACCOUNT_ID_RE.test(body.accountId)) {
    return jsonErr(request, 'invalid accountId', 400, env);
  }

  if (typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp)) {
    return jsonErr(request, 'invalid timestamp', 400, env);
  }

  if (Math.abs(Date.now() - body.timestamp) >= 300_000) {
    return jsonErr(request, 'invalid timestamp', 400, env);
  }

  if (!body.proof || typeof body.proof !== 'string') {
    return jsonErr(request, 'proof required', 400, env);
  }

  if (!SHA256_HEX_RE.test(body.proof)) {
    return jsonErr(request, 'invalid proof', 400, env);
  }

  const sessionLimit = await checkRateLimit(request, 'auth_session', env.DB, 30, body.accountId);
  if (sessionLimit.limited) return jsonErrWithRetry(request, 'too many requests', 429, sessionLimit.retryAfter, env);

  const registrations = await env.DB.prepare(
    'SELECT device_secret_hash FROM account_devices WHERE account_id = ?'
  )
    .bind(body.accountId)
    .all();

  const deviceRegistrations = (registrations.results ?? []) as Array<{ device_secret_hash: string }>;

  if (deviceRegistrations.length === 0) {
    return jsonErr(request, 'not registered', 401, env);
  }

  let authorized = false;
  for (const registration of deviceRegistrations) {
    const expectedProof = await sha256Hex(`${registration.device_secret_hash}${body.timestamp}`);
    if (expectedProof === body.proof.toLowerCase()) {
      authorized = true;
      break;
    }
  }

  if (!authorized) {
    return jsonErr(request, 'unauthorized', 401, env);
  }

  const token = await issueSessionToken(body.accountId, env.RECEIPT_SECRET);
  return jsonOk(request, { token, expiresIn: 3600 }, 200, env);
}

export async function handleListDevices(request: Request, env: Env): Promise<Response> {
  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  const rows = await env.DB.prepare(
    'SELECT device_secret_hash, added_at, added_via FROM account_devices WHERE account_id = ? ORDER BY added_at ASC'
  )
    .bind(accountId)
    .all();

  const devices = ((rows.results ?? []) as Array<{ device_secret_hash: string; added_at: number; added_via: string }>).map((row) => ({
    deviceSecretHashSuffix: row.device_secret_hash.slice(-12),
    addedAt: row.added_at,
    addedVia: row.added_via,
  }));

  return jsonOk(request, { devices }, 200, env);
}

export async function handleDeleteDevice(request: Request, env: Env, hashSuffix: string): Promise<Response> {
  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);
  if (!/^[a-fA-F0-9]{12}$/.test(hashSuffix)) return jsonErr(request, 'invalid device suffix', 400, env);

  const matches = await env.DB.prepare(
    'SELECT device_secret_hash FROM account_devices WHERE account_id = ? AND substr(device_secret_hash, -12) = ? LIMIT 2'
  )
    .bind(accountId, hashSuffix.toLowerCase())
    .all();
  const devices = (matches.results ?? []) as Array<{ device_secret_hash: string }>;

  if (devices.length === 0) return jsonErr(request, 'device not found', 404, env);
  if (devices.length > 1) return jsonErr(request, 'ambiguous device suffix', 409, env);

  const [device] = devices;
  if (!device) return jsonErr(request, 'device not found', 404, env);

  await env.DB.prepare('DELETE FROM account_devices WHERE account_id = ? AND device_secret_hash = ?')
    .bind(accountId, device.device_secret_hash)
    .run();

  const countRow = await env.DB.prepare('SELECT COUNT(*) as count FROM account_devices WHERE account_id = ?')
    .bind(accountId)
    .first();
  const deviceCount = Number((countRow as { count?: number | string } | null)?.count ?? 0);

  return jsonOk(request, { deleted: true, deviceCount }, 200, env);
}
