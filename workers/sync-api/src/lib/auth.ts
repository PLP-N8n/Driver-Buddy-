import { verifySessionToken } from './session';

export interface AuthEnv {
  DB: D1Database;
  RECEIPT_SECRET: string;
}

async function hasRegisteredDevices(accountId: string, env: AuthEnv): Promise<boolean> {
  const countRow = await env.DB.prepare('SELECT COUNT(*) as count FROM account_devices WHERE account_id = ?')
    .bind(accountId)
    .first();
  return Number((countRow as { count?: number | string } | null)?.count ?? 0) > 0;
}

export async function getAuthenticatedAccountId(request: Request, env: AuthEnv): Promise<string | null> {
  const sessionHeader = request.headers.get('X-Session-Token');
  if (sessionHeader) {
    const payload = await verifySessionToken(sessionHeader, env.RECEIPT_SECRET);
    if (payload?.sub && await hasRegisteredDevices(payload.sub, env)) return payload.sub;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const payload = await verifySessionToken(token, env.RECEIPT_SECRET);
  if (!payload?.sub) return null;

  return await hasRegisteredDevices(payload.sub, env) ? payload.sub : null;
}
