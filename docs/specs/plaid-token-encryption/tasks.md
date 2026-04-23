# plaid-token-encryption — tasks

## Task 1 — Generate and set the encryption key secret

- [ ] Generate a 32-byte hex key locally: `openssl rand -hex 32` (do NOT commit)
- [ ] Set the secret on the worker: `cd workers/sync-api && npx wrangler secret put PLAID_TOKEN_KEY` (paste the hex)
- [ ] Set a separate `ADMIN_TOKEN` secret for the backfill endpoint: `npx wrangler secret put ADMIN_TOKEN` (paste a long random string)
- [ ] Verify: `npx wrangler secret list` shows both `PLAID_TOKEN_KEY` and `ADMIN_TOKEN`
- [ ] No commit (secrets are out-of-band)

## Task 2 — Crypto helper module

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/lib/crypto.ts`
- [ ] Export `encryptToken(plaintext: string, env: Env): Promise<string>`:
  - decode `env.PLAID_TOKEN_KEY` from hex → 32 bytes
  - import via `crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])` (cache CryptoKey in module scope)
  - generate 12-byte IV via `crypto.getRandomValues`
  - encrypt → assemble `[0x01, ...iv, ...ciphertext]` (ciphertext from GCM already includes auth tag)
  - return base64 of the assembled bytes
- [ ] Export `decryptToken(blob: string, env: Env): Promise<string>`:
  - base64-decode → read kid byte → select key (v1 → `PLAID_TOKEN_KEY`, v2 → `PLAID_TOKEN_KEY_V2` for future)
  - extract IV (12 bytes) and ciphertext (rest)
  - decrypt → return UTF-8 string
- [ ] Update `workers/sync-api/src/routes/plaid.ts` `Env` interface to include `PLAID_TOKEN_KEY: string` and `ADMIN_TOKEN: string`; update `handleAuthSession`/etc Env types in `auth.ts` only if they need PLAID_TOKEN_KEY (they don't)
- [ ] Verify: `cd workers/sync-api && npx tsc --noEmit` passes
- [ ] Commit: `feat(crypto): AES-GCM helper for Plaid access tokens`

## Task 3 — Crypto unit tests

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/test/crypto.test.ts`
- [ ] Set up a fixture `Env` with a hardcoded test key (use a test-only constant)
- [ ] Cases:
  - round-trip: 100 random strings → `decrypt(encrypt(x)) === x`
  - IV uniqueness: 1000 encrypts → 1000 distinct blobs
  - tampering: flip last byte of ciphertext → `decrypt` throws
  - kid mismatch: blob with `kid = 0x02` decrypted by env with only v1 key → throws
- [ ] Verify: `cd workers/sync-api && npm test -- crypto` passes
- [ ] Commit: `test(crypto): round-trip, IV uniqueness, tampering, kid mismatch`

## Task 4 — Schema migration: add ciphertext columns

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/migrations/0007_encrypt_plaid_tokens.sql`
- [ ] `ALTER TABLE plaid_connections ADD COLUMN access_token_ciphertext TEXT`
- [ ] `ALTER TABLE plaid_connections ADD COLUMN access_token_kid INTEGER DEFAULT 1`
- [ ] Apply locally: `cd workers/sync-api && npx wrangler d1 migrations apply drivertax-sync --local`
- [ ] Verify: `npx wrangler d1 execute drivertax-sync --local --command "PRAGMA table_info(plaid_connections)"` shows new columns
- [ ] Commit: `feat(d1): add ciphertext columns to plaid_connections`

## Task 5 — Backfill admin route

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/routes/admin.ts`
- [ ] Export `handleBackfillPlaidEncryption(request: Request, env: Env): Promise<Response>`:
  - check `Authorization: Bearer <ADMIN_TOKEN>` header — 401 if missing/wrong
  - SELECT account_id, access_token FROM plaid_connections WHERE access_token IS NOT NULL AND access_token_ciphertext IS NULL LIMIT 100
  - for each row: encrypt, UPDATE SET access_token_ciphertext = ?, access_token_kid = 1, access_token = NULL
  - return `{ migrated, remaining }` (count remaining via SELECT COUNT(*))
