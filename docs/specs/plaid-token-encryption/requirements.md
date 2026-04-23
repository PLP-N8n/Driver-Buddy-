# plaid-token-encryption — requirements

## R1 — Plaid access tokens SHALL never be stored as plaintext at rest

**The system SHALL** encrypt every Plaid `access_token` before insert into D1 using AES-GCM-256 with a unique 12-byte IV per record. The plaintext token SHALL exist only in worker memory during exchange and immediate use, never on disk.

**Acceptance:** `wrangler d1 execute drivertax-sync --remote --command "SELECT access_token_ciphertext FROM plaid_connections LIMIT 1"` returns base64 ciphertext (no `access-` prefix); the original `access_token` column is dropped or NULL.

## R2 — Encryption key SHALL come from a Worker Secret, not source

**The system SHALL** derive the AES-GCM key from a Worker Secret named `PLAID_TOKEN_KEY` set via `wrangler secret put`. The key SHALL NOT appear in source, `wrangler.toml`, or any file in the repo.

**Acceptance:** `grep -r 'PLAID_TOKEN_KEY' workers/sync-api/src` returns only `env.PLAID_TOKEN_KEY` references — never a literal key. `npx wrangler secret list` shows `PLAID_TOKEN_KEY` present in the deployed worker.

## R3 — Crypto helper SHALL be a single isolated module

**The system SHALL** provide `workers/sync-api/src/lib/crypto.ts` with two functions:
- `encryptToken(plaintext: string, env: Env): Promise<string>` — returns base64 of `iv || ciphertext || authTag`
- `decryptToken(blob: string, env: Env): Promise<string>` — inverse; throws on auth-tag mismatch

**Acceptance:** unit test in `workers/sync-api/test/crypto.test.ts` covers round-trip, IV uniqueness across calls, and decrypt failure on tampered ciphertext.

## R4 — Schema migration SHALL replace plaintext column

**The system SHALL** ship migration `0007_encrypt_plaid_tokens.sql` that:
- adds `access_token_ciphertext TEXT` column
- adds `access_token_kid TEXT` column (key version, for future rotation)
- runs the worker-side backfill (encrypts existing plaintext tokens, populates the new columns)
- drops the original `access_token` column in a follow-up migration `0008_drop_plaintext_plaid.sql` AFTER confirming no plaintext rows remain

**Acceptance:** post-migration, `SELECT access_token FROM plaid_connections WHERE access_token IS NOT NULL` returns 0 rows; `SELECT COUNT(*) FROM plaid_connections WHERE access_token_ciphertext IS NULL AND is_active = 1` returns 0.

## R5 — Plaid route SHALL encrypt on insert, decrypt at point of use

**The system SHALL** modify the Plaid token-exchange route (to be added by the plaid-bank-integration spec) to:
- call `encryptToken` before INSERT/UPDATE
- call `decryptToken` only inside the function that calls Plaid's `transactionsGet` (or equivalent), holding the plaintext in a local variable that goes out of scope when the function returns

**Acceptance:** static review confirms no `access_token` plaintext is logged, returned in any HTTP response, or stored in any module-scope variable.

## R6 — Decrypt failures SHALL surface as actionable errors

**The system SHALL** catch decrypt failures (e.g. key rotation gone wrong, corrupted ciphertext) and return HTTP 500 with body `{ error: 'plaid_token_decrypt_failed', accountId }` to the calling route, with the underlying error logged to Sentry.

**Acceptance:** test seeds a `plaid_connections` row with deliberately corrupted ciphertext; calling any plaid endpoint that requires the token returns 500 with the structured error body.

## R7 — Backfill SHALL be idempotent and resumable

**The system SHALL** provide a one-shot worker route `POST /api/admin/plaid/backfill-encryption` (auth-gated by a separate `ADMIN_TOKEN` secret) that:
- iterates `plaid_connections` rows where `access_token IS NOT NULL AND access_token_ciphertext IS NULL`
- encrypts each `access_token`, writes `access_token_ciphertext` + `access_token_kid`, then NULLs `access_token`
- returns `{ migrated: N, remaining: M }` so it can be retried until `remaining = 0`

**Acceptance:** running the endpoint twice produces the same final state; second run returns `migrated: 0, remaining: 0`.

## R8 — Disconnect SHALL also clear ciphertext

**The system SHALL** ensure `handlePlaidDisconnect` (`workers/sync-api/src/routes/plaid.ts`) deletes both `access_token` and `access_token_ciphertext` (handled automatically by row deletion, but verify after migration).

**Acceptance:** existing `handlePlaidDisconnect` test passes after schema change; `SELECT * FROM plaid_connections WHERE account_id = ?` returns no rows post-disconnect.

## R9 — Key rotation SHALL be supported via `access_token_kid`

**The system SHALL** stamp every encrypted token with a `kid` (key id) so a future `PLAID_TOKEN_KEY_v2` can decrypt rows encrypted under v1 and re-encrypt under v2 without ambiguity.

**Acceptance:** `decryptToken` reads `kid` from the row (passed as a second arg or embedded in the blob format) and selects the matching key from `env`. Unit test covers a fixture row encrypted under `v1` decrypted by a worker that has both `v1` and `v2` keys.

## R10 — No regression on Plaid disconnect / status

**The system SHALL** preserve existing behaviour of `handlePlaidStatus` and `handlePlaidDisconnect` (already in `workers/sync-api/src/routes/plaid.ts`).

**Acceptance:** existing E2E + integration tests for these endpoints pass without modification.
