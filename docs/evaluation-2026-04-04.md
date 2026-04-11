# DriverTax Pro Evaluation

Audit date: 2026-04-04  
Project audited: `C:\Projects\ventures\Driver-Buddy`

Scope note: this review covered the source tree, config, docs, and Playwright tests/artifacts in the repo. `node_modules` and `dist` were excluded from source analysis, except for checking the built bundle size that already exists in `dist/assets`.

For HMRC-related checks, I compared the code against current GOV.UK guidance consulted on 2026-04-04:

- National Insurance rates and thresholds: <https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions>
- Simplified expenses guidance/manual: <https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim75001>
- Payments on account exceptions: <https://www.gov.uk/hmrc-internal-manuals/self-assessment-manual/sam1010>
- Budget 2025 Annex A rates and allowances: <https://www.gov.uk/government/publications/budget-2025-overview-of-tax-legislation-and-rates-ootlar/annex-a-rates-and-allowances>

## 1. Architecture & Structure

The project is organised sensibly at the folder level: components, hooks, services, and utilities are separated, and the domain types in `types.ts` give the app a reasonably coherent shape. The problem is that the runtime architecture has not caught up with that folder structure, so `App.tsx` is still the real application service layer, persistence layer, and page shell at the same time.

### Findings

- `App.tsx` is still carrying too many responsibilities: hydration, local persistence, sync scheduling, receipt upload orchestration, analytics, tab shell, modal orchestration, and shift completion logic all live in one file (`App.tsx:421-592`, `App.tsx:668-948`, `App.tsx:983-1393`).
- The extracted hooks are not fully independent. `useBackupRestore` imports `applyPulledExpenses`, `applyPulledTrips`, `applyPulledWorkLogs`, `normalizeSettings`, and `prepareExpensesForLocalState` back from `App.tsx`, and `useExport` imports `escapeCsvCell` from `App.tsx` (`hooks/useBackupRestore.ts:5-11`, `hooks/useExport.ts:3`). That creates an architectural cycle and makes `App.tsx` the hidden dependency root.
- State management is still acceptable for a medium-sized single-screen app, but it is starting to strain. There are many top-level `useState` slices plus prop drilling into `Dashboard`, `MileageLog`, `ExpenseLog`, `WorkLog`, and `Settings`, while cross-cutting behaviors are implemented through effects instead of one explicit domain store (`App.tsx:377-417`, `App.tsx:1090-1178`).
- The service boundaries are mixed in quality. `syncService.ts`, `deviceId.ts`, and `feedbackService.ts` are narrow and readable, while `imageStore.ts` blends local persistence, remote fetch fallback, and auth/signing concerns (`services/syncService.ts`, `services/deviceId.ts`, `services/feedbackService.ts`, `services/imageStore.ts:1-159`).
- `opfsStore.ts` is well-scoped and defensive, but it is effectively an implementation detail of `imageStore` rather than a first-class storage abstraction (`services/opfsStore.ts:1-98`, `services/imageStore.ts:71-118`).
- `geminiService.ts` is a dead stub and should either be removed or replaced with an interface boundary that reflects the current product (`services/geminiService.ts:1-4`).

### Rating

6/10

## 2. Application Flow

The main flows are understandable and mostly linear, which is a strength. The issues are around edge behavior: restore, sync recovery, and the guided dashboard flow all have cases where the app mutates important state before the operation is confirmed, or silently fails without clear recovery.

### Flow trace

