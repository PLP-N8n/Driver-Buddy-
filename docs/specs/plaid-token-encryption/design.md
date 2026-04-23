# plaid-token-encryption — design

## Goal

Plaid access tokens grant durable, full-read access to a user's bank account. Storing them as plaintext in D1 is the single most serious finding from the 2026-04-12 code review. This spec wraps the existing schema in AES-GCM-256 encryption derived from a Worker Secret, with a backfill path and rotation hook.

## Context

### Today

`workers/sync-api/migrations/0002_plaid_foundation.sql` defines `plaid_connections.access_token TEXT NOT NULL`. The comment on line 1 ("encrypted reference only") was aspirational — no encryption is wired up. The route handlers in `workers/sync-api/src/routes/plaid.ts` only cover `status` and `disconnect`; the token-exchange route is queued in the in-flight `plaid-bank-integration` spec.

This spec lands the encryption substrate **before** that integration writes its first real token, so we never have a moment in production where plaintext tokens exist.

### Why AES-GCM-256

- Authenticated encryption — detects tampering, no padding-oracle class of bug
- Web Crypto API native (`crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)`) — no third-party dependency in the worker
- 256-bit key → comfortable margin; 12-byte IV is the standard for GCM

### Why a Worker Secret, not Cloudflare KMS

Cloudflare doesn't expose KMS to Workers directly. Worker Secrets (`wrangler secret put`) are the closest analogue: stored encrypted, surfaced only as `env.SECRET_NAME` at runtime, never logged. For Driver Buddy's threat model (no PII, single-tenant per account), this is the right level.

### Blob format

```
base64( kid_byte || iv_12_bytes || ciphertext || auth_tag_16_bytes )
```

`kid_byte` = 0x01 for the initial key version. Decryption reads `kid_byte` first, picks the matching key from `env`, runs `decrypt`. Forward-compatible: rotation adds `0x02` and a `PLAID_TOKEN_KEY_V2` secret.

Stored in D1 as a single TEXT column `access_token_ciphertext`. (The `access_token_kid` column from R4 is convenient for SQL filtering during rotation but not strictly necessary if the kid is in the blob.)

## Approach

### Phase 1 — Crypto helper

`workers/sync-api/src/lib/crypto.ts`:

```
async function getKey(env, kid): CryptoKey
async function encryptToken(plaintext, env): string  // base64 blob, kid = current
async function decryptToken(blob, env): string       // reads kid from blob byte 0
```

`getKey` imports the raw secret bytes (`env.PLAID_TOKEN_KEY` is a hex string, decoded once and cached in module scope) via `crypto.subtle.importKey`. Cache the imported `CryptoKey` per kid so we don't re-import on every call.

### Phase 2 — Schema migration

`workers/sync-api/migrations/0007_encrypt_plaid_tokens.sql`:
- ADD COLUMN `access_token_ciphertext TEXT`
- ADD COLUMN `access_token_kid INTEGER DEFAULT 1`
- (Don't drop `access_token` yet — backfill needs it)

### Phase 3 — Backfill route

`workers/sync-api/src/routes/admin.ts` (new):

`handleBackfillPlaidEncryption(request, env)`:
- check `Authorization: Bearer ${env.ADMIN_TOKEN}` header
- batch SELECT `account_id, access_token` WHERE `access_token IS NOT NULL AND access_token_ciphertext IS NULL` LIMIT 100
- for each row: `encryptToken(...)`, UPDATE SET `access_token_ciphertext = ?, access_token_kid = 1, access_token = NULL` WHERE `account_id = ?`
- return `{ migrated, remaining }`

Idempotent because the WHERE clause excludes rows that have already been migrated. Resumable because each batch is a separate request.

### Phase 4 — Wire into Plaid integration

The token-exchange route (added by the in-flight `plaid-bank-integration` spec) imports `encryptToken` and writes ciphertext on initial insert. Any route that needs the plaintext (e.g. `handleSyncTransactions`) calls `decryptToken` immediately before invoking the Plaid API and lets the variable go out of scope.

This spec **does not** ship the token-exchange route itself — it ships the encrypt/decrypt helpers that the other spec will pick up.

### Phase 5 — Drop plaintext column

After confirming `SELECT COUNT(*) FROM plaid_connections WHERE access_token IS NOT NULL` returns 0 in production, ship `0008_drop_plaintext_plaid.sql`:
- `ALTER TABLE plaid_connections DROP COLUMN access_token` (D1 supports this in recent versions; if not, recreate-and-copy)

This is a follow-up commit, not part of the same release as backfill.

### Phase 6 — Sentry instrumentation

Wrap `decryptToken` in a try/catch in every call site; on failure, `Sentry.captureException` with `{ tags: { plaid_decrypt: true }, extra: { accountId } }` so we see decrypt failures immediately.

## Out of scope

- Implementing the Plaid token-exchange route (handled by `plaid-bank-integration` spec).
- Encrypting `plaid_transactions` data (transaction descriptions and amounts are not as sensitive as the access token; defer).
- Multi-tenant key separation (per-account keys). The current threat model treats all accounts as equally trusted by the worker.
- HSM/KMS integration. Worker Secrets are the right level for now.
- Audit logging of every decrypt call (would create a high-volume log; not warranted yet).
- Re-encryption-on-rotation tooling (write when needed; manual re-key is acceptable for a small user base).

## Testing

1. Unit (vitest, in `workers/sync-api/test/crypto.test.ts`):
   - round-trip: `decrypt(encrypt(x)) === x` for 100 random strings
   - IV uniqueness: 1000 calls to `encrypt(x)` produce 1000 distinct blobs
   - tampering: flip one bit in the ciphertext → decrypt throws
   - kid mismatch: encrypt under v1, decrypt with worker that has only v2 → throws with structured error
2. Backfill route test: seed 5 plaintext rows; call backfill; assert all 5 have ciphertext, plaintext is NULL, second call returns `migrated: 0`.
3. Integration test (Miniflare with mock D1): encrypt → store → fetch → decrypt round-trip via the route handlers.
4. Manual production verification:
   - `npx wrangler secret put PLAID_TOKEN_KEY` (paste 64 hex chars from `openssl rand -hex 32`)
   - apply migration 0007
   - call backfill endpoint until `remaining: 0`
   - `wrangler d1 execute drivertax-sync --remote --command "SELECT COUNT(*) FROM plaid_connections WHERE access_token IS NOT NULL"` → 0
   - apply migration 0008 (drop plaintext)
5. Negative test: deliberately set the wrong `PLAID_TOKEN_KEY` in a staging worker → confirm decrypt failures surface as 500 with the structured error body and Sentry events fire.
