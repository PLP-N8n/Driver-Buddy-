import { jsonErr, jsonOk } from '../lib/json';
import { verifySessionToken } from '../lib/session';

export interface Env {
  DB: D1Database;
  RECEIPT_SECRET: string;
}

async function getAuthenticatedAccountId(request: Request, env: Env): Promise<string | null> {
  const sessionHeader = request.headers.get('X-Session-Token');
  if (sessionHeader) {
    const payload = await verifySessionToken(sessionHeader, env.RECEIPT_SECRET);
    if (payload?.sub) return payload.sub;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token, env.RECEIPT_SECRET);
  return payload?.sub ?? null;
}

// GET /api/plaid/status - returns connection status for this account
export async function handlePlaidStatus(request: Request, env: Env): Promise<Response> {
  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr('unauthorized', 401);

  const connection = await env.DB.prepare(
    'SELECT institution_name, last_synced_at FROM plaid_connections WHERE account_id = ? AND is_active = 1'
  )
    .bind(accountId)
    .first() as { institution_name?: unknown; last_synced_at?: unknown } | null;

  return jsonOk({
    connected: Boolean(connection),
    institutionName: typeof connection?.institution_name === 'string' ? connection.institution_name : null,
    lastSynced: typeof connection?.last_synced_at === 'number' ? connection.last_synced_at : null,
  });
}

// POST /api/plaid/disconnect - revokes connection and deletes all plaid data
export async function handlePlaidDisconnect(request: Request, env: Env): Promise<Response> {
  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr('unauthorized', 401);

  await Promise.all([
    env.DB.prepare('DELETE FROM plaid_transactions WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM plaid_connections WHERE account_id = ?').bind(accountId).run(),
  ]);

  return jsonOk({ disconnected: true });
}