1. App load: `index.tsx` initializes Sentry and registers the service worker, then `App.tsx` hydrates trips, expenses, logs, active session, summary, settings, and player stats from local storage, normalizes expenses, and initializes OPFS (`index.tsx`, `App.tsx:421-451`).
2. Dashboard: onboarding may appear first, then the dashboard renders either the empty state or the guided shift flow. Backfill prompting can auto-open 1.5 seconds after load if there are missed days (`components/OnboardingModal.tsx`, `components/Dashboard.tsx`, `components/BackfillSheet.tsx:59-72`).
3. Start shift: the dashboard collects provider/start odometer and calls `startActiveSession`, which creates the active session record and tracks an event (`App.tsx:668-681`).
4. End shift: the dashboard sheet collects earnings, odometer, fuel, and extra expenses, then calls `finalizeActiveSession` or `saveManualShift`, which create linked trip/expense/log records and the completed summary (`components/Dashboard.tsx:578-652`, `App.tsx:686-892`).
5. Sync: every post-hydration change to trips, expenses, logs, or settings triggers `schedulePush`, and receipt images are uploaded separately once online and configured (`App.tsx:531-592`).
6. Backup/restore: Settings delegates to `useBackupRestore`, which can download a JSON backup, restore a JSON backup, or restore from a backup code via cloud pull (`hooks/useBackupRestore.ts:51-142`, `components/Settings.tsx:453-525`).
7. Export: Settings export uses `useExport` for a combined records CSV; the Tax page separately produces tax summary and tax-pack CSVs (`hooks/useExport.ts:39-54`, `components/TaxLogic.tsx:163-194`).

### Findings

- The app load flow can be interrupted by an automatic backfill modal that opens after 1.5 seconds when missed days exist (`components/BackfillSheet.tsx:59-72`). This matches the current test evidence and is a real friction point for the primary dashboard CTA.
- `handleRestoreFromBackupCode` changes the local device ID before confirming that a cloud pull succeeds (`services/deviceId.ts:27-31`, `hooks/useBackupRestore.ts:103-121`). If the pull fails, the app has still mutated its sync identity.
- Backup-code restore overwrites current trips, logs, expenses, and settings wholesale, with no merge strategy and no rollback (`hooks/useBackupRestore.ts:124-127`).
- Backup-code restore does not restore `playerStats` at all, because cloud sync does not include it and the hook never sets it on that path (`hooks/useBackupRestore.ts:124-132`, `App.tsx:207-255`).
- The save flow in the dashboard has silent validation failure paths for invalid revenue/hours, and it swallows completion errors in a catch with no user feedback (`components/Dashboard.tsx:578-587`, `components/Dashboard.tsx:649-651`).
- The Settings copy says "Nothing is sent to any server without your action" and recommends CSV for moving devices, but the app auto-posts analytics and auto-syncs when configured, and CSV is not a full-fidelity device transfer (`components/Settings.tsx:521-525`, `App.tsx:128-139`, `App.tsx:533-534`).

### Rating

5/10

## 3. Logic & Correctness

The core arithmetic is mostly coherent, but it is not fully HMRC-correct, and several parts of the product overstate how precise the tax picture is. The biggest issues are incomplete tax-rule modelling, date-key mistakes, and data-model drift between work logs and mileage trips.

### Findings

