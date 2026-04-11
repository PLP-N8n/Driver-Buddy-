# DriverTax Pro Test Report

Date: 2026-04-04
Environment: local Windows workspace, Node/npm from project lockfile, Vite preview on `http://127.0.0.1:4173`
App version under test: current workspace state in `C:\Projects\ventures\Driver-Buddy`

## Executive Summary

The app passes static validation and production build verification, but the end-to-end runtime suite is currently unstable.

- `npm run typecheck`: passed
- `npm run build`: passed
- `npm test` (`playwright test`): failed
- Playwright result: 2 passed, 7 failed, 9 total
- Manual browser check: app loads, but console shows a failing analytics/events request and automated evidence confirms several UI/test mismatches

Main conclusion: the codebase is buildable, but not release-ready from a test reliability perspective. At least two runtime issues look real in product behavior, and several failing tests are stale relative to the current UI.

## Commands Run

```powershell
Set-Location 'C:\Projects\ventures\Driver-Buddy'; npm run typecheck
Set-Location 'C:\Projects\ventures\Driver-Buddy'; npm run build
Set-Location 'C:\Projects\ventures\Driver-Buddy'; npm test
Set-Location 'C:\Projects\ventures\Driver-Buddy'; npx vite preview --host 127.0.0.1 --port 4173 --configLoader native
npx --yes --package @playwright/cli playwright-cli open http://127.0.0.1:4173 --session driverbuddy2
npx --yes --package @playwright/cli playwright-cli snapshot --session driverbuddy2
npx --yes --package @playwright/cli playwright-cli console error --session driverbuddy2
```

## Result Breakdown

### 1. Static Validation

`npm run typecheck` passed with no TypeScript errors.

### 2. Production Build

`npm run build` passed.

Build verification output:

- Bundle size OK: `663.2 KB`
- No unresolved `import.meta.env` references
- `VITE_SYNC_WORKER_URL` baked into the build
- React `createRoot` present

### 3. End-to-End Test Suite

`npm test` ran 9 Playwright tests.

Passed:

- `e2e/dashboard.mobile.spec.ts` -> `mobile quick-add trip creates a mileage entry`
- `e2e/dashboard.mobile.spec.ts` -> `mobile more menu reaches the export modal`

Failed:

- `e2e/dashboard.spec.ts` -> `shows the empty dashboard state for a new user`
- `e2e/dashboard.spec.ts` -> `downloads the accountant export CSV from settings`
- `e2e/dashboard.spec.ts` -> `downloads the tax summary report from the reporting page`
- `e2e/dashboard.spec.ts` -> `completes a work day and rolls the results into dashboard totals`
- `e2e/postdeploy-regressions.spec.ts` -> `sync failures stay hidden and log tabs default to list view`
- `e2e/visual-smoke.spec.ts` -> `captures intelligence, tax, and trust visual states`
- `e2e/dashboard.mobile.spec.ts` -> `mobile dashboard shows dock and bottom navigation actions`

Artifacts generated:

- HTML report: `output/playwright/report/index.html`
- Failure screenshots/videos/traces: `output/playwright/results/`
- Successful visual smoke screenshots:
  - `screenshots/habit-card-streak.png`
  - `screenshots/habit-card-reengagement.png`
  - `screenshots/prediction-card.png`
  - `screenshots/tax-pack-section.png`
  - `screenshots/trust-saved-indicator.png`
  - `screenshots/offline-banner.png`

## Findings

### High: Sync retry behavior appears broken under failure

Evidence:

- Playwright regression test expected the sync indicator to disappear after a forced sync failure, but it remained visible in `syncing` state.
- Failure artifact showed `Saving to cloud. Data is also saved locally.`

Relevant code:

- `services/syncService.ts:87`
- `services/syncService.ts:93`

Why this looks real:

- On push failure, the service re-queues the payload and emits `error`.
- In `finally`, it immediately calls `flushQueuedPush()` again if queued data exists.
- That creates an immediate retry loop instead of backing off or staying in error state.

Impact:

- Persistent sync spinner
- Repeated failing requests
- User cannot trust sync status
- Post-deploy regression test fails for a good reason

### Medium: Backfill sheet blocks the primary dashboard flow for a new/empty user state

Evidence:

