export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-ID, X-Session-Token, Authorization',
};

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
