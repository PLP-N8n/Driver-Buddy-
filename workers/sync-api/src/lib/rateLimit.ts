const WINDOW_MS = 60_000;

function getClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (!forwardedFor) {
    return 'unknown';
  }

  const [firstIp = 'unknown'] = forwardedFor.split(',');
  return firstIp.trim() || 'unknown';
}

export async function checkRateLimit(
  request: Request,
  endpoint: string,
  db: D1Database,
  maxAttempts = 10
): Promise<{ limited: boolean }> {
  const ip = getClientIp(request);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  await db.prepare('DELETE FROM rate_limit_log WHERE attempted_at < ?').bind(windowStart).run();

  const result = await db
    .prepare('SELECT COUNT(*) as count FROM rate_limit_log WHERE ip = ? AND endpoint = ? AND attempted_at >= ?')
    .bind(ip, endpoint, windowStart)
    .first();

  const countResult = result as { count?: number | string } | null;

  if (Number(countResult?.count ?? 0) >= maxAttempts) {
    return { limited: true };
  }

  await db.prepare('INSERT INTO rate_limit_log (ip, endpoint, attempted_at) VALUES (?, ?, ?)').bind(ip, endpoint, now).run();

  return { limited: false };
}