- The default simplified mileage rates and Class 4 thresholds align with current 2025/26 HMRC defaults: the app defaults to `0.45`/`0.25` (`types.ts:212-213`) and calculates Class 4 at 6% / 2% above `GBP 12,570` and `GBP 50,270` (`utils/tax.ts:3-7`, `utils/tax.ts:34-41`). That part is correct against current GOV.UK guidance.
- The income tax calculation omits the personal allowance taper above adjusted net income of `GBP 100,000`. `buildProjection` always deducts the full `GBP 12,570` allowance once profit exceeds that level (`utils/tax.ts:17-31`). That materially understates liability for higher earners.
- Payments on account are modelled as "bill > GBP 1,000" only (`utils/tax.ts:51-54`). HMRC also has the "more than 80% deducted at source" exception, which the app does not model.
- The app lets any user choose simplified mileage in onboarding/settings (`components/OnboardingModal.tsx:23-35`, `components/Settings.tsx:180-199`), but it does not model vehicle eligibility. That matters because the product targets taxi drivers too, while HMRC simplified vehicle rules are not universally valid across all taxi cases.
- The app also assumes one UK tax regime. There is no region flag or Scottish-rate handling, so the tax estimator is effectively rest-of-UK only (`utils/tax.ts:17-31`, `types.ts:85-110`).
- The expense category model is too narrow for a tax product that claims HMRC usefulness. Only `PARKING` and `OTHER` count as non-vehicle business expenses in the estimator, while categories like phone, accountancy, subscriptions, or platform equipment do not exist explicitly (`types.ts:58-67`, `utils/tax.ts:85-104`).
- `WeeklyReviewCard` estimates tax-pot status from `dailyLogs.milesDriven`, not from the actual mileage log used in the tax analysis. That can produce a different liability estimate from the Tax screen for the same week (`components/WeeklyReviewCard.tsx:25-37`).
- The work-log and mileage models can diverge. Editing a linked work log updates only a subset of trip fields and leaves `endLocation`/odometer fields stale; if miles are edited back to zero, the linked trip is not removed (`components/WorkLog.tsx:612-632`, `components/MileageLog.tsx:391-394`).
- `generateInsights` uses `expensesTotal` as fuel spend when computing "fuel cost per mile", so any non-fuel expenses inflate that metric (`utils/insights.ts:91-96`).
- The progression system is incomplete. In the live app, `playerStats` only updates `totalLogs` (`App.tsx:498-506`), while XP/level/rank logic lives in the unused `ArcadeMode` component. That means progression is not really functioning in the shipped path (`components/ArcadeMode.tsx`, not imported anywhere).
- Date keys are built with `toISOString().split('T')[0]` in many places (`App.tsx:126`, `components/WorkLog.tsx:73-74`, `utils/habitEngine.ts:20`, `utils/shiftPredictor.ts:93`, `utils/ui.ts:23`, `types.ts:224`). That is UTC-based, not UK-local-date-based, and can misclassify a day/week around midnight or DST.

### Rating

5/10

## 4. Reliability

The app is local-first and therefore reasonably resilient for basic offline capture. The weak point is sync and state recovery: offline changes do not reliably recover, storage writes are optimistic and unchecked, and some persistence flows replace whole datasets without validation.

### Findings

- Offline-first is partially implemented. Local data is always persisted, service worker shell caching exists, and receipts are stored locally first (`App.tsx:475-497`, `public/sw.js:1-64`, `services/imageStore.ts:71-118`).
- Sync retry is incomplete. `retryPendingPush()` exists but is never wired to reconnect or visibility events, so queued offline changes can stay unsent until another app mutation happens (`services/syncService.ts:50-52`, `App.tsx:533-534`).
- Sync has no conflict resolution, versioning, or merge model. It is effectively "last snapshot wins" on push/pull (`services/syncService.ts:32-48`, `services/syncService.ts:54-122`, `App.tsx:207-255`).
- `SyncIndicator` hides itself entirely when status is `error` or `offline`, which removes the only built-in status surface exactly when the user most needs one (`components/SyncIndicator.tsx:58-68`).
- Local storage writes are unguarded. Every major slice is `JSON.stringify`'d straight into `localStorage` in effects without `try/catch` or quota handling (`App.tsx:475-497`).
- Backup restore trusts parsed JSON shape with no schema validation or version migration beyond a loose `version: '1.0'` in the exported payload (`hooks/useBackupRestore.ts:51-89`).
- OPFS usage is cautious and mostly safe, but quota/support failures are swallowed and not surfaced, so the app may silently fall back without the user knowing (`services/opfsStore.ts:7-98`, `services/imageStore.ts:71-118`).
- React effect cleanup is generally decent. `useConnectivity`, `BackfillSheet`, `HabitCard`, `Toast`, `UpdateBanner`, and receipt URL cleanup all clear timers/listeners correctly (`hooks/useConnectivity.ts:13-33`, `components/BackfillSheet.tsx:70-72`, `components/ExpenseLog.tsx:163-199`, `components/UpdateBanner.tsx:15`).
- One cleanup gap remains in `FeedbackSheet`: it schedules timeouts after submit but never clears them on unmount/close (`components/FeedbackSheet.tsx:46-52`).

### Rating

4/10

## 5. Security

The app is not obviously vulnerable to classic React XSS in normal rendering, but the receipt-auth design is fundamentally weak, and the server-side worker that should enforce trust boundaries is not present in this repo. The security posture is adequate only for low-sensitivity personal record keeping, not for a strong cross-device backup or protected receipt service.

### Findings

