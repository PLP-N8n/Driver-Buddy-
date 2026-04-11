import { CORS_HEADERS } from '../lib/cors';
import { jsonErr, jsonOk } from '../lib/json';
import { verifySessionToken } from '../lib/session';

type ReceiptBucket = R2Bucket & {
  createPresignedUrl?: (
    key: string,
    options: { expiresIn: number; httpMethod: 'GET' | 'PUT' }
  ) => Promise<string>;
};

export interface Env {
  RECEIPTS: R2Bucket;
  RECEIPT_SECRET: string;
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

function presignUnavailable(key: string, field: 'uploadUrl' | 'url'): Response {
  // TODO: implement R2 presigned URLs when available
  return jsonOk({ [field]: '', key, message: 'TODO: implement R2 presigned URLs when available' }, 501);
}

export async function handleRequestUpload(request: Request, env: Env): Promise<Response> {
  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr('unauthorized', 401);

  let body: { filename?: string; contentType?: string };
  try {
    body = (await request.json()) as { filename?: string; contentType?: string };
  } catch {
    return jsonErr('invalid json');
  }

  if (!body.filename || !body.contentType) return jsonErr('filename and contentType required');

  const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const key = `receipts/${accountId}/${Date.now()}_${safeName}`;
  const bucket = env.RECEIPTS as ReceiptBucket;
  if (typeof bucket.createPresignedUrl !== 'function') return presignUnavailable(key, 'uploadUrl');

  const uploadUrl = await bucket.createPresignedUrl(key, { expiresIn: 3600, httpMethod: 'PUT' });
  return jsonOk({ uploadUrl, key });
}

export async function handleGetReceipt(request: Request, env: Env, key: string): Promise<Response> {
  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr('unauthorized', 401);
  if (!withReceiptPrefix(accountId, key)) return jsonErr('forbidden', 403);

  const object = await env.RECEIPTS.get(key);
  if (!object) return jsonErr('not found', 404);

  const bucket = env.RECEIPTS as ReceiptBucket;
  if (typeof bucket.createPresignedUrl !== 'function') {
    const headers = new Headers(CORS_HEADERS);
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  }

  const url = await bucket.createPresignedUrl(key, { expiresIn: 900, httpMethod: 'GET' });
  return jsonOk({ url, key });
}

export async function handleDeleteReceipt(request: Request, env: Env, key: string): Promise<Response> {
  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr('unauthorized', 401);
  if (!withReceiptPrefix(accountId, key)) return jsonErr('forbidden', 403);
  await env.RECEIPTS.delete(key);
  return jsonOk({ deleted: true });
}

export async function handleMigrateLegacy(request: Request, env: Env): Promise<Response> {
  const accountId = await getSessionAccount(request, env);
  if (!accountId) return jsonErr('unauthorized', 401);

  let body: { legacyUrl?: string };
  try {
    body = (await request.json()) as { legacyUrl?: string };
  } catch {
    return jsonErr('invalid json');
  }

  if (!body.legacyUrl) return jsonErr('legacyUrl required');

  try {
    const legacyUrl = new URL(body.legacyUrl);
    const [, encodedKey = ''] = legacyUrl.pathname.split('/api/receipts/');
    const key = decodeURIComponent(encodedKey);
    if (!withReceiptPrefix(accountId, key)) return jsonErr('forbidden', 403);
    return (await env.RECEIPTS.head(key)) ? jsonOk({ key, message: 'use GET /api/receipts/:key with session token' }) : jsonErr('receipt not found in R2', 404);
  } catch {
    return jsonErr('invalid URL');
  }
}