- [ ] Wire route in `workers/sync-api/src/index.ts`: `POST /api/admin/plaid/backfill-encryption`
- [ ] Add unit test in `workers/sync-api/test/admin.test.ts`: seed 5 plaintext rows → call → assert all 5 migrated → call again → assert 0 migrated
- [ ] Verify: `cd workers/sync-api && npm test -- admin` passes
- [ ] Commit: `feat(admin): plaid token encryption backfill endpoint`

## Task 6 — Update plaid.ts Env type and prepare integration points

- [ ] Open `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/routes/plaid.ts`
- [ ] Extend `Env` interface: add `PLAID_TOKEN_KEY: string`
- [ ] Add a helper at top of the file (or in a new lib): `async function readPlaidAccessToken(accountId: string, env: Env): Promise<string | null>`
  - SELECT access_token_ciphertext, access_token_kid FROM plaid_connections WHERE account_id = ? AND is_active = 1
  - if ciphertext present → `decryptToken`
  - if only plaintext present (pre-backfill) → return plaintext (with Sentry warning, log it as `legacy_plaintext_read`)
  - if neither → return null
- [ ] No call site uses this helper yet — the in-flight `plaid-bank-integration` spec will pick it up
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `feat(plaid-route): readPlaidAccessToken helper supporting ciphertext + legacy plaintext`

## Task 7 — Sentry decrypt-failure instrumentation

- [ ] In `workers/sync-api/src/lib/crypto.ts`, optionally accept a logging callback parameter, OR document that callers MUST wrap `decryptToken` in try/catch
- [ ] In `routes/plaid.ts:readPlaidAccessToken`, wrap the `decryptToken` call:
  ```
  try { return await decryptToken(blob, env); }
  catch (err) { Sentry.captureException(err, { tags: { plaid_decrypt: true }, extra: { accountId } }); throw err; }
  ```
- [ ] (If Sentry isn't yet wired into the worker, log to `console.error` with structured fields and add a TODO for Sentry hookup.)
- [ ] Commit: `feat(plaid-route): log decrypt failures to Sentry`

## Task 8 — Apply migration 0007 to production

- [ ] `cd workers/sync-api && npx wrangler d1 migrations apply drivertax-sync --remote`
- [ ] Verify: `npx wrangler d1 execute drivertax-sync --remote --command "PRAGMA table_info(plaid_connections)"` shows ciphertext columns
- [ ] Deploy worker: `npx wrangler deploy`
- [ ] Commit: `chore(deploy): migration 0007 + crypto-enabled worker`

## Task 9 — Run backfill against production

- [ ] Run loop in shell:
  ```
  while true; do
    OUT=$(curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://drivertax-sync-api.cvchaudhary.workers.dev/api/admin/plaid/backfill-encryption)
    echo "$OUT"
    [[ $(echo "$OUT" | jq -r .remaining) -eq 0 ]] && break
    sleep 1
  done
  ```
- [ ] Verify: `curl -s ...` shows `{"migrated":0,"remaining":0}`
- [ ] Verify: `npx wrangler d1 execute drivertax-sync --remote --command "SELECT COUNT(*) FROM plaid_connections WHERE access_token IS NOT NULL"` returns `0`
- [ ] No commit (operational step)

## Task 10 — Drop plaintext column (follow-up release)

- [ ] After at least 24h of clean backfill state, create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/migrations/0008_drop_plaintext_plaid.sql`
- [ ] `ALTER TABLE plaid_connections DROP COLUMN access_token` (verify D1 supports DROP COLUMN; otherwise use the recreate-and-copy pattern with a temp table)
- [ ] Apply locally then production
- [ ] Update `routes/plaid.ts:readPlaidAccessToken` to remove the legacy plaintext branch
- [ ] Verify: `PRAGMA table_info(plaid_connections)` no longer shows `access_token`
- [ ] Commit: `chore(d1): drop plaintext access_token column from plaid_connections`

## Task 11 — Regression sweep

- [ ] `cd workers/sync-api && npm test`
- [ ] Manual: call `GET /api/plaid/status` and `POST /api/plaid/disconnect` with a test session token; both still work as before
- [ ] No commit (verification only)