- The biggest issue is the "shared secret" for receipt signing being shipped to the browser. `imageStore.ts` imports `RECEIPT_SECRET` from build-time env and uses it to compute `X-Device-Signature` client-side (`services/imageStore.ts:7-38`, `services/imageStore.ts:132-159`, `docs/environment-variables.md:15`). That means any user who can run the app can derive valid signatures.
- The repo does not contain the Cloudflare worker implementation, so the HMAC verification and receipt authorization logic cannot be audited here. Only the client calls are present (`services/imageStore.ts`, `services/syncService.ts`, `services/feedbackService.ts`).
- The backup code is just the persisted device UUID (`services/deviceId.ts:23-31`). That is acceptable as a convenience identifier, but it is not strong authentication for cloud restore.
- `trackEvent` posts to `/api/events` with the device ID whenever configured and online (`App.tsx:128-139`). That is pseudonymous rather than directly personal, but it is still an identifier and should be documented more carefully in the product copy.
- The CSP is only moderate. `public/_headers` allows `'unsafe-inline'` in `script-src`, which weakens script injection protection (`public/_headers:6`).
- `Permissions-Policy` explicitly disables geolocation (`public/_headers:5`) while `metadata.json` still requests it (`metadata.json:5`). That is not a direct vulnerability, but it is a policy/config mismatch.
- I did not find obvious raw HTML injection or `dangerouslySetInnerHTML` usage in the application code. React rendering is mostly standard and therefore benefits from the default escaping behavior.

### Rating

3/10

## 6. Performance

The app is probably fast enough on a modern phone for small datasets, but the build strategy is working against it. Everything is bundled into a single eagerly loaded JS file, and some runtime paths do more work than they need to when datasets grow.

### Findings

- The current built bundle is large for a single-screen utility app: `dist/assets/index.js` is 678,736 bytes and `dist/assets/index.css` is 71,118 bytes.
- The custom build always emits one bundled browser file with no code splitting (`scripts/build-main.mjs:27-39`). That means every feature, including rarely used ones, ships on first load.
- The biggest likely contributor is the combination of single-bundle packaging plus bundled Sentry tracing/replay. This is an inference, but it is well-supported by the build setup and `src/sentry.ts`, which enables `browserTracingIntegration()` and `replayIntegration()` in production (`src/sentry.ts:24-25`, `scripts/build-main.mjs:27-39`).
- `ExpenseLog` recreates receipt object URLs for all expenses whenever `expenses` changes (`components/ExpenseLog.tsx:163-191`). That is cleaned up correctly, but it scales linearly with every expense update.
- Heavy calculations are mostly memoized, which is good, but the app still recomputes broad aggregates in render-adjacent code across multiple components (`components/Dashboard.tsx`, `components/WeeklyReviewCard.tsx`, `components/TaxLogic.tsx`).
- `recharts` is still declared in `package.json` but appears unused in source (`package.json:24`), which is install bloat even if it may not currently affect the final bundle.

### Rating

5/10

## 7. Test Coverage

The existing E2E suite covers a narrow happy-path slice of the product and some visual smoke checks. It does not cover the most failure-prone areas: restore, offline recovery, receipt handling, tax edge cases, and data consistency between linked entities.

### Findings

- `dashboard.spec.ts` covers the empty dashboard state, accountant export, tax export, and one complete work-day happy path (`e2e/dashboard.spec.ts:5-109`).
- `dashboard.mobile.spec.ts` covers a quick-add trip flow and mobile bottom navigation behavior.
- `postdeploy-regressions.spec.ts` and `visual-smoke.spec.ts` exercise seeded states and a few regression checks, but they are still UI-smoke tests rather than correctness tests.
- There is no automated coverage for JSON backup restore, backup-code restore, restore failure handling, schema migration, or the fact that backup-code restore changes device identity before the pull succeeds (`hooks/useBackupRestore.ts:62-132`, `services/deviceId.ts:27-31`).
- There is no test coverage for sync retry behavior, offline reconnection, conflict scenarios, or the hidden error/offline sync indicator states (`services/syncService.ts`, `components/SyncIndicator.tsx`).
- There are no focused tests around tax thresholds, personal allowance taper, Scottish/non-Scottish handling, payments-on-account exceptions, or simplified-vs-actual comparison edge cases (`utils/tax.ts`, `utils/taxPack.ts`).
- There are no tests for linked trip/work-log consistency when editing or deleting either side (`components/WorkLog.tsx`, `components/MileageLog.tsx`).
- The current internal test report already shows several failing/stale checks, which suggests the suite is not yet a reliable regression gate (`docs/test-report-2026-04-04.md`).

