import { jsonErr, jsonOk } from '../lib/json';
import { getAuthenticatedAccountId } from '../lib/auth';
import { decryptToken } from '../lib/crypto';

export interface Env {
  DB: D1Database;
  RECEIPT_SECRET: string;
  PLAID_TOKEN_KEY: string;
  PLAID_TOKEN_KEY_V2?: string;
  EXTRA_ALLOWED_ORIGINS?: string;
}

export async function readPlaidAccessToken(accountId: string, env: Env): Promise<string | null> {
  const connection = await env.DB.prepare(
    'SELECT access_token, access_token_ciphertext, access_token_kid FROM plaid_connections WHERE account_id = ? AND is_active = 1'
  )
    .bind(accountId)
    .first() as { access_token?: string | null; access_token_ciphertext?: string | null; access_token_kid?: number | null } | null;

  if (!connection) return null;

  if (connection.access_token_ciphertext) {
    try {
      return await decryptToken(connection.access_token_ciphertext, env);
    } catch (error) {
      console.error(JSON.stringify({ event: 'plaid_decrypt_failed', accountId, error: error instanceof Error ? error.message : String(error) }));
      throw error;
    }
  }

  if (connection.access_token) {
    console.warn(JSON.stringify({ event: 'legacy_plaintext_read', accountId }));
    return connection.access_token;
  }

  return null;
}

// GET /api/plaid/status - returns connection status for this account
export async function handlePlaidStatus(request: Request, env: Env): Promise<Response> {
  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  const connection = await env.DB.prepare(
    'SELECT institution_name, last_synced_at FROM plaid_connections WHERE account_id = ? AND is_active = 1'
  )
    .bind(accountId)
    .first() as { institution_name?: unknown; last_synced_at?: unknown } | null;

  return jsonOk(request, {
    connected: Boolean(connection),
    institutionName: typeof connection?.institution_name === 'string' ? connection.institution_name : null,
    lastSynced: typeof connection?.last_synced_at === 'number' ? connection.last_synced_at : null,
  }, 200, env);
}

// POST /api/plaid/disconnect - revokes connection and deletes all plaid data
export async function handlePlaidDisconnect(request: Request, env: Env): Promise<Response> {
  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  await Promise.all([
    env.DB.prepare('DELETE FROM plaid_transactions WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM plaid_connections WHERE account_id = ?').bind(accountId).run(),
  ]);

  return jsonOk(request, { disconnected: true }, 200, env);
}
