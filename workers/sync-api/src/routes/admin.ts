import { encryptToken } from '../lib/crypto';
import { jsonErr, jsonOk } from '../lib/json';

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  PLAID_TOKEN_KEY: string;
  PLAID_TOKEN_KEY_V2?: string;
  EXTRA_ALLOWED_ORIGINS?: string;
}

type PlaidPlaintextRow = {
  account_id: string;
  access_token: string;
};

export async function handleBackfillPlaidEncryption(request: Request, env: Env): Promise<Response> {
  const expectedAuth = `Bearer ${env.ADMIN_TOKEN}`;
  if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== expectedAuth) {
    return jsonErr(request, 'unauthorized', 401, env);
  }

  const rows = await env.DB.prepare(
    'SELECT account_id, access_token FROM plaid_connections WHERE access_token IS NOT NULL AND access_token_ciphertext IS NULL LIMIT 100'
  ).all();

  const plaintextRows = (rows.results ?? []) as PlaidPlaintextRow[];
  for (const row of plaintextRows) {
    const ciphertext = await encryptToken(row.access_token, env);
    await env.DB.prepare(
      'UPDATE plaid_connections SET access_token_ciphertext = ?, access_token_kid = 1, access_token = NULL WHERE account_id = ?'
    )
      .bind(ciphertext, row.account_id)
      .run();
  }

  const remainingRow = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM plaid_connections WHERE access_token IS NOT NULL AND access_token_ciphertext IS NULL'
  ).first();
  const remaining = Number((remainingRow as { count?: number | string } | null)?.count ?? 0);

  return jsonOk(request, { migrated: plaintextRows.length, remaining }, 200, env);
}
