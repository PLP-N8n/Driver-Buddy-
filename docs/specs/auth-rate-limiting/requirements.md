# auth-rate-limiting — requirements

## R1 — `register` and `session` SHALL share separate rate buckets

**The system SHALL** rate-limit `/api/auth/register` and `/api/auth/session` against distinct endpoint keys (`auth_register` and `auth_session`) instead of the shared `auth` bucket they both use today.

**Acceptance:** an IP that exhausts its `auth_register` quota SHALL still be able to call `auth_session` until the `auth_session` quota is exhausted. Verified via integration test that issues N+1 register requests, asserts 429, then issues a session request and asserts 200.

## R2 — Limits SHALL be tuned per endpoint

**The system SHALL** apply:
- `auth_register`: 5 attempts per IP per minute (rare in normal use)
- `auth_session`: 30 attempts per IP per minute (token refresh ~ once per session, with a generous margin for legitimate retries)

**Acceptance:** code review of `routes/auth.ts` shows `checkRateLimit(request, 'auth_register', env.DB, 5)` and `checkRateLimit(request, 'auth_session', env.DB, 30)`.

## R3 — Account-level limit SHALL supplement IP limit

**The system SHALL** add a per-`accountId` rate limit on `auth_session` of 60 attempts per minute. This stops an attacker who rotates source IPs from grinding HMAC proofs against a single victim account.

**Acceptance:** integration test issues 61 session requests across 5 different `CF-Connecting-IP` values for the same `accountId`; the 61st returns 429 even though no single IP exceeded its bucket.

## R4 — Rate-limit responses SHALL include `Retry-After`

**The system SHALL** include `Retry-After: <seconds>` header on every 429 response, where seconds is the time until the oldest entry in the sliding window expires.

**Acceptance:** `curl -i` for a 429 response includes `Retry-After: <integer between 1 and 60>`.

## R5 — Rate-limit hits SHALL be logged

**The system SHALL** emit a structured log line `{ event: 'rate_limit_hit', endpoint, ip, accountId? }` on every 429 so we can detect attacks via `wrangler tail` or log analysis.

**Acceptance:** trigger a 429; `wrangler tail` shows the JSON event.

## R6 — Worker tests SHALL cover the limits

**The system SHALL** include unit tests in `workers/sync-api/test/auth-rate-limit.test.ts` (new) covering:
- 5 register requests succeed; 6th returns 429 with `Retry-After`
- 30 session requests from same IP succeed; 31st returns 429
- 60 session requests across rotating IPs but same accountId; 61st returns 429
- Quotas reset after the 60s window passes (use mocked clock)

**Acceptance:** `cd workers/sync-api && npm test -- auth-rate-limit` passes all 4 cases.

## R7 — Schema SHALL extend rate_limit_log for accountId

**The system SHALL** add a nullable `account_id TEXT` column to `rate_limit_log` via migration `0009_rate_limit_account.sql`. The `checkRateLimit` helper SHALL accept an optional `accountId` parameter and include it in the row + the COUNT query.

**Acceptance:** post-migration, `PRAGMA table_info(rate_limit_log)` shows the new column. Calling `checkRateLimit(request, 'auth_session', db, 30, accountId)` filters its count by `(ip, endpoint, accountId)`.

## R8 — Existing rate-limit behaviour on other routes SHALL be preserved

**The system SHALL NOT** change rate-limit behaviour for `sync`, `receipts`, `feedback`, `events` routes.

**Acceptance:** these routes still call `checkRateLimit(request, '<endpoint>', env.DB)` with their existing endpoint keys; their integration tests pass unchanged.

## R9 — Cleanup of expired rows SHALL run on every check

**The system SHALL** preserve the existing `DELETE FROM rate_limit_log WHERE attempted_at < ?` behaviour so the table doesn't grow unbounded.

**Acceptance:** after 5 minutes of idle traffic, `SELECT COUNT(*) FROM rate_limit_log` is bounded at < 100 rows on a low-traffic worker (smoke check, not a CI assertion).