### Highest-value missing tests

- A restore safety test that verifies backup-code restore does not mutate the local identity/state when cloud pull fails.
- Tax threshold tests around `GBP 12,570`, `GBP 50,270`, `GBP 100,000`, and `GBP 125,140`.
- An offline sync recovery test: edit data offline, reconnect, verify queued push is sent and surfaced to the user.
- A linked trip/work-log consistency test for edit/delete/update paths.
- A receipt persistence test covering OPFS/IndexedDB local read, remote fallback, and deletion.

### Rating

4/10

## 8. Code Quality

The codebase is readable and mostly typed, and there are good defensive choices in several places. The main quality problems are inconsistency, dead code, unsafe assumptions at data boundaries, and the amount of business logic embedded directly in UI components.

### Findings

- TypeScript usage is mostly solid in the domain model, but several data-boundary paths rely on unsafe casts and trust external shapes, for example `JSON.parse(... as string)` and `(await pull()) as SyncPullPayload | null` (`hooks/useBackupRestore.ts:68`, `hooks/useBackupRestore.ts:113`).
- Error handling is inconsistent. Some areas capture to Sentry and continue, some show toasts, and some silently return or swallow errors (`components/Dashboard.tsx:580-587`, `components/Dashboard.tsx:649-651`, `App.tsx:579-580`, `hooks/useBackupRestore.ts:82-85`).
- There is dead or disconnected code: `components/LiveTracker.tsx`, `components/ArcadeMode.tsx`, `components/GettingStartedChecklist.tsx`, and `services/geminiService.ts` are not part of the active application path.
- Product messaging and product behavior have drifted apart. The metadata still requests geolocation and mentions removed AI features, while the app has a stubbed AI service and geolocation is blocked by policy (`metadata.json`, `services/geminiService.ts`, `public/_headers:5`).
- The domain model has duplication between `DailyWorkLog.provider` and `providerSplits`, and between mileage trips and `milesDriven` on logs (`types.ts:35-56`). That duplication is the source of several consistency problems elsewhere.
- A positive note: object URL cleanup, service-worker update prompting, Sentry boundary wiring, and explicit domain types are all better than average for a small solo codebase (`components/ExpenseLog.tsx:176-199`, `components/UpdateBanner.tsx`, `index.tsx`, `types.ts`).

### Rating

6/10

## Overall Rating

5/10

This is a credible, usable prototype with a real product shape: local-first persistence, a coherent driver workflow, useful tax/export features, and generally readable React/TypeScript code. It is not yet a robust finance app. The biggest reasons the score stays at 5 are: incomplete tax-rule modelling, fragile sync/restore behavior, a fundamentally weak receipt-auth design, UTC/local-date bugs, and data consistency drift between linked records.

## Top 5 Priorities

1. Replace the client-side receipt secret design with a real server-side trust boundary, and audit the missing Cloudflare worker implementation before treating cloud receipt storage as secure.
2. Standardise all business date handling on UK-local date utilities instead of `toISOString().split('T')[0]`, then re-audit tax-year, week, streak, and "today" calculations.
3. Refactor `App.tsx` into an app shell plus domain modules/store. Break the hook-to-`App.tsx` dependency cycle and move hydration, sync, backup, and shift orchestration into testable units.
4. Harden sync and restore: add reconnect retry, visible offline/error states, schema/version validation, merge or conflict handling, and safe rollback if backup-code pull fails.
5. Correct the tax and data-model gaps: personal allowance taper, payments-on-account exception logic, regional/vehicle eligibility handling, and linked trip/work-log consistency.
