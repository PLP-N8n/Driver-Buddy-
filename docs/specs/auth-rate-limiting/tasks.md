# auth-rate-limiting — tasks

## Task 1 — Migration: add account_id to rate_limit_log

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/migrations/0009_rate_limit_account.sql`
- [ ] `ALTER TABLE rate_limit_log ADD COLUMN account_id TEXT`
- [ ] `CREATE INDEX IF NOT EXISTS idx_rate_limit_account ON rate_limit_log(account_id, endpoint, attempted_at)`
- [ ] Apply locally: `cd workers/sync-api && npx wrangler d1 migrations apply drivertax-sync --local`
- [ ] Verify: `npx wrangler d1 execute drivertax-sync --local --command "PRAGMA table_info(rate_limit_log)"` shows `account_id`
- [ ] Commit: `feat(d1): add account_id column to rate_limit_log`

## Task 2 — Update `checkRateLimit` to support account bucket + retryAfter

- [ ] Open `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/lib/rateLimit.ts`
- [ ] Update signature: `checkRateLimit(request, endpoint, db, maxAttempts = 10, accountId?: string): Promise<{ limited: boolean; retryAfter?: number }>`
- [ ] Add IP-bucket check (existing logic, return `retryAfter` on limit)
- [ ] If `accountId` provided, run a second SELECT keyed on `(account_id, endpoint, attempted_at)`; cap at `Math.max(maxAttempts * 2, 60)`
- [ ] Compute `retryAfter`: `SELECT MIN(attempted_at) FROM rate_limit_log WHERE <bucket-condition> AND attempted_at >= ?`; `retryAfter = Math.ceil((WINDOW_MS - (now - minAt)) / 1000)`
- [ ] INSERT with both `ip` and `accountId` (nullable column accepts undefined → null)
- [ ] On `limited: true`, log `console.log(JSON.stringify({ event: 'rate_limit_hit', endpoint, ip, accountId: accountId ?? null }))`
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `feat(rateLimit): per-account bucket and Retry-After hint`

## Task 3 — Add `jsonErrWithRetry` helper

- [ ] Open `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/lib/json.ts`
- [ ] Export `jsonErrWithRetry(request, message, status, retryAfter)`:
  - same as `jsonErr` but adds `Retry-After: String(Math.max(1, Math.min(60, retryAfter)))` header when `retryAfter` is a finite number
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `feat(json): jsonErrWithRetry helper for 429 responses`

## Task 4 — Apply per-endpoint limits in auth route

- [ ] Open `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/routes/auth.ts`
- [ ] In `handleAuthRegister`:
  - replace `checkRateLimit(request, 'auth', env.DB)` with `checkRateLimit(request, 'auth_register', env.DB, 5)`
  - on `limited`, return `jsonErrWithRetry(request, 'too many requests', 429, retryAfter)`
- [ ] In `handleAuthSession`:
  - first IP-bucket: `checkRateLimit(request, 'auth_session', env.DB, 30)` → on limit, 429
  - then account-bucket (after parsing `body.accountId`): `checkRateLimit(request, 'auth_session', env.DB, 60, body.accountId)` → on limit, 429
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `fix(auth): split rate-limit buckets and add account-level cap on session`

## Task 5 — Worker tests

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/test/auth-rate-limit.test.ts`
- [ ] Set up Miniflare fixture (or equivalent) with in-memory D1; apply migration 0009
- [ ] Use vitest fake timers to control the 60s window
- [ ] Cases (R6):
  - 5 register from same IP succeed; 6th returns 429 + `Retry-After`
  - 30 session from same IP same account succeed; 31st returns 429
  - 60 session across 5 rotating IPs same account succeed; 61st returns 429
  - Advance clock by 60s, retry → succeeds
- [ ] Verify: `cd workers/sync-api && npm test -- auth-rate-limit` passes all 4
- [ ] Commit: `test(auth-rate-limit): per-endpoint, per-account, retry-after, window reset`

## Task 6 — Apply migration and deploy

- [ ] `cd workers/sync-api && npx wrangler d1 migrations apply drivertax-sync --remote`
- [ ] `npx wrangler deploy`
- [ ] Manual smoke:
  - `for i in {1..6}; do curl -s -o /dev/null -w "%{http_code} " -X POST -H "Content-Type: application/json" $WORKER/api/auth/register -d '{"accountId":"test-ratelimit","deviceSecretHash":"'$(printf 'a%.0s' {1..64})'"}' ; done; echo` → expects `200 200 200 200 200 429`
  - Repeat with `-i` flag → confirm `Retry-After` header on 429 response
- [ ] `wrangler tail` in another shell during the burst → confirm `rate_limit_hit` JSON line appears
- [ ] Commit: `chore(deploy): auth rate-limit hardening live`

## Task 7 — Regression sweep

- [ ] `cd workers/sync-api && npm test`
- [ ] Browser smoke: production frontend syncs cleanly under normal load
- [ ] No commit (verification only)
