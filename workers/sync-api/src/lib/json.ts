import { getCorsHeaders } from './cors';

type JsonEnv = {
  EXTRA_ALLOWED_ORIGINS?: string;
};

export function jsonOk(request: Request, data: unknown, status = 200, env?: JsonEnv): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
  });
}

export function jsonErr(request: Request, message: string, status = 400, env?: JsonEnv): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
  });
}

export function jsonErrWithRetry(
  request: Request,
  message: string,
  status: number,
  retryAfter: number | undefined,
  env?: JsonEnv
): Response {
  const headers = {
    ...getCorsHeaders(request, env),
    'Content-Type': 'application/json',
    ...(Number.isFinite(retryAfter) ? { 'Retry-After': String(Math.max(1, Math.min(60, Number(retryAfter)))) } : {}),
  };

  return new Response(JSON.stringify({ error: message }), { status, headers });
}
