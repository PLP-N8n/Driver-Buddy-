# auth-rate-limiting — design

## Goal

Tighten the rate-limit story for the auth endpoints. The 2026-04-12 audit flagged "no rate limiting on auth endpoints"; that's already false (both `register` and `session` call `checkRateLimit(request, 'auth', env.DB)`). What's still missing is the right layering: per-endpoint buckets, a per-account bucket to defeat IP rotation, and `Retry-After` on 429s.

## Context

### Current implementation

`workers/sync-api/src/lib/rateLimit.ts` (45 lines):
- 60-second sliding window via D1 `rate_limit_log` table
- Per-IP, per-endpoint counter
- Single tunable `maxAttempts` parameter (default 10)
- Cleanup-on-write via `DELETE WHERE attempted_at < ?`
- Returns `{ limited: boolean }` only — no retry hint

`workers/sync-api/src/routes/auth.ts`:
- `handleAuthRegister` calls `checkRateLimit(request, 'auth', env.DB)` (default 10/min)
- `handleAuthSession` calls `checkRateLimit(request, 'auth', env.DB)` (default 10/min)
- Both share the `'auth'` bucket — register attempts eat into session capacity and vice versa

### What the audit missed

The endpoints **are** rate-limited; they're just rate-limited together, with limits that are wrong for each:
- 10/min is too generous for `register` (a one-off operation under normal use)
- 10/min is too tight for `session` (legitimate apps refresh on every cold start; 10 token refreshes per IP per minute can lock out a coffee shop)

### Why per-account limit matters

The rate limit is keyed only on `(ip, endpoint)`. An attacker with a botnet (or even a $5/month proxy rotation service) can issue thousands of session attempts per minute from different IPs against a single `accountId`, brute-forcing the HMAC proof against the device-secret hash. Adding `(accountId, endpoint)` as a second bucket caps the attack regardless of IP diversity.

## Approach

### Phase 1 — Schema migration

`workers/sync-api/migrations/0009_rate_limit_account.sql`:
- `ALTER TABLE rate_limit_log ADD COLUMN account_id TEXT` (nullable)
- `CREATE INDEX idx_rate_limit_account ON rate_limit_log(account_id, endpoint, attempted_at)` for the new query path

### Phase 2 — Update `checkRateLimit` signature

```
async function checkRateLimit(
  request: Request,
  endpoint: string,
  db: D1Database,
  maxAttempts = 10,
  accountId?: string,
): Promise<{ limited: boolean; retryAfter?: number }>
```

Behaviour:
1. Cleanup expired rows (existing).
2. SELECT count WHERE (ip, endpoint, attempted_at >= windowStart). If ≥ maxAttempts → return `{ limited: true, retryAfter: <oldest-row-age remaining> }`.
3. If `accountId` provided: SELECT count WHERE (account_id, endpoint, attempted_at >= windowStart). Use a HIGHER threshold (`maxAttempts * 2` or explicit param). If exceeded → return `{ limited: true, retryAfter: ... }`.
4. INSERT new row with both `ip` and `accountId` (nullable).

Compute `retryAfter`: SELECT MIN(attempted_at) FROM the violating bucket → `Math.ceil((WINDOW_MS - (now - oldest)) / 1000)`.

### Phase 3 — Update auth routes

`workers/sync-api/src/routes/auth.ts`:

`handleAuthRegister`:
```
const { limited, retryAfter } = await checkRateLimit(request, 'auth_register', env.DB, 5);
if (limited) return jsonErrWithRetry(request, 'too many requests', 429, retryAfter);
```

`handleAuthSession`:
```
// IP bucket
let { limited, retryAfter } = await checkRateLimit(request, 'auth_session', env.DB, 30);
if (limited) return jsonErrWithRetry(request, 'too many requests', 429, retryAfter);
// account bucket — only after we know the accountId
({ limited, retryAfter } = await checkRateLimit(request, 'auth_session', env.DB, 60, body.accountId));
if (limited) return jsonErrWithRetry(request, 'too many requests', 429, retryAfter);
```

### Phase 4 — `jsonErrWithRetry` helper

Extend `workers/sync-api/src/lib/json.ts` (or add a sibling helper) with:
```
function jsonErrWithRetry(request, message, status, retryAfter)
```
Same as `jsonErr` but adds `Retry-After: <retryAfter>` header.

### Phase 5 — Structured logging

Inside `checkRateLimit`, on `limited: true`:
```
console.log(JSON.stringify({ event: 'rate_limit_hit', endpoint, ip, accountId }));
```

### Phase 6 — Tests with mocked clock

`workers/sync-api/test/auth-rate-limit.test.ts`:
- Use a Miniflare-style fixture with an in-memory D1
- Helper `advanceClock(ms)` that monkey-patches `Date.now` (or uses vitest fake timers)
- Cases per R6

## Out of scope

- Distributed rate limiting via Cloudflare's built-in Rate Limiting product (would need WAF rules; D1 sliding window is fine for current scale).
- IP-based geographic blocking.
- CAPTCHA / proof-of-work for high-volume requests.
- Per-user customisable limits (e.g., trusted accounts get higher quota).
- Permanent IP blocking after repeated 429s.

## Testing

1. Unit (vitest): `workers/sync-api/test/auth-rate-limit.test.ts` per R6.
2. Migration test: apply 0009 to a copy of dev D1, assert `account_id` column present.
3. Manual smoke after deploy:
   - `for i in {1..6}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" $WORKER/api/auth/register -d '{"accountId":"test-ratelimit","deviceSecretHash":"a".repeat(64)}'; done` → 5×200 then 429
   - Confirm 429 response has `Retry-After: <integer>`
4. Confirm `wrangler tail` shows `rate_limit_hit` events.
5. Regression: `cd workers/sync-api && npm test` (other route tests pass).
