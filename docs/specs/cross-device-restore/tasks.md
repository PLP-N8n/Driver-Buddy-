# cross-device-restore — tasks

## Task 1 — D1 migration: `account_devices`

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/migrations/0004_account_devices.sql`
- [ ] CREATE TABLE `account_devices(account_id TEXT NOT NULL, device_secret_hash TEXT NOT NULL, added_at INTEGER NOT NULL, added_via TEXT NOT NULL DEFAULT 'register', PRIMARY KEY (account_id, device_secret_hash))`
- [ ] INSERT existing rows from `device_secrets` with `added_via = 'legacy'` and `added_at = created_at`
- [ ] CREATE INDEX `idx_account_devices_account` ON `account_devices(account_id)`
- [ ] Apply locally: `cd workers/sync-api && npx wrangler d1 migrations apply drivertax-sync --local`
- [ ] Verify: `npx wrangler d1 execute drivertax-sync --local --command "SELECT COUNT(*) FROM account_devices"` matches `SELECT COUNT(*) FROM device_secrets`
- [ ] Commit: `feat(d1): add account_devices migration for multi-device support`

## Task 2 — Worker auth route: idempotent register, multi-device session

- [ ] Open `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/routes/auth.ts`
- [ ] In `handleAuthRegister`:
  - replace INSERT with `INSERT INTO account_devices (account_id, device_secret_hash, added_at, added_via) VALUES (?, ?, ?, 'register') ON CONFLICT(account_id, device_secret_hash) DO NOTHING`
  - after INSERT, `SELECT COUNT(*) FROM account_devices WHERE account_id = ?` → return `{ registered: true, deviceCount }`
- [ ] In `handleAuthSession`:
  - replace `SELECT device_secret_hash FROM device_secrets WHERE account_id = ?` with `SELECT device_secret_hash FROM account_devices WHERE account_id = ?` (returns `.all()`, not `.first()`)
  - iterate rows; compute `expectedProof` per row; accept on first match; on no match return `'unauthorized'` 401
- [ ] Verify locally: `npx wrangler dev` and `curl` two different device hashes against same accountId — both register; both can request sessions
- [ ] Commit: `feat(auth): support multiple device secrets per account`

## Task 3 — Worker: device list and delete endpoints

- [ ] In `workers/sync-api/src/routes/auth.ts`, add `handleListDevices(request, env)`:
  - require auth via `getAuthenticatedAccountId` (`lib/auth.ts`)
  - SELECT all rows for accountId; return `[{ deviceSecretHashSuffix, addedAt, addedVia }]` with suffix = last 12 chars of the hash
- [ ] Add `handleDeleteDevice(request, env, hashSuffix)`:
  - require auth
  - DELETE WHERE `account_id = ? AND device_secret_hash LIKE '%' || ?` (parameterised)
  - return `{ deleted: true, deviceCount: <new count> }`
- [ ] Wire routes in `workers/sync-api/src/index.ts`:
  - `GET /api/auth/devices` → `handleListDevices`
  - `DELETE /api/auth/devices/:hashSuffix` → `handleDeleteDevice`
- [ ] Verify: GET returns the registered devices, DELETE removes one, follow-up session from removed device returns 401
- [ ] Commit: `feat(auth): list and delete linked devices`

## Task 4 — Worker tests

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/test/auth.test.ts` (using vitest + Miniflare-style fixture)
- [ ] Cases:
  - register A → 200, deviceCount 1
  - register B (same account, different hash) → 200, deviceCount 2
  - session from device A → 200
  - session from device B → 200
  - GET /devices → 2 entries
  - DELETE /devices/:suffixA → 200, deviceCount 1
  - session from device A after delete → 401
- [ ] Verify: `cd workers/sync-api && npm test` passes
- [ ] Commit: `test(auth): cross-device registration and revocation`

## Task 5 — Client: clear registration cache on restore

