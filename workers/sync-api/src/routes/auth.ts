import { jsonErr, jsonOk } from '../lib/json';
import { issueSessionToken } from '../lib/session';

export interface Env {
  DB: D1Database;
  RECEIPT_SECRET: string;
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
  let body: AuthRegisterBody;

  try {
    body = (await request.json()) as AuthRegisterBody;
  } catch {
    return jsonErr('invalid json');
  }

  if (!body.accountId || typeof body.accountId !== 'string') {
    return jsonErr('accountId required');
  }

  if (!ACCOUNT_ID_RE.test(body.accountId)) {
    return jsonErr('invalid accountId');
  }

  if (!body.deviceSecretHash || typeof body.deviceSecretHash !== 'string') {
    return jsonErr('deviceSecretHash required');
  }

  if (!SHA256_HEX_RE.test(body.deviceSecretHash)) {
    return jsonErr('invalid deviceSecretHash');
  }

  await env.DB.prepare(
    'INSERT INTO device_secrets (account_id, device_secret_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(account_id) DO NOTHING'
  )
    .bind(body.accountId, body.deviceSecretHash.toLowerCase(), Date.now())
    .run();

  return jsonOk({ registered: true });
}

export async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  let body: AuthSessionBody;

  try {
    body = (await request.json()) as AuthSessionBody;
  } catch {
    return jsonErr('invalid json');
  }

  if (!body.accountId || typeof body.accountId !== 'string') {
    return jsonErr('accountId required');
  }

  if (!ACCOUNT_ID_RE.test(body.accountId)) {
    return jsonErr('invalid accountId');
  }

  if (typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp)) {
    return jsonErr('invalid timestamp');
  }

  if (Math.abs(Date.now() - body.timestamp) >= 300_000) {
    return jsonErr('invalid timestamp');
  }

  if (!body.proof || typeof body.proof !== 'string') {
    return jsonErr('proof required');
  }

  if (!SHA256_HEX_RE.test(body.proof)) {
    return jsonErr('invalid proof');
  }

  const registration = await env.DB.prepare(
    'SELECT device_secret_hash FROM device_secrets WHERE account_id = ?'
  )
    .bind(body.accountId)
    .first();

  const deviceRegistration = registration as { device_secret_hash: string } | null;

  if (!deviceRegistration?.device_secret_hash) {
    return jsonErr('not registered', 401);
  }

  const expectedProof = await sha256Hex(`${deviceRegistration.device_secret_hash}${body.timestamp}`);
  if (expectedProof !== body.proof.toLowerCase()) {
    return jsonErr('unauthorized', 401);
  }

  const token = await issueSessionToken(body.accountId, env.RECEIPT_SECRET);
  return jsonOk({ token, expiresIn: 3600 });
}
