const ALLOWED_ORIGINS = [
  'https://drivertax.rudradigital.uk',
  'https://drivertax.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
// CF Pages preview deployments (e.g. 5090c998.drivertax.pages.dev)
const PAGES_PREVIEW_RE = /^https:\/\/[a-f0-9]+\.drivertax\.pages\.dev$/;

type CorsEnv = {
  EXTRA_ALLOWED_ORIGINS?: string;
};

const CORS_ALLOW_METHODS = 'GET, POST, DELETE, OPTIONS';
const CORS_ALLOW_HEADERS = 'Content-Type, X-Device-ID, X-Session-Token, Authorization, sentry-trace, baggage';

// CORS policy:
// - Methods cover health reads, sync/auth/plaid/receipt writes, device deletion, and browser preflight.
// - Headers cover JSON bodies, auth/session tokens, device identity, and admin bearer auth.
// - Unknown origins receive only Vary: Origin so browsers block access without a production fallback.

function getAllowedOrigins(env?: CorsEnv): Set<string> {
  return new Set([
    ...ALLOWED_ORIGINS,
    ...(env?.EXTRA_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? []),
  ]);
}

export function isAllowedOrigin(origin: string, env?: CorsEnv): boolean {
  return getAllowedOrigins(env).has(origin) || PAGES_PREVIEW_RE.test(origin);
}

function logDeniedOrigin(request: Request, origin: string): void {
  if (!origin) return;
  console.log(JSON.stringify({ event: 'cors_denied', origin, path: new URL(request.url).pathname }));
}

export function getCorsHeaders(request: Request, env?: CorsEnv): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  if (!origin || !isAllowedOrigin(origin, env)) {
    logDeniedOrigin(request, origin);
    return { Vary: 'Origin' };
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
    'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
    Vary: 'Origin',
  };
}

function mergeVaryHeader(existing: string | null, next: string): string {
  if (!existing) return next;

  const values = new Set(
    existing
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

  next
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => values.add(value));

  return Array.from(values).join(', ');
}

export function withCorsHeaders(request: Request, response: Response, env?: CorsEnv): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = getCorsHeaders(request, env);

  Object.entries(corsHeaders).forEach(([key, value]) => {
    if (key.toLowerCase() === 'vary') {
      headers.set(key, mergeVaryHeader(headers.get(key), value));
      return;
    }

    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handleOptions(request: Request, env?: CorsEnv): Response {
  const origin = request.headers.get('Origin') ?? '';
  if (!origin || !isAllowedOrigin(origin, env)) {
    logDeniedOrigin(request, origin);
    return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
  }

  return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
}
