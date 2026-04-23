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
  maxAttempts = 10,
  accountId?: string
): Promise<{ limited: boolean; retryAfter?: number }> {
  const ip = getClientIp(request);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  await db.prepare('DELETE FROM rate_limit_log WHERE attempted_at < ?').bind(windowStart).run();

  const ipResult = await db
    .prepare('SELECT COUNT(*) as count, MIN(attempted_at) as oldest FROM rate_limit_log WHERE ip = ? AND endpoint = ? AND attempted_at >= ?')
    .bind(ip, endpoint, windowStart)
    .first();

  const ipCount = ipResult as { count?: number | string; oldest?: number | string } | null;

  if (Number(ipCount?.count ?? 0) >= maxAttempts) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - Number(ipCount?.oldest ?? now))) / 1000);
    console.log(JSON.stringify({ event: 'rate_limit_hit', endpoint, ip, accountId: accountId ?? null }));
    return { limited: true, retryAfter };
  }

  if (accountId) {
    const accountMaxAttempts = Math.max(maxAttempts, 60);
    const accountResult = await db
      .prepare(
        'SELECT COUNT(*) as count, MIN(attempted_at) as oldest FROM rate_limit_log WHERE account_id = ? AND endpoint = ? AND attempted_at >= ?'
      )
      .bind(accountId, endpoint, windowStart)
      .first();
    const accountCount = accountResult as { count?: number | string; oldest?: number | string } | null;

    if (Number(accountCount?.count ?? 0) >= accountMaxAttempts) {
      const retryAfter = Math.ceil((WINDOW_MS - (now - Number(accountCount?.oldest ?? now))) / 1000);
      console.log(JSON.stringify({ event: 'rate_limit_hit', endpoint, ip, accountId }));
      return { limited: true, retryAfter };
    }
  }

  await db
    .prepare('INSERT INTO rate_limit_log (ip, endpoint, attempted_at, account_id) VALUES (?, ?, ?, ?)')
    .bind(ip, endpoint, now, accountId ?? null)
    .run();

  return { limited: false };
}