- Three desktop tests timed out trying to click `Start Shift`.
- Playwright reported pointer interception by the backfill sheet overlay.
- Failure screenshots clearly show the modal covering the main dashboard.

Relevant code:

- `components/BackfillSheet.tsx:59`
- `components/BackfillSheet.tsx:71`
- `components/BackfillSheet.tsx:85`

Why this matters:

- On empty data, the app computes missed days and auto-opens a blocking sheet immediately.
- That prevents the user from reaching the primary call to action without first dismissing or resolving the catch-up flow.

Impact:

- Blocks the main task entry point
- Causes automated test failures
- Likely degrades first-run UX for real users

### Medium: Duplicate `data-testid` values break strict selectors and visual capture

Evidence:

- Visual smoke failed because `getByTestId('settings-your-data')` matched two elements.

Relevant code:

- `components/Settings.tsx:89`
- `components/Settings.tsx:127`

Impact:

- Visual test is non-deterministic
- Any strict selector using this test id will fail
- The intended "Your Data" settings section cannot be targeted reliably

### Medium: Event tracking endpoint returns 404 in the built app

Evidence:

- Manual Playwright CLI console inspection reported:
  - `Failed to load resource: the server responded with a status of 404 () @ https://drivertax-sync-api.cvchaudhary.workers.dev/api/events`

Relevant code:

- `App.tsx:147`
- `App.tsx:152`
- `App.tsx:155`

Impact:

- Noisy production console
- Analytics/event tracking appears misconfigured or undeployed
- The failure is silent in app code because the fetch is fire-and-forget

### Low: Several Playwright assertions are stale relative to the current UI

Evidence from current UI and source:

- Empty-state copy is now `Track your earnings`, not `Log your earnings`
  - `components/Dashboard.tsx:986`
- Quick action label is `Quick add shift`, not `Quick add work day`
  - `App.tsx:1348`
- Beginner users intentionally hide `Mileage` and `Expenses` tabs until `playerStats.totalLogs >= 3`
  - `App.tsx:443`
  - `App.tsx:444`

Impact:

- Inflates failure count
- Reduces confidence in suite signal
- Masks the product issues that are actually real

## Test-by-Test Interpretation

### Likely real product/runtime issues

- `sync failures stay hidden and log tabs default to list view`
  - Likely a real regression in sync retry/status handling.
- `downloads the accountant export CSV from settings`
  - Blocked by the auto-opening backfill sheet, which looks like a real UX/runtime problem.
- `downloads the tax summary report from the reporting page`
  - Same blocker as above.
- `completes a work day and rolls the results into dashboard totals`
  - Same blocker as above.

### Likely stale tests

- `shows the empty dashboard state for a new user`
  - Copy and CTA labels no longer match the current interface.
- `mobile dashboard shows dock and bottom navigation actions`
  - Expects old quick-action naming.
- `captures intelligence, tax, and trust visual states`
  - Fails because of duplicated test ids, not because screenshots before that step were broken.

## Coverage Notes

What was validated successfully:

- TypeScript compile safety
- Production build pipeline
- Mobile quick-add trip creation flow
- Mobile More menu -> export modal flow
- Several screenshot capture states before the final visual smoke failure

What remains unverified due current failures:

- Full desktop shift lifecycle without modal interference
- Desktop CSV export flows end to end
- Stable sync failure UX
- Full settings visual capture

## Recommended Next Actions

1. Fix sync retry behavior so failed pushes do not immediately recurse.
2. Rework first-run/backfill behavior so it does not block the primary dashboard CTA.
3. Make settings test ids unique.
4. Update Playwright specs to match current labels and beginner/advanced navigation behavior.
5. Fix or disable the `/api/events` endpoint call in non-working environments.

## Evidence Paths

- Playwright HTML report: `output/playwright/report/index.html`
- Playwright last run summary: `output/playwright/results/.last-run.json`
- Example failure screenshot:
  - `output/playwright/results/dashboard-downloads-the-accountant-export-CSV-from-settings-desktop-chromium/test-failed-1.png`
- Example sync failure screenshot:
  - `output/playwright/results/postdeploy-regressions-syn-c5454-g-tabs-default-to-list-view-desktop-chromium/test-failed-1.png`
- Example visual failure screenshot:
  - `output/playwright/results/visual-smoke-captures-inte-b6041-tax-and-trust-visual-states-desktop-chromium/test-failed-1.png`
