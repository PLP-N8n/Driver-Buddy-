import { getAuthenticatedAccountId } from '../lib/auth';
import { getCorsHeaders } from '../lib/cors';
import { jsonErr, jsonOk } from '../lib/json';
import { checkRateLimit } from '../lib/rateLimit';

type ReceiptBucket = R2Bucket & {
  createPresignedUrl?: (
    key: string,
    options: { expiresIn: number; httpMethod: 'GET' | 'PUT' }
  ) => Promise<string>;
};

export interface Env {
  DB: D1Database;
  RECEIPTS: R2Bucket;
  SESSION_SECRET: string;
  EXTRA_ALLOWED_ORIGINS?: string;
}

const RECEIPT_KEY_RE = /^receipts\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+$/;

export function isValidReceiptKey(key: string): boolean {
  return RECEIPT_KEY_RE.test(key) && !key.includes('..') && !key.includes('//');
}

function withReceiptPrefix(accountId: string, key: string): boolean {
  return isValidReceiptKey(key) && key.startsWith(`receipts/${accountId}/`);
}

function presignUnavailable(
  request: Request,
  env: Env,
  key: string,
  field: 'uploadUrl' | 'url',
  contentType?: string
): Response {
  return new Response(
    JSON.stringify({
      error: 'presigned_urls_unavailable',
      retryAfter: 86400,
      key,
      [field]: '',
      maxBytes: MAX_RECEIPT_BYTES,
      contentType,
    }),
    {
      status: 503,
      headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json', 'Retry-After': '86400' },
    }
  );
}

const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const BLOCKED_RECEIPT_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
]);

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB

export async function handleRequestUpload(request: Request, env: Env): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'receipts', env.DB);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  let body: { filename?: string; contentType?: string; byteSize?: number };
  try {
    body = (await request.json()) as { filename?: string; contentType?: string; byteSize?: number };
  } catch {
    return jsonErr(request, 'invalid json', 400, env);
  }

  if (!body.filename || !body.contentType) return jsonErr(request, 'filename and contentType required', 400, env);

  const contentType = body.contentType.toLowerCase().trim();
  if (BLOCKED_RECEIPT_TYPES.has(contentType)) {
    return jsonErr(request, 'receipt type not allowed', 400, env);
  }
  if (!ALLOWED_RECEIPT_TYPES.has(contentType)) {
    return jsonErr(request, 'receipt type not allowed', 400, env);
  }

  const byteSize = typeof body.byteSize === 'number' && Number.isFinite(body.byteSize) ? body.byteSize : null;
  if (byteSize !== null && byteSize > MAX_RECEIPT_BYTES) {
    return jsonErr(request, 'receipt exceeds 5 MB limit', 400, env);
  }

  const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const extMatch = safeName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch && extMatch[1] ? extMatch[1].toLowerCase() : '';
  const typeExtMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  };
  const expectedExt = typeExtMap[contentType];
  const keyExt = ext === expectedExt ? ext : expectedExt;
  const baseName = extMatch ? safeName.slice(0, -extMatch[0].length) : safeName;
  const key = `receipts/${accountId}/${Date.now()}_${baseName.slice(0, 100)}.${keyExt}`;

  const bucket = env.RECEIPTS as ReceiptBucket;
  if (typeof bucket.createPresignedUrl !== 'function') return presignUnavailable(request, env, key, 'uploadUrl', contentType);

  const uploadUrl = await bucket.createPresignedUrl(key, { expiresIn: 3600, httpMethod: 'PUT' });
  return jsonOk(request, { uploadUrl, key, maxBytes: MAX_RECEIPT_BYTES, contentType }, 200, env);
}

export async function handleGetReceipt(request: Request, env: Env, key: string): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'receipts', env.DB);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);
  if (!isValidReceiptKey(key)) return jsonErr(request, 'invalid receipt key', 400, env);
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

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);
  if (!isValidReceiptKey(key)) return jsonErr(request, 'invalid receipt key', 400, env);
  if (!withReceiptPrefix(accountId, key)) return jsonErr(request, 'forbidden', 403, env);
  await env.RECEIPTS.delete(key);
  return jsonOk(request, { deleted: true }, 200, env);
}

export async function handleMigrateLegacy(request: Request, env: Env): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'receipts', env.DB);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const accountId = await getAuthenticatedAccountId(request, env);
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
    if (!isValidReceiptKey(key)) return jsonErr(request, 'invalid receipt key', 400, env);
    if (!withReceiptPrefix(accountId, key)) return jsonErr(request, 'forbidden', 403, env);
    return (await env.RECEIPTS.head(key))
      ? jsonOk(request, { key, message: 'use GET /api/receipts/:key with session token' }, 200, env)
      : jsonErr(request, 'receipt not found in R2', 404, env);
  } catch {
    return jsonErr(request, 'invalid URL', 400, env);
  }
}
