import { getCorsHeaders } from '../lib/cors';
import { jsonErr, jsonOk } from '../lib/json';
import { checkRateLimit } from '../lib/rateLimit';
import { verifySessionToken } from '../lib/session';

type ReceiptBucket = R2Bucket & {
  createPresignedUrl?: (
    key: string,
    options: { expiresIn: number; httpMethod: 'GET' | 'PUT' }
  ) => Promise<string>;
};

export interface Env {
  DB: D1Database;
  RECEIPTS: R2Bucket;
  RECEIPT_SECRET: string;
  EXTRA_ALLOWED_ORIGINS?: string;
}

async function getSessionAccount(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get('X-Session-Token');
  if (!token) return null;
  const payload = await verifySessionToken(token, env.RECEIPT_SECRET);
  return payload?.sub ?? null;
}

function withReceiptPrefix(accountId: string, key: string): boolean {
  return key.startsWith(`receipts/${accountId}/`);
}

function presignUnavailable(
  request: Request,
  env: Env,
  key: string,
  field: 'uploadUrl' | 'url'
): Response {
  return new Response(
    JSON.stringify({ error: 'presigned_urls_unavailable', retryAfter: 86400, key, [field]: '' }),
    {
      status: 503,
      headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json', 'Retry-After': '86400' },
    }
  );
}

export async function handleRequestUpload(request: Request, env: Env): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'receipts', env.DB);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  let body: { filename?: string; contentType?: string };
  try {
    body = (await request.json()) as { filename?: string; contentType?: string };
  } catch {
    return jsonErr(request, 'invalid json', 400, env);
  }

  if (!body.filename || !body.contentType) return jsonErr(request, 'filename and contentType required', 400, env);

  const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const key = `receipts/${accountId}/${Date.now()}_${safeName}`;
  const bucket = env.RECEIPTS as ReceiptBucket;
  if (typeof bucket.createPresignedUrl !== 'function') return presignUnavailable(request, env, key, 'uploadUrl');

  const uploadUrl = await bucket.createPresignedUrl(key, { expiresIn: 3600, httpMethod: 'PUT' });
  return jsonOk(request, { uploadUrl, key }, 200, env);
}

export async function handleGetReceipt(request: Request, env: Env, key: string): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'receipts', env.DB);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);
  if (!withReceiptPrefix(accountId, key)) return jsonErr(request, 'forbidden', 403, env);

  const object = await env.RECEIPTS.get(key);
  if (!object) return jsonErr(request, 'not found', 404, env);

  const bucket = env.RECEIPTS as ReceiptBucket;
  if (typeof bucket.createPresignedUrl !== 'function') {
    const headers = new Headers(getCorsHeaders(request, env));
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  }

  const url = await bucket.createPresignedUrl(key, { expiresIn: 900, httpMethod: 'GET' });
  return jsonOk(request, { url, key }, 200, env);
}

export async function handleDeleteReceipt(request: Request, env: Env, key: string): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'receipts', env.DB);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);
  if (!withReceiptPrefix(accountId, key)) return jsonErr(request, 'forbidden', 403, env);
  await env.RECEIPTS.delete(key);
  return jsonOk(request, { deleted: true }, 200, env);
}

export async function handleMigrateLegacy(request: Request, env: Env): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'receipts', env.DB);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  let body: { legacyUrl?: string };
  try {
    body = (await request.json()) as { legacyUrl?: string };
  } catch {
    return jsonErr(request, 'invalid json', 400, env);
  }

  if (!body.legacyUrl) return jsonErr(request, 'legacyUrl required', 400, env);

  try {
    const legacyUrl = new URL(body.legacyUrl);
    const [, encodedKey = ''] = legacyUrl.pathname.split('/api/receipts/');
    const key = decodeURIComponent(encodedKey);
    if (!withReceiptPrefix(accountId, key)) return jsonErr(request, 'forbidden', 403, env);
    return (await env.RECEIPTS.head(key))
      ? jsonOk(request, { key, message: 'use GET /api/receipts/:key with session token' }, 200, env)
      : jsonErr(request, 'receipt not found in R2', 404, env);
  } catch {
    return jsonErr(request, 'invalid URL', 400, env);
  }
}