- [ ] Open `C:/Projects/ventures/Driver-Buddy/services/sessionManager.ts`
- [ ] Export new function `clearRegistrationCache(accountId?: string)`:
  - if accountId provided: `registeredAccounts.delete(accountId)` and clear any in-flight `registrationRequests` entry
  - else: clear all
- [ ] Open `C:/Projects/ventures/Driver-Buddy/services/deviceId.ts`
- [ ] In `restoreFromBackupCode`, after `localStorage.setItem(ACCOUNT_ID_KEY, code)`, import and call `clearRegistrationCache(code)` (and `clearSessionCache()` from sessionManager)
- [ ] Verify: unit test mocks confirm cache invalidation
- [ ] Commit: `fix(deviceId): clear session/registration cache on backup-code restore`

## Task 6 — Client: surface deviceCount + toast

- [ ] In `services/sessionManager.ts:registerAccount`, parse the `deviceCount` from the JSON response and store the latest count in module-scope; export `getLastDeviceCount(): number | null`
- [ ] Open `C:/Projects/ventures/Driver-Buddy/hooks/useBackupRestore.ts`
- [ ] After a successful restore + register, read `getLastDeviceCount()` and call `showToast(\`Device added — \${count} total devices linked to this account\`, 'success')`
- [ ] Update `hooks/useBackupRestore.test.ts` to assert the toast fires with the expected text
- [ ] Verify: `npm test -- useBackupRestore` passes
- [ ] Commit: `feat(useBackupRestore): toast device count after restore`

## Task 7 — Client: Linked Devices panel in Settings

- [ ] Create `C:/Projects/ventures/Driver-Buddy/components/LinkedDevicesPanel.tsx`
- [ ] On mount: `fetch(\`\${WORKER_URL}/api/auth/devices\`, { headers: await buildAuthHeaders() })` → render list
- [ ] Per row: short hash suffix, `added_at` (relative time via existing helper or `Intl.RelativeTimeFormat`), `added_via`, `isCurrent` flag (compare suffix to local `sha256(deviceSecret).slice(-12)`)
- [ ] "Remove" button (disabled for current device) calls `DELETE /api/auth/devices/:suffix` and refreshes
- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/Settings.tsx` and mount `<LinkedDevicesPanel />` somewhere visible (e.g., below sync settings)
- [ ] Verify: open Settings on a freshly-restored device → see ≥ 2 entries
- [ ] Commit: `feat(Settings): linked devices panel with remove action`

## Task 8 — E2E: cross-device restore

- [ ] Create `C:/Projects/ventures/Driver-Buddy/e2e/cross-device-restore.spec.ts`
- [ ] Use two browser contexts:
  - context A: register fresh account, add 1 work log, capture backup code from `localStorage[ACCOUNT_ID_KEY]`
  - context B: fresh storage, navigate to app, paste backup code into restore UI, submit
- [ ] Assert context B shows the work log within 5s after sync
- [ ] Assert toast text contains `2 total devices`
- [ ] Verify: `npx playwright test cross-device-restore` passes
- [ ] Commit: `test(e2e): cross-device backup code restore`

## Task 9 — Apply migration to production and deploy worker

- [ ] `cd workers/sync-api && npx wrangler d1 migrations apply drivertax-sync --remote`
- [ ] Verify: `npx wrangler d1 execute drivertax-sync --remote --command "SELECT COUNT(*) FROM account_devices"` returns ≥ 64 (matching current device_secrets row count)
- [ ] `npx wrangler deploy`
- [ ] Manual smoke: on a phone with live app, copy backup code; on laptop browser fresh profile, enter backup code; confirm data appears within 5s
- [ ] Commit: `chore(deploy): apply 0004 migration and deploy worker`

## Task 10 — Regression sweep

- [ ] `npm test` (full vitest)
- [ ] `npx playwright test`
- [ ] `npm run build`
- [ ] Manual smoke on production: existing single-device user opens app, syncs without seeing any "Device added" toast
- [ ] No commit (verification only)
