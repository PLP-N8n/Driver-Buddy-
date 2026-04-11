# DriverTax Pro Improvement Plan to 9.5+/10

Date: 2026-04-04  
Audit baseline: Architecture 6, Application Flow 5, Logic 5, Reliability 4, Security 3, Performance 5, Test Coverage 4, Code Quality 6

## Non-negotiables

To get this app to a real 9.5+ as a finance product, not just a nicer prototype:

- The Cloudflare worker code has to be brought under version control and reviewed alongside the frontend. Right now the most security-critical backend is missing from this repo, so Security and Reliability cannot honestly be signed off above roughly 7/10.
- The backup-code model cannot remain "a raw device UUID is enough to restore cloud data" if the final target is 9.5+ Security. The phased plan below assumes that restore becomes worker-authenticated and that the local device ID becomes an installation identifier, not a bearer credential.
- All business dates have to move to one UK-local date utility. Partial fixes will leave tax-year, week, streak, and "today" bugs behind.
- Snapshot-style sync has to be replaced with record-level versioned sync. "Last full snapshot wins" is not a 9.5 reliability model.

## Rule references used in this plan

- GOV.UK: [Income Tax rates and allowances](https://www.gov.uk/government/publications/rates-and-allowances-income-tax)
- GOV.UK: [Income Tax in Scotland](https://www.gov.uk/scottish-income-tax/2024-to-2025-tax-year)
- GOV.UK: [Payments on account calculation, SAM1010](https://www.gov.uk/hmrc-internal-manuals/self-assessment-manual/sam1010)
- GOV.UK: [Simplified expenses overview](https://www.gov.uk/simpler-income-tax-simplified-expenses)
- GOV.UK: [Simplified expenses for motor vehicles, BIM75005](https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim75005)

## Phase 1: Security and Trust

**What problem it solves**

This phase addresses the highest-risk audit failures: `services/imageStore.ts` ships `RECEIPT_SECRET` to the browser, the worker that should enforce receipt authorization is not in source control, `services/deviceId.ts` treats the device UUID as a restore credential, `public/_headers` still allows `'unsafe-inline'`, and product copy in `components/Settings.tsx` currently overstates how private the app is. This is the first deploy because every later sync/restore improvement depends on a real trust boundary.

**Correct receipt trust boundary**

The browser must never know a secret that can authorize receipt upload or read access.

- The browser should hold only:
  - a normal app session token issued by the worker after user authentication or recovery verification
  - opaque receipt IDs such as `rct_...`
  - local blobs stored in OPFS/IndexedDB
- The worker should hold:
  - R2 credentials
  - any receipt-signing secret
  - the mapping between `accountId`, `installationId`, `expenseId`, and `receiptId`
- Receipt upload flow should become:
  1. browser requests `POST /api/receipts/request-upload` with `expenseId`, MIME type, size, and the authenticated session
  2. worker verifies account + device ownership, creates a private object key, and returns either a one-time upload URL or proxies the upload directly
  3. worker persists `receiptId`, object key, checksum, MIME type, and owner metadata
  4. frontend stores `receiptId`, not a public URL
- Receipt read flow should become:
  1. browser requests `GET /api/receipts/:receiptId`
  2. worker verifies the session owns that receipt
  3. worker streams the blob from private R2 storage
- Receipt delete flow should become:
  1. browser requests `DELETE /api/receipts/:receiptId`
  2. worker verifies ownership and deletes metadata + object

**Exact changes required**

- [ ] Add the missing backend to source control under `workers/sync-api/` with at least `workers/sync-api/wrangler.toml`, `workers/sync-api/src/index.ts`, `workers/sync-api/src/routes/receipts.ts`, `workers/sync-api/src/routes/auth.ts`, `workers/sync-api/src/routes/events.ts`, `workers/sync-api/src/lib/session.ts`, `workers/sync-api/src/lib/r2.ts`, and `workers/sync-api/src/lib/schema.ts`.
- [ ] In `workers/sync-api/src/routes/receipts.ts`, replace any HMAC-with-device-id design with authenticated endpoints `POST /api/receipts/request-upload`, `GET /api/receipts/:receiptId`, `DELETE /api/receipts/:receiptId`, and `POST /api/receipts/migrate-legacy`.
- [ ] In `workers/sync-api/src/routes/auth.ts`, add the restore/auth flow that issues a short-lived session token after recovery verification. The restore code must no longer be enough on its own to read cloud data.
- [ ] In `types.ts`, add `receiptId?: string` to `Expense` and keep `receiptUrl?: string` only as a legacy migration field for existing records. Do not delete `receiptUrl` in this phase; keep it until migration is complete.
- [ ] In `services/imageStore.ts`, remove `RECEIPT_SECRET`, `arrayBufferToHex`, `buildReceiptSignature`, and `buildReceiptHeaders`. Replace them with `requestReceiptUpload(blob, expenseId, filename)`, `readRemoteReceipt(receiptId)`, `deleteRemoteReceipt(receiptId)`, and `migrateLegacyReceipt(receiptUrl)`.
- [ ] In `services/imageStore.ts`, change `isR2UploadConfigured()` so it depends only on `VITE_SYNC_WORKER_URL` and the presence of a valid authenticated session, never a frontend secret.
- [ ] In `App.tsx` receipt sync effect at `App.tsx:540-592`, stop calling `uploadToR2(blob, filename)`. Call the new `requestReceiptUpload` helper and write the returned `receiptId` back into the matching expense.
- [ ] In `App.tsx`, add a one-time legacy migration effect after hydration: scan `expenses.filter(expense => expense.receiptUrl && !expense.receiptId)`, call `migrateLegacyReceipt(expense.receiptUrl)`, and patch the local expense with the returned `receiptId` while leaving the legacy `receiptUrl` in place until the worker confirms migration.
- [ ] In `components/ExpenseLog.tsx`, change receipt reads to prefer `expense.receiptId` and only fall back to `expense.receiptUrl` during migration. The component should not care whether the blob came from OPFS, IndexedDB, the new private worker route, or the legacy migration route.
- [ ] In `services/deviceId.ts`, split the current responsibilities into:
  - `getInstallationId()` for the local browser install
  - `validateRecoveryCode(code)` for format validation only
  - no function that commits a new identity before worker verification succeeds
- [ ] In `services/syncService.ts`, stop sending raw `X-Device-ID` as the sole credential for sync. Keep `installationId` only as metadata and require the new worker session token for push, pull, restore, and receipt access.
- [ ] In `docs/environment-variables.md`, remove `RECEIPT_SECRET` from the frontend environment list. Document it, if still needed at all, as worker-only configuration. Add the new worker-side variables for receipt storage and session signing.
- [ ] In `public/_headers`, remove `'unsafe-inline'` from `script-src`. If inline bootstrap remains necessary, move it to hashed or nonce-backed script tags and document the exact CSP strategy in `docs/security.md`.
- [ ] In `metadata.json`, remove the unused geolocation request and remove the AI-tax-assistant claim unless an actual production feature exists.
- [ ] In `components/Settings.tsx:516-526`, rewrite the "Your data, your device" copy so it accurately states:
  - local data is always stored on-device
  - optional cloud sync sends data to the worker
  - analytics are pseudonymous and optional
  - CSV is an export, not a full-fidelity restore
- [ ] In `App.tsx:128-139`, gate `trackEvent` behind a real worker endpoint and an explicit analytics consent flag in settings. If `/api/events` is not deployed, the app should not fire a known-404 request on every open.

**Migration plan for existing receipt URLs**

- [ ] Keep existing `expense.receiptUrl` values readable in the app until every legacy receipt has a `receiptId`.
- [ ] Implement `POST /api/receipts/migrate-legacy` in the worker so the frontend can hand the old URL to the worker, the worker can copy or reindex the object into the new private namespace, and return a stable opaque `receiptId`.
- [ ] Make the migration idempotent: if a legacy URL was already migrated, the worker should return the existing `receiptId`.
- [ ] Keep `services/imageStore.ts` able to read either `receiptId` or legacy `receiptUrl` during the migration window.
- [ ] Add an admin script at `workers/sync-api/scripts/migrate-legacy-receipts.ts` to backfill old receipt metadata in bulk so the app is not forced to migrate everything lazily on user interaction.

**Acceptance criteria**

- [ ] A build artifact search for `RECEIPT_SECRET` in `dist/` returns nothing.
- [ ] A browser session cannot upload or read a receipt without a valid worker-issued session token.
- [ ] Existing expenses that only have `receiptUrl` still open successfully after deploy and are progressively upgraded to `receiptId`.
- [ ] CSP no longer contains `'unsafe-inline'`.
- [ ] The settings copy and analytics behavior match the actual deployed behavior.

**Risk level**

High. This phase changes the app's security model, adds missing backend code, and introduces a data migration path.

**Projected scores after Phase 1**

Architecture 6.5, Application Flow 5.5, Logic 5.5, Reliability 5.5, Security 8.0, Performance 5.0, Test Coverage 4.5, Code Quality 6.8

## Phase 2: Data Integrity and Correctness

**What problem it solves**

This phase fixes the tax and data-model errors called out in the audit: personal allowance taper missing in `utils/tax.ts`, payments-on-account exception logic missing, no Scottish rate handling, UTC date bugs across `App.tsx`, `types.ts`, `components/WorkLog.tsx`, `components/ExpenseLog.tsx`, `components/MileageLog.tsx`, `utils/habitEngine.ts`, `utils/shiftPredictor.ts`, and `utils/ui.ts`, `components/WeeklyReviewCard.tsx` using the wrong mileage source, and linked work-log/trip records drifting apart in `components/WorkLog.tsx` and `components/MileageLog.tsx`.

### Tax rule details that must be implemented

Personal allowance taper:

- 2025/26 Personal Allowance is GBP 12,570.
- Adjusted net income above GBP 100,000 reduces the allowance by GBP 1 for every GBP 2 above the limit.
- The allowance is fully removed at GBP 125,140.

Payments on account:

- Payments on account are generally due when the Self Assessment liability exceeds GBP 1,000 and less than 80% of the tax has already been deducted at source.

Scottish rates:

- Scottish non-savings, non-dividend income needs separate band logic. The app cannot continue to label itself HMRC-useful while calculating only rest-of-UK bands.

Simplified expenses eligibility:

- Simplified mileage is optional and only applies to eligible cars, goods vehicles, and motorcycles.
- BIM75005 excludes cars designed for commercial use such as black cabs and dual-control driving-instructor cars from the flat-rate vehicle method.

**Exact changes required**

- [ ] Add `utils/date.ts` with a single UK-local date toolkit:
  - `toUkDateKey(date?: Date | string): string`
  - `getUkMonthKey(date?: Date | string): string`
  - `parseUkDateKey(dateKey: string): Date`
  - `getUkWeekRange(dateKey: string): { start: string; end: string }`
  - `combineUkDateAndTime(dateKey: string, time: string): string`
  - `getCurrentUkTaxYearStart(today?: Date): string`
- [ ] Replace every business-date `toISOString().split('T')[0]` and month-key shortcut in `App.tsx`, `types.ts`, `components/ExpenseLog.tsx`, `components/MileageLog.tsx`, `components/WorkLog.tsx`, `utils/habitEngine.ts`, `utils/shiftPredictor.ts`, and `utils/ui.ts` with the new `utils/date.ts` helpers.
- [ ] In `types.ts`, extend `Settings` with:
  - `incomeTaxRegion: 'UK' | 'SCOTLAND'`
  - `taxDeductedAtSource: number`
  - `vehicleClass: 'CAR' | 'GOODS_VEHICLE' | 'MOTORCYCLE' | 'BLACK_CAB' | 'DUAL_CONTROL' | 'OTHER'`
  - `hasClaimedCapitalAllowancesForVehicle: boolean`
- [ ] In `types.ts`, extend `Trip` with `linkedWorkLogId?: string` so the relationship is bidirectional instead of one-way from work log to trip.
- [ ] In `types.ts`, expand `ExpenseCategory` beyond `PARKING` and `OTHER` so the estimator can model `PHONE_INTERNET`, `ACCOUNTANCY`, `SUBSCRIPTIONS`, `EQUIPMENT`, and `BANK_FEES` as explicit allowable non-vehicle categories.
- [ ] In `utils/tax.ts`, refactor `buildProjection(totalRevenue, deductionUsed)` into `buildProjection({ totalRevenue, deductionUsed, incomeTaxRegion, taxDeductedAtSource })` and add:
  - `calculatePersonalAllowance(adjustedNetIncome)`
  - `calculateUkIncomeTax(taxableProfit, personalAllowance)`
  - `calculateScottishIncomeTax(taxableProfit, personalAllowance)`
  - `isPaymentsOnAccountDue(estimatedLiability, taxDeductedAtSource)`
- [ ] In `utils/tax.ts`, change the payments-on-account calculation from `estimatedLiability > 1000` to `estimatedLiability > 1000 && taxDeductedAtSource < estimatedLiability * 0.8`.
- [ ] In `utils/tax.ts`, add simplified-expense eligibility checks that force `ACTUAL` costing when `vehicleClass` is `BLACK_CAB` or `DUAL_CONTROL`, or when `hasClaimedCapitalAllowancesForVehicle` is true.
- [ ] In `components/OnboardingModal.tsx`, extend the claim-method step so the user must select `vehicleClass`, and if simplified mileage is not allowed, disable the simplified option with the exact reason.
- [ ] In `components/Settings.tsx`, add editable controls for `incomeTaxRegion`, `taxDeductedAtSource`, `vehicleClass`, and `hasClaimedCapitalAllowancesForVehicle`, and show an inline warning when the current settings make simplified mileage invalid.
- [ ] In `components/TaxLogic.tsx`, add a "Tax assumptions" panel that displays region, vehicle-method eligibility, and tax already deducted at source. The projection export must include these assumptions so the CSV explains why POA is or is not due.
- [ ] In `components/WeeklyReviewCard.tsx`, replace `getTaxPotStatus(logs, settings)` with a helper that uses the actual business-mile total from `trips` for the review window. The weekly review and the Tax tab must calculate the same liability for the same week.
- [ ] In `components/WorkLog.tsx:585-672`, replace the inline linked-trip add/update logic with a shared helper such as `services/linkedRecords.ts::syncTripForWorkLogSave`. That helper must:
  - update the linked trip's `date`, `startLocation`, `endLocation`, `startOdometer`, `endOdometer`, `totalMiles`, `purpose`, `notes`, and `linkedWorkLogId`
  - create a new linked trip when miles change from 0 to a positive value
  - delete the linked trip and clear `linkedTripId` when miles are edited back to 0
- [ ] In `components/MileageLog.tsx:213-247`, when editing or deleting an auto-created trip, update the linked work log through a new prop such as `onUpdateLinkedLog` or a shared service helper. The current warning text at `MileageLog.tsx:391-394` should be removed because the behavior will no longer be true.
- [ ] In `App.tsx` and the sync-transform layer, persist both `linkedTripId` and `linkedWorkLogId` so linked records survive sync and restore.
- [ ] In `utils/taxPack.ts`, include the new non-vehicle expense categories and the new tax-assumption fields so exports stay aligned with the estimator.

**Unit tests that must be added in this phase**

- [ ] Add `utils/date.test.ts` proving `toUkDateKey` and `getUkWeekRange` are correct across GMT/BST boundaries and around midnight.
- [ ] Add `utils/tax.test.ts` with a personal-allowance taper case at exactly GBP 100,000, a taper case above GBP 100,000, and a zero-allowance case at GBP 125,140.
- [ ] Add `utils/tax.test.ts` proving `paymentsOnAccount` is false when more than 80% of the estimated liability has already been deducted at source.
- [ ] Add `utils/tax.test.ts` proving Scottish-rate calculations differ from rest-of-UK calculations for the same taxable profit.
- [ ] Add `utils/tax.test.ts` proving simplified mileage is rejected for `vehicleClass: 'BLACK_CAB'`.
- [ ] Add `components/WeeklyReviewCard.test.tsx` proving the weekly tax-pot calculation uses business trips, not `dailyLogs.milesDriven`.
- [ ] Add `services/linkedRecords.test.ts` proving that editing a work log down to zero miles deletes the linked trip and that editing a linked trip updates the work log.

**Acceptance criteria**

- [ ] No business-date code path in app source still uses `toISOString().split('T')[0]` for local date keys.
- [ ] Tax output at GBP 100,000, GBP 100,001, GBP 110,000, and GBP 125,140 matches the new unit tests.
- [ ] The weekly review and Tax tab show the same weekly liability for identical data.
- [ ] Editing either side of a linked work-log/trip pair keeps both records consistent after save, reload, and sync.
- [ ] Simplified mileage is blocked for ineligible vehicle classes and settings combinations.

**Risk level**

High. This phase changes tax calculations, date handling, and linked-record behavior across most user-visible flows.

**Projected scores after Phase 2**

Architecture 7.0, Application Flow 6.5, Logic 8.4, Reliability 6.2, Security 8.0, Performance 5.2, Test Coverage 5.8, Code Quality 7.4

## Phase 3: Reliability, Sync, and Restore Safety

**What problem it solves**

This phase fixes the app's weakest operational behaviors: reconnect retry is unwired in `services/syncService.ts`, restore mutates identity before success in `hooks/useBackupRestore.ts` and `services/deviceId.ts`, restore trusts unvalidated JSON, `components/SyncIndicator.tsx` hides the state users need most, `components/FeedbackSheet.tsx` leaks timers, `App.tsx` writes large JSON blobs to `localStorage` with no safety net, and restore still replaces whole datasets with no preview or rollback.

**Exact changes required**

- [ ] In `services/syncService.ts`, change `pull()` to accept an override object such as `{ installationIdOverride?: string }` so restore can fetch cloud state for a candidate recovery code without mutating local storage first.
- [ ] In `services/deviceId.ts`, replace `restoreFromBackupCode(code)` with:
  - `validateRecoveryCode(code): boolean`
  - `commitRecoveryInstallationId(code): void`
  - no function that writes to `localStorage` before a successful pull and schema validation
- [ ] In `hooks/useBackupRestore.ts:103-133`, change `handleRestoreFromBackupCode` to:
  1. validate the code format
  2. call `pull({ installationIdOverride: trimmedCode })`
  3. validate the payload
  4. stage the merged result
  5. commit the installation ID only after the restore preview is accepted and the data is applied successfully
- [ ] In `hooks/useBackupRestore.ts`, stop directly calling `setTrips`, `setExpenses`, `setDailyLogs`, and `setSettings` immediately after parsing. Return a staged restore preview object instead.
- [ ] Add `components/RestoreReviewDialog.tsx` so restore is no longer a blind overwrite. The dialog should show counts for local-only records, cloud-only records, conflicting records, and what will happen under "Replace local" and "Merge newest" modes.
- [ ] Add `services/restoreMerge.ts` with deterministic restore behavior:
  - same-record merges should use `updatedAt`
  - conflicting changes should be surfaced to the dialog instead of silently overwritten
  - restore should be rollback-safe if any step fails during apply
- [ ] Add `schemas/backup.ts` and `schemas/sync.ts` using `zod`. The minimum shapes should validate:
  - `version`, `exportDate`
  - trips with IDs, date keys, odometer fields, mileage, purpose, and linked IDs
  - expenses with category, amount, receipt identifiers, and VAT flags
  - daily logs with hours, revenue, mileage, provider splits, and linked IDs
  - settings with defaults applied through a migration layer
  - player stats
- [ ] In `hooks/useBackupRestore.ts`, replace `JSON.parse(loadEvent.target?.result as string)` and `(await pull()) as SyncPullPayload | null` with `safeParse` results from the new schemas.
- [ ] In `App.tsx:475-497`, replace direct `localStorage.setItem` effects with `services/localPersistence.ts` helpers that catch quota errors, emit a typed error, and show a user-visible toast when local persistence fails.
- [ ] In `hooks/useConnectivity.ts`, keep the browser `online` event as the source of truth. In `App.tsx`, add a new effect immediately after the current `schedulePush` effect that calls `retryPendingPush()` when `hasHydrated && isOnline` becomes true.
- [ ] In `App.tsx`, add a second recovery effect on `document.visibilitychange` so that when the tab becomes visible and `navigator.onLine` is true, `retryPendingPush()` runs again. This covers device wake/unlock cases where the `online` event is missed.
- [ ] In `services/syncService.ts`, replace raw string status with a structured status model that includes `state`, `pendingCount`, `lastAttemptAt`, `lastSuccessAt`, and `lastError`.
- [ ] In `components/SyncIndicator.tsx`, stop hiding `error` and `offline` states. Render:
  - offline badge with "Saved locally, waiting for connection"
  - error badge with retry CTA
  - syncing badge with pending-count tooltip
- [ ] In `types.ts` and the sync payload contract, add `playerStats` to sync so cloud restore does not silently drop progression state.
- [ ] In `services/opfsStore.ts` and `services/imageStore.ts`, return structured failure reasons instead of swallowing them. Surface OPFS fallback or quota exhaustion to the user the first time it happens.
- [ ] In `components/FeedbackSheet.tsx`, store both timeouts in refs, clear them before scheduling new ones, and clear them in a cleanup effect on unmount and close.
- [ ] In `components/BackfillSheet.tsx:59-72`, remove the automatic modal open. Replace it with a non-blocking dashboard prompt or card that opens the sheet only after user action.
- [ ] In `components/Dashboard.tsx:578-651`, replace silent `return` validation failures with explicit inline errors or toast messages for missing revenue and missing manual hours. Replace the catch-all save failure with visible error feedback and keep the form open so the user can retry.
- [ ] In `services/syncService.ts`, replace full-snapshot push/pull with record-level versioned sync:
  - add `updatedAt`, `deletedAt`, `syncRevision`, and `lastModifiedByInstallationId` to `Trip`, `Expense`, `DailyWorkLog`, and settings payloads
  - push patches, not entire snapshots
  - pull by cursor or revision
  - keep tombstones for deletes

**Acceptance criteria**

- [ ] Editing data offline, reconnecting, and focusing the tab triggers `retryPendingPush()` without requiring a fresh user mutation.
- [ ] A failed restore leaves the current installation ID and local state unchanged.
- [ ] Restore refuses invalid JSON and invalid sync payloads before any state mutation happens.
- [ ] The sync indicator stays visible and truthful in `offline`, `error`, and `retrying` states.
- [ ] The backfill prompt no longer blocks the primary "Start shift" CTA on app load.
- [ ] `FeedbackSheet` produces no state-update-after-unmount warnings.

**Risk level**

High. This phase changes sync semantics, restore application order, and the user-facing restore flow.

**Projected scores after Phase 3**

Architecture 7.8, Application Flow 8.3, Logic 8.7, Reliability 8.9, Security 8.8, Performance 5.6, Test Coverage 6.8, Code Quality 8.0

## Phase 4: Architecture and Code Quality

**What problem it solves**

This phase removes the structural debt keeping `App.tsx` as the hidden dependency root. The audit is explicit: `hooks/useBackupRestore.ts` and `hooks/useExport.ts` import back from `App.tsx`, `App.tsx` still owns hydration, persistence, sync orchestration, and shift completion, and dead code remains in the tree.

**Exact changes required**

- [ ] Create `utils/csv.ts` and move `escapeCsvCell` out of `App.tsx`. Update `hooks/useExport.ts` and `components/TaxLogic.tsx` to import from `utils/csv.ts`.
- [ ] Create `services/settingsService.ts` and move `normalizeSettings` out of `App.tsx`. Update `App.tsx` and `hooks/useBackupRestore.ts` to import from the new module.
- [ ] Create `services/syncTransforms.ts` and move `sanitizeExpenseForStorage`, `prepareExpensesForLocalState`, `buildSyncPayload`, `applyPulledTrips`, `applyPulledWorkLogs`, and `applyPulledExpenses` out of `App.tsx`.
- [ ] In `services/syncTransforms.ts`, fix the contract drift between `App.tsx` and `types.ts` by using one DTO shape. Today `App.tsx` pushes `tripType`, `linkedWorkId`, and `hasImage` while `SyncPullPayload` is defined with `trip_type`, `linked_work_id`, and `has_image`. Pick one contract and enforce it end to end.
- [ ] Create `services/shiftService.ts` and move `calculateMileageClaim`, `finalizeActiveSession`, and `saveManualShift` out of `App.tsx`. Those functions should return pure domain results and receive mutations via injected callbacks or repositories.
- [ ] Create `services/localPersistence.ts` and move `parseStoredJson` plus the new safe read/write helpers there.
- [ ] Create `services/analytics.ts` and move `trackEvent` out of `App.tsx` so analytics behavior is testable and no longer mixed into the top-level shell.
- [ ] Update `hooks/useBackupRestore.ts` so it imports only `services/settingsService.ts`, `services/syncTransforms.ts`, `schemas/backup.ts`, and `schemas/sync.ts`. It should not import anything from `App.tsx`.
- [ ] Update `hooks/useExport.ts` so it imports only `utils/csv.ts`. It should not import anything from `App.tsx`.
- [ ] Extract app-only orchestration hooks from `App.tsx`:
  - `hooks/useAppHydration.ts`
  - `hooks/useLocalPersistence.ts`
  - `hooks/useReceiptSync.ts`
  - `hooks/useSyncRecovery.ts`
  - `hooks/useShiftActions.ts`
- [ ] Reduce `App.tsx` to shell composition and tab routing only. After this phase it should no longer contain business-rule helpers or data-transform functions.
- [ ] Remove dead files from the shipped codebase:
  - `components/LiveTracker.tsx`
  - `components/ArcadeMode.tsx`
  - `components/GettingStartedChecklist.tsx`
  - `services/geminiService.ts`
- [ ] Remove the progression logic from `components/ArcadeMode.tsx` by either:
  - deleting it completely and removing gamification from the product
  - or moving the XP/level rules into a real `services/progression.ts` used by the shipped path
- [ ] Move inline business logic out of UI components:
  - `components/Dashboard.tsx` -> shift validation and draft normalization into `services/shiftValidation.ts`
  - `components/WorkLog.tsx` -> linked-record sync into `services/linkedRecords.ts`
  - `components/WeeklyReviewCard.tsx` -> weekly tax-pot summary into `services/weeklyReview.ts`
  - `components/TaxLogic.tsx` -> export row building into `services/taxExports.ts`
- [ ] Add `docs/architecture/runtime-modules.md` describing the new module boundaries so future hooks do not pull back from `App.tsx`.

**Acceptance criteria**

- [ ] `hooks/useBackupRestore.ts` and `hooks/useExport.ts` have no imports from `App.tsx`.
- [ ] `App.tsx` contains app composition and UI routing only; domain transforms and business logic live elsewhere.
- [ ] Dead files listed by the audit are removed from the repo and from the build graph.
- [ ] The sync DTO shape is defined once and matches what push, pull, restore, and tests use.

**Risk level**

Medium to high. This is a deep refactor, but it is mostly behavior-preserving if done after Phases 1 to 3.

**Projected scores after Phase 4**

Architecture 9.2, Application Flow 8.7, Logic 9.0, Reliability 9.1, Security 8.9, Performance 6.4, Test Coverage 7.2, Code Quality 9.2

## Phase 5: Performance

**What problem it solves**

This phase addresses the single-bundle build, eager loading of rarely used screens, heavy Sentry startup cost, and receipt preview inefficiency. The audit already measured a 678,736-byte JS bundle in `dist/assets/index.js`, and `components/ExpenseLog.tsx` currently recreates receipt object URLs for every expense whenever the array changes.

**Exact changes required**

- [ ] In `package.json` and `scripts/build.cmd`, retire the custom one-file JS bundling path in `scripts/build-main.mjs` and switch production builds to `vite build --configLoader native`, followed by the existing verification step in `scripts/build-verify.mjs`.
- [ ] In `vite.config.ts`, add `build.rollupOptions.output.manualChunks` so vendor code, Sentry, and heavy feature tabs are emitted as separate chunks instead of one browser bundle.
- [ ] In `App.tsx`, lazy-load non-primary tabs and modal sheets with `React.lazy` and `Suspense`:
  - `MileageLog`
  - `ExpenseLog`
  - `WorkLog`
  - `TaxLogic`
  - `TaxAssistant`
  - `DebtManager`
  - `SettingsPanel`
  - `FeedbackSheet`
  - `FaqSheet`
  - `BackfillSheet`
- [ ] In `src/sentry.ts`, split replay from the initial boot path. Load `replayIntegration()` only after user consent and after the initial route is interactive. Keep error capture, but do not make session replay part of the first screen's critical path.
- [ ] In `components/ExpenseLog.tsx`, move receipt preview loading into a dedicated hook such as `hooks/useReceiptObjectUrls.ts` that:
  - caches object URLs by expense ID plus a receipt-version key
  - only creates URLs for receipts newly added or changed
  - only revokes URLs that were removed or replaced
- [ ] In `services/imageStore.ts`, add memoized remote-read deduplication so multiple consumers do not fetch the same remote receipt blob at the same time.
- [ ] In `components/MileageLog.tsx` and `components/ExpenseLog.tsx`, replace month-key creation via `new Date().toISOString().slice(0, 7)` with the new UK-local month helper so the summary cards do not jump a month early around midnight UTC.
- [ ] Remove `recharts` from `package.json` if it is still unused after the refactor. Keep install size and dependency surface aligned with real features.
- [ ] Add bundle analysis output to `scripts/build-verify.mjs` so the build fails if a single eager chunk regresses beyond the agreed limit.

**Acceptance criteria**

- [ ] No single eagerly loaded JS chunk exceeds 350 KB uncompressed.
- [ ] The dashboard route does not eagerly include Tax, Settings, Debt, or feedback UI code.
- [ ] Editing one expense does not recreate object URLs for every existing receipt preview.
- [ ] Session replay is no longer part of the first-route critical path.

**Risk level**

Medium. The changes are mostly build and loading strategy changes, but they touch app startup and error monitoring.

**Projected scores after Phase 5**

Architecture 9.3, Application Flow 8.9, Logic 9.0, Reliability 9.2, Security 9.0, Performance 9.1, Test Coverage 7.4, Code Quality 9.3

## Phase 6: Test Coverage and Release Gates

**What problem it solves**

This phase closes the final gap between "better code" and a 9.5 release standard. The repo currently relies almost entirely on Playwright happy-path tests, several of those tests are stale, and there is no focused automated coverage for tax thresholds, restore safety, sync recovery, or linked-record consistency.

**Exact changes required**

- [ ] In `package.json`, add a real unit/integration runner and coverage tools:
  - `vitest`
  - `@vitest/coverage-v8`
  - `jsdom`
  - `@testing-library/react`
  - `@testing-library/user-event`
  - `msw`
- [ ] Add `vitest.config.ts` and `tests/setup.ts` so utility, hook, and component tests can run outside Playwright.
- [ ] Add `utils/date.test.ts`, `utils/tax.test.ts`, `services/linkedRecords.test.ts`, `services/restoreMerge.test.ts`, `services/imageStore.test.ts`, `hooks/useBackupRestore.test.ts`, `components/WeeklyReviewCard.test.tsx`, `components/SyncIndicator.test.tsx`, and `components/FeedbackSheet.test.tsx`.
- [ ] In `hooks/useBackupRestore.test.ts`, add the exact restore safety regression the audit called out: failed cloud pull must not mutate the installation ID or local state.
- [ ] In `services/imageStore.test.ts`, add receipt coverage for:
  - OPFS success path
  - IndexedDB fallback path
  - worker remote fallback path
  - legacy `receiptUrl` migration path
- [ ] Add new end-to-end specs:
  - `e2e/backup-restore.spec.ts`
  - `e2e/sync-recovery.spec.ts`
  - `e2e/linked-records.spec.ts`
  - `e2e/receipt-storage.spec.ts`
  - `e2e/tax-assumptions.spec.ts`
- [ ] Update stale Playwright specs in `e2e/dashboard.spec.ts`, `e2e/dashboard.mobile.spec.ts`, and `e2e/visual-smoke.spec.ts` so selectors and labels match the current UI after the earlier phases land.
- [ ] Add deterministic test fixtures in `e2e/helpers.ts` or `e2e/fixtures/` for:
  - UK date boundary cases
  - Scottish and rest-of-UK tax profiles
  - restore conflict cases
  - offline mutation queues
  - legacy receipt migration
- [ ] Add CI at `.github/workflows/ci.yml` that blocks merges unless `npm run typecheck`, `npm run build`, `npm run test:unit`, and `npm test` all pass.
- [ ] Set coverage thresholds in `vitest.config.ts`:
  - `utils/tax.ts` 100% statements and branches
  - `utils/date.ts` 100%
  - `services/restoreMerge.ts` 95%+
  - `services/imageStore.ts` 95%+
  - overall statements 90%+, branches 85%+

**Acceptance criteria**

- [ ] All new unit, integration, and Playwright suites pass on CI.
- [ ] `utils/tax.ts` and `utils/date.ts` have complete branch coverage for the rules changed in Phase 2.
- [ ] There is a regression test for every audit issue that produced a real bug or trust problem.
- [ ] CI blocks regressions instead of relying on manual post-build checks.

**Risk level**

Medium. The code risk is lower than earlier phases, but this phase will expose any unfinished behavior changes immediately.

**Projected scores after Phase 6**

Architecture 9.6, Application Flow 9.6, Logic 9.7, Reliability 9.6, Security 9.5, Performance 9.5, Test Coverage 9.7, Code Quality 9.6

## Final projected rating

If all six phases ship as written, with the worker code brought under review and the restore model upgraded from bearer UUIDs to authenticated recovery, the projected final scores are:

- Architecture: 9.6/10
- Application Flow: 9.6/10
- Logic and Correctness: 9.7/10
- Reliability: 9.6/10
- Security: 9.5/10
- Performance: 9.5/10
- Test Coverage: 9.7/10
- Code Quality: 9.6/10

Projected overall rating: 9.6/10

## Order of implementation

The order should stay:

1. Phase 1 before anything else, because later sync and restore work is not worth doing on top of a broken trust boundary.
2. Phase 2 next, because tax rules and date keys affect user-visible correctness everywhere.
3. Phase 3 after the data model is corrected, because restore, conflict handling, and retry behavior need the new record metadata and date helpers.
4. Phase 4 once behavior is correct, so the refactor is not moving bugs into new files.
5. Phase 5 after architecture settles, so lazy loading and build splitting target stable module boundaries.
6. Phase 6 last, but start adding the Phase 2 tests immediately as the code changes land. Do not batch every test until the end.
