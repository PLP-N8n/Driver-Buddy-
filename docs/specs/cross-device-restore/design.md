# cross-device-restore — design

## Goal

A user who loses their phone, buys a new one, and enters their backup code SHALL recover their account and data. Currently they can't — session issuance is bound to a single device secret hash, and any new device fails the HMAC proof.

## Context

### Current model (broken for cross-device)

1. **Account creation:** `services/deviceId.ts` generates an `accountId` (UUID) and a random 32-byte `deviceSecret`. Both stored in `localStorage`.
2. **Backup code = accountId.** `getBackupCode()` literally returns `getAccountId()`. Users export this UUID as their recovery key.
3. **Registration:** `services/sessionManager.ts:registerAccount()` POSTs `accountId` + `sha256(deviceSecret)` to `/api/auth/register`. Worker INSERTs into `device_secrets` with `ON CONFLICT(account_id) DO NOTHING` — **one row per account**, locked to the first device's secret.
4. **Session:** `getSessionToken()` proves knowledge of `deviceSecret` via `sha256(deviceSecretHash + timestamp)`. Worker compares against the stored hash for that account.

### What breaks cross-device

`restoreFromBackupCode(code)` (services/deviceId.ts:52) overwrites local `ACCOUNT_ID_KEY` with the old UUID. The new device's `DEVICE_SECRET_KEY` is freshly generated (different from the original device). When `registerAccount` runs:
- `INSERT … ON CONFLICT(account_id) DO NOTHING` — silently no-ops because the row already exists with the OLD device secret hash
- `getSessionToken` then proves with the NEW device secret → stored hash doesn't match → 401

The user sees "couldn't sync" with no actionable error. Cloud data is unreachable.

### Why backup code as accountId is fine

The backup code is a 122-bit random UUID. Anyone with it can claim the account — that's the design intent (no email, no password, no PII). Adding a new device under a known accountId is a legitimate operation; we just need to support it instead of silently rejecting it.

### Existing pieces we reuse

- `services/sessionManager.ts:registerAccount()` retry semantics
- `services/sessionManager.ts:registeredAccounts` cache (must be invalidated on restore)
- `lib/rateLimit.ts` — already applied to `/api/auth/*`
- `lib/session.ts:issueSessionToken` — works per accountId, no device coupling

## Approach

### Phase 1 — D1 schema migration

New table `account_devices`:
```
account_id TEXT NOT NULL,
device_secret_hash TEXT NOT NULL,
added_at INTEGER NOT NULL,
added_via TEXT NOT NULL DEFAULT 'register',  -- 'legacy' | 'register' | 'restore'
PRIMARY KEY (account_id, device_secret_hash)
```

Migration `workers/sync-api/migrations/0004_account_devices.sql`:
1. CREATE TABLE
2. INSERT into account_devices SELECT account_id, device_secret_hash, created_at AS added_at, 'legacy' FROM device_secrets
3. (Keep `device_secrets` for one release as rollback safety; drop in `0005_drop_device_secrets.sql` later.)

### Phase 2 — Worker route changes

`workers/sync-api/src/routes/auth.ts`:

- `handleAuthRegister`: switch INSERT to `account_devices` with composite `ON CONFLICT DO NOTHING`. Add follow-up `SELECT COUNT(*)` and return `{ registered: true, deviceCount }`.
- `handleAuthSession`: switch SELECT to `account_devices`. Iterate over all rows for the account; compare each `expectedProof = sha256(row.device_secret_hash + timestamp)` against the supplied proof; accept on first match.

New route `DELETE /api/auth/devices/:hashSuffix`:
- requires valid session (existing `getAuthenticatedAccountId` from `lib/auth.ts`)
- looks up `account_devices` rows for that accountId where `device_secret_hash LIKE '${suffix}%'` (suffix = first 12 hex chars to keep URL short)
- DELETEs the row; returns updated count

### Phase 3 — Client changes

`services/deviceId.ts:restoreFromBackupCode(code)`:
- existing: overwrite `ACCOUNT_ID_KEY`
- new: ALSO clear the `registeredAccounts` cache in sessionManager. Easiest: re-export `clearRegistrationCache()` from sessionManager and call it here.

`services/sessionManager.ts`:
- export `clearRegistrationCache(accountId?)`
- after `register` succeeds, capture `deviceCount` from response and surface it via a tiny event emitter or return value (whatever the existing call site uses)

`hooks/useBackupRestore.ts`:
- after a successful restore, await `registerAccount(newAccountId)` explicitly; on success show toast `"Device added — N total devices linked to this account"`

`components/Settings.tsx`:
- new `<LinkedDevicesPanel />` that fetches `GET /api/auth/devices` (new endpoint that lists registered devices for the authenticated account, returning `{ deviceSecretHashSuffix, addedAt, addedVia, isCurrent }`)
- "Remove" action calls `DELETE /api/auth/devices/:suffix`

### Phase 4 — Optional: device-added events

Out of scope for this spec but cheap follow-up: log every `register` to `account_events` table with type `device_added`, displayed as a security audit trail in Settings.

## Out of scope

- Removing the `device_secrets` table (separate cleanup migration).
- Email/password auth, 2FA, or passkey support — backup code remains the sole recovery mechanism.
- Notifying the original device when a new device joins.
- Push notifications, OAuth, or SSO.
- Rate-limiting `add-device` separately from existing `/api/auth/*` rate limit (the existing 10/min/IP applies).
- A "trusted devices" prompt on the original device approving new devices — backup code is sufficient authority.

## Testing

1. Worker unit (vitest, Miniflare): `workers/sync-api/test/auth.test.ts` (new):
   - `register` two different device hashes for same account → both succeed
   - `session` with second device's proof → returns 200 + token
   - `DELETE /api/auth/devices/:suffix` → only matching row removed
2. Migration test: apply `0004` to a copy of dev DB, assert every `device_secrets` row has a corresponding `account_devices` entry with `added_via = 'legacy'`
3. Client unit: `hooks/useBackupRestore.test.ts` extended — mock fetch, assert `register` is called after restore, assert `clearRegistrationCache` runs
4. E2E (Playwright): `e2e/cross-device-restore.spec.ts` (new):
   - browser context A creates account, syncs data, captures backup code
   - browser context B (fresh storage) enters backup code → assert sync succeeds and data appears
5. Manual smoke (production): on a phone with the live app, copy backup code; on laptop browser, enter backup code; confirm data appears within 5s
6. Regression: `npm test`, `npx playwright test`, `npm run build` all green
