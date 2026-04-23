# cross-device-restore — requirements

## R1 — Backup-code restore SHALL succeed on a new device

**The system SHALL** allow a user who enters their backup code (account UUID) on a new device to authenticate against the sync API and pull their cloud data, regardless of whether the original device is still online.

**Acceptance:** with a fresh browser profile, run `restoreFromBackupCode(uuid)` for an account that already exists on a different physical device; subsequent `getSessionToken()` returns a valid token; `pull()` returns the user's data.

## R2 — Multiple device secrets SHALL be supported per account

**The system SHALL** persist `(account_id, device_secret_hash)` as the primary key in a new D1 table `account_devices` so a single account can have multiple registered devices simultaneously.

**Acceptance:** `wrangler d1 execute drivertax-sync --remote --command "SELECT COUNT(*) FROM account_devices WHERE account_id = ?"` returns ≥ 2 after a new device registers against an existing account.

## R3 — Existing single-device users SHALL be migrated without disruption

**The system SHALL** ship a D1 migration `0004_account_devices.sql` that:
- creates `account_devices(account_id TEXT, device_secret_hash TEXT, added_at INTEGER, added_via TEXT, PRIMARY KEY (account_id, device_secret_hash))`
- copies every row from `device_secrets` into `account_devices` with `added_via = 'legacy'`
- keeps `device_secrets` for one release as a safety net (drop in a follow-up migration)

**Acceptance:** after applying the migration to a copy of production, every existing account has at least one row in `account_devices` and existing sessions continue to issue without re-registration.

## R4 — `register` endpoint SHALL be idempotent and additive

**The system SHALL** change `handleAuthRegister` (`workers/sync-api/src/routes/auth.ts`) to:
- INSERT into `account_devices` with `ON CONFLICT(account_id, device_secret_hash) DO NOTHING`
- record `added_at = Date.now()` and `added_via = 'register'`
- return `{ registered: true, deviceCount: <int> }`

**Acceptance:** calling `/api/auth/register` twice with two different `deviceSecretHash` values for the same `accountId` succeeds both times and `deviceCount` is `2` on the second call.

## R5 — `session` endpoint SHALL accept any registered device

**The system SHALL** change `handleAuthSession` to look up `device_secret_hash` from `account_devices` for the given `accountId` and accept the request if **any** registered device's secret hash matches the proof.

**Acceptance:** with two devices registered against the same account, both can request and receive valid session tokens within the same minute.

## R6 — Settings SHALL show registered devices

**The system SHALL** display a "Linked devices" panel in `components/Settings.tsx` listing each row in `account_devices` for the current account: short hash (last 8 chars of `device_secret_hash`), `added_at` (relative time), `added_via`, and a "Remove" action for non-current devices.

**Acceptance:** load Settings on a freshly-restored device → see at least 2 entries (original + current); remove the original → next call to `/api/auth/session` from the original device returns 401.

## R7 — Removing a device SHALL revoke its sessions

**The system SHALL** expose `DELETE /api/auth/devices/:hashSuffix` (auth required) that deletes the matching `account_devices` row and invalidates any cached sessions tied to that device hash.

**Acceptance:** with two devices, delete one via the endpoint; that device's next sync request returns 401; the remaining device continues to sync normally.

## R8 — `restoreFromBackupCode` SHALL trigger device registration

**The system SHALL** modify `services/deviceId.ts:restoreFromBackupCode(code)` (or its caller in `useBackupRestore`) so that after overwriting the local `accountId`, it forces a fresh `registerAccount(accountId)` call — bypassing the in-memory `registeredAccounts` cache.

**Acceptance:** unit test in `hooks/useBackupRestore.test.ts` mocks the network and asserts `POST /api/auth/register` is called immediately after a successful restore.

## R9 — Backup-code restore SHALL show a confirmation toast naming the device

**The system SHALL** show a toast `"Device added — N total devices linked to this account"` after a successful restore where N is the new device count returned by `register`.

**Acceptance:** Playwright test seeds an existing account, runs the restore flow, asserts the toast text matches.

## R10 — No regression on single-device flows

**The system SHALL** preserve existing single-device behaviour: a user opening Driver Buddy for the first time (no backup code) still gets a fresh account, registers, and syncs identically to today.

**Acceptance:** existing E2E tests in `e2e/` pass without modification.
