import { verifySessionToken } from './session';

export interface AuthEnv {
  DB: D1Database;
  SESSION_SECRET: string;
}

const SHA256_HEX_RE = /^[a-fA-F0-9]{64}$/;

type BoundSession = {
  sub: string;
  deviceSecretHash: string;
};

function getBoundSession(payload: unknown): BoundSession | null {
  if (!payload || typeof payload !== 'object') return null;

  const { sub, deviceSecretHash } = payload as Partial<BoundSession>;
  if (typeof sub !== 'string' || typeof deviceSecretHash !== 'string') return null;
  if (!SHA256_HEX_RE.test(deviceSecretHash)) return null;

  return { sub, deviceSecretHash: deviceSecretHash.toLowerCase() };
}

async function hasRegisteredDevice(accountId: string, deviceSecretHash: string, env: AuthEnv): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 FROM account_devices WHERE account_id = ? AND device_secret_hash = ? LIMIT 1'
  )
    .bind(accountId, deviceSecretHash)
    .first();
  return Boolean(row);
}

export async function getAuthenticatedAccountId(request: Request, env: AuthEnv): Promise<string | null> {
  const sessionHeader = request.headers.get('X-Session-Token');
  if (sessionHeader) {
    const session = getBoundSession(await verifySessionToken(sessionHeader, env.SESSION_SECRET));
    if (session && await hasRegisteredDevice(session.sub, session.deviceSecretHash, env)) {
      return session.sub;
    }
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const session = getBoundSession(await verifySessionToken(token, env.SESSION_SECRET));
  if (!session) return null;

  return await hasRegisteredDevice(session.sub, session.deviceSecretHash, env) ? session.sub : null;
}
