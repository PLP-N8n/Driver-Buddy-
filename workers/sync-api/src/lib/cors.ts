const ALLOWED_ORIGINS = [
  'https://drivertax.rudradigital.uk',
  'https://drivertax.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
const DEFAULT_ALLOWED_ORIGIN = 'https://drivertax.rudradigital.uk';

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : DEFAULT_ALLOWED_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-ID, X-Session-Token, Authorization',
    Vary: 'Origin',
  };
}

export function handleOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}
