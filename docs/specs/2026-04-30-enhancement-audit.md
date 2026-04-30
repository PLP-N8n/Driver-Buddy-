# Driver Buddy enhancement audit

Date: 2026-04-30  
Scope: product, UX, tax logic, data integrity, and sync reliability review of the current Driver Buddy codebase.

Verification note: this pass made no source-code changes. The current dirty worktree already contains uncommitted tax-accuracy code/test deltas. I updated only this report. `npm run typecheck` passed, then `npm run test:unit` passed with 21 test files and 183 tests. The literal `npm run typecheck && npm run test:unit` command could not run because this PowerShell version rejects `&&`, so the equivalent PowerShell exit-code check was used. Playwright was not run.

## Executive summary

- The six named tax-accuracy issues appear fixed in the current dirty worktree, not by this report-only pass: VAT-claimable costs are netted before deduction, sync payloads classify missing expense tax fields, mileage allowance uses tax-year context, the ExpenseLog callout has an upper tax-year bound, Playwright copy matches `TaxLogic`, and MileageLog display paths use cumulative tax-year miles. Current verification passes: 21 test files, 183 tests. Scenario-specific coverage is still thinner than requested for hook/UI paths.
- The core ledger is useful, but shift, mileage, and expense relationships are fragile. Post-shift "Add miles" opens MileageLog with a note only, not a durable shift link (`components/MileageLog.tsx:192-206`), while health checks use only `linkedTripId` and ignore actual trips (`utils/healthCheck.ts:64-99`). Deleting trips or expenses can leave stale shift totals or orphaned references (`hooks/useDriverLedger.ts:149-190`).
- The Tax tab is directionally strong: it separates deductions, Class 2, Class 4, payments on account, and simplified-vs-actual views (`components/TaxLogic.tsx:240-323`, `components/TaxLogic.tsx:415-454`). The broader app weakens trust by showing "set aside" from a fixed percentage on the dashboard rather than the tax engine (`components/dashboard/DashboardScreen.tsx:195-202`, `components/dashboard/EarningsSummary.tsx:63-75`).
- Platform support is still generic. Provider labels cover Uber, Bolt, Deliveroo, Amazon Flex, Evri, DPD, etc. (`components/dashboard/DashboardScreen.tsx:68-80`), but canonical sync collapses platforms to a narrow enum and maps Uber Eats to Uber (`shared/types/shift.ts:3`, `shared/migrations/migrateShift.ts:73-82`). There is no inbound earnings CSV import path, only exports.
- Sync/restore is close but not yet "tax-record trustworthy." Backup restore has review and rollback paths, but sync drops queued pushes after max retry (`services/syncService.ts:118-121`) and canonical shift restore does not restore `linkedTripId` (`services/syncTransforms.ts:381-417`). A user could restore data and lose mileage linkage signals.

## Priority 1 improvements

1. Replace the onboarding finish action with "Log your last shift" as the primary first-value path.

   New-user flow today: `useAppState` opens onboarding when `drivertax_onboarded` is missing (`hooks/useAppState.ts:45`), onboarding captures only role and claim method (`components/OnboardingModal.tsx:23-39`), then completion opens a live start sheet (`components/AppShell.tsx:1012-1016`). This is the wrong default for a user installing at home, between jobs, or after seeing a social link.

   Recommended first 5 minutes:
   - Step 1: role.
   - Step 2: "Log one recent shift" with date, platform, hours, earnings, optional miles.
   - Step 3: instant result: "You earned X, keep Y after your set-aside, mileage claim is Z, estimated tax impact is A."
   - Secondary action: "Start a live shift now."

   This one change most improves day-1 retention because it proves the tax/mileage value without requiring a live work session.

2. Make dashboard tax language match the actual tax engine.

   The dashboard, monthly summary, weekly review, insights, and ledger summaries repeatedly use `settings.taxSetAsidePercent` as if it is tax (`components/dashboard/DashboardScreen.tsx:195-202`, `components/dashboard/DashboardScreen.tsx:361-372`, `components/dashboard/MonthlySummaryCard.tsx:80-82`, `hooks/useDriverLedger.ts:390-392`). The Tax tab uses real liability logic via `buildTaxAnalysis` (`components/TaxLogic.tsx:100-128`).

   Low-effort fix:
   - Rename dashboard "Set aside" to "Your set-aside rule" or "Saved by your rule."
   - Add a small "Estimated tax bill" and "Tax pot gap" link from the dashboard to Tax.
   - Do not call percentage-based retained income "kept" without explaining it excludes the real Self Assessment calculation.

   Why this matters: drivers will treat the first dashboard number as advice. A fixed 20 percent default (`types.ts:359-375`) can be too high for low profit, too low once payments on account or other income applies, and confusing next to the Tax tab.

3. Fix mileage linkage integrity before adding more insight features.

   Current weak points:
   - WorkLog auto-creates linked trips when manual miles are entered (`components/WorkLog.tsx:710-731`), but clearing miles while editing does not remove an old linked trip or `linkedTripId`.
   - MileageLog opened from a completed shift stores only a note, "For completed shift" (`components/MileageLog.tsx:192-206`), so the shift still has no durable link.
   - WeeklySummary treats a completed shift as missing mileage when `linkedTripId` is absent (`components/dashboard/WeeklySummary.tsx:72-80`).
   - HealthCheck ignores the trips array entirely and only counts shift `linkedTripId` (`utils/healthCheck.ts:64-99`).
   - `deleteTrip` deletes the trip but does not unlink any DailyWorkLog (`hooks/useDriverLedger.ts:149-153`).

   Product impact: users can log mileage and still be told it is missing, or delete mileage and still look complete. This directly affects tax confidence.

   Recommended fix:
   - Persist `linkedShiftId` on trips or maintain a bidirectional link update when saving from the post-shift mileage CTA.
   - When a trip is deleted, clear matching shift `linkedTripId`.
   - Let health checks detect same-day business trips as fallback coverage, with a "confirm link" CTA.

4. Add clear validation to shift logging instead of silent returns.

   In the dashboard end-shift flow, `saveShift` returns with no user-facing error when revenue is zero or manual hours are invalid (`components/dashboard/DashboardScreen.tsx:677-696`). QuickAddForm displays "No earnings entered - are you sure?" but the save still silently fails upstream (`components/dashboard/QuickAddForm.tsx:441-442`). WorkLog validates revenue and hours but not provider/custom provider (`components/WorkLog.tsx:292-314`, `components/WorkLog.tsx:684-692`). Overnight shifts also calculate as zero hours because end time earlier than start time is clamped to zero (`components/WorkLog.tsx:278-287`).

   Low-effort fix:
   - Inline field errors for revenue, hours, provider, and custom provider.
   - Explicit "Save GBP 0 shift" or "Mark as no earnings" path if that is a real use case.
   - Handle overnight shifts by rolling end time into the next day when end < start.
   - Add odometer warnings when end < start or miles are implausibly high.

5. Reclassify expense tax treatment when claim method changes.

   Expenses are classified using the current claim method at add/edit time (`components/ExpenseLog.tsx:508-529`, `hooks/useDriverLedger.ts:158-170`). If a driver logs fuel under simplified mileage, it is stored as blocked. If they later switch to actual costs in Settings (`components/Settings.tsx:309-332`), old expenses may remain blocked unless individually edited. The sync payload also preserves complete stored classifications rather than recalculating them (`services/syncTransforms.ts:180-198`).

   This can materially understate or overstate deductions. Add a method-switch review step:
   - "Recalculate tax treatment for this tax year?"
   - Show how many vehicle-running expenses will change.
   - Store the selected tax method by tax year if the app supports historical years.

6. Make receipt/sync trust states visible in Settings.

   Settings currently imports LinkedDevices, Plaid, and ReceiptSync panels but hides them all (`components/Settings.tsx:27-30`, `components/Settings.tsx:76-80`). Expense receipt upload can be local-only or failed, but if upload is not configured `requestReceiptUpload` returns no status path for the user to understand. For a tax-record app, hidden sync and receipt states undermine confidence.

   Low-effort fix:
   - Show a simple "Records stored on this device" / "Cloud sync enabled" status.
   - Show receipt counts: local only, uploading, synced, failed.
   - Add a "Download accountant pack" CTA next to this status.

## Priority 2 improvements

1. Build an earnings import MVP, starting with Uber/Bolt CSV and manual platform statement templates.

   The app already exports CSV (`hooks/useExport.ts:45-57`, `utils/taxPack.ts:148-287`) and has source metadata for imported expenses (`shared/types/expense.ts:12`), but there is no inbound earnings import. Many drivers already have platform statements, payout CSVs, screenshots, or weekly summaries. Importing them would reduce the highest-friction data entry: historical earnings.

   Recommended shape:
   - "Import statement" in WorkLog and onboarding.
   - Uber/Bolt CSV parser first because private-hire drivers are likely to have more regular downloadable statements.
   - Then Deliveroo weekly statements and Amazon Flex block exports/manual templates.
   - Store import source, platform, statement period, row hash, and dedupe key.
   - Show a review screen before committing shifts.

2. Capture pay structure fields drivers actually reason about.

   Current shift capture is platform, revenue, hours, job count, optional miles/fuel, and provider splits (`components/dashboard/QuickAddForm.tsx:262-376`, `components/WorkLog.tsx:684-708`). Drivers commonly track:
   - Tips, boosts/surge, quests/incentives, waiting time, adjustments, cancellations, deductions, cash income.
   - Platform fees or commission where visible.
   - Job count, parcels/deliveries, returns, route/block ID.
   - Zone/city/airport/restaurant cluster.
   - Parking, tolls, ULEZ/CAZ/congestion charges linked to a shift.

   Add optional advanced fields, not default friction. The dashboard quick flow should stay minimal, with "Add breakdown" as disclosure.

3. Upgrade tax inputs for real-world Self Assessment planning.

   The tax engine correctly models personal allowance, Class 4, Class 2 as zero mandatory liability, and payments on account (`utils/tax.ts:39-47`, `utils/tax.ts:97-139`). Gaps:
   - Payments on account are based on the previous Self Assessment bill, but the app uses the current estimate as a proxy (`utils/tax.ts:135-139`, `components/TaxLogic.tsx:439-449`).
   - There is no input for previous-year tax bill, tax already collected at source, PAYE employment, pension contributions, student loan, or other income.
   - The explainer says "20% income tax" even for Scottish taxpayers (`components/TaxLogic.tsx:311-318`), although Settings supports a Scottish taxpayer toggle (`components/Settings.tsx:334-355`) and the engine has Scottish bands (`utils/tax.ts:71-95`).
   - VAT appears only as a per-expense checkbox (`components/ExpenseLog.tsx:939-956`); there is no VAT turnover warning or VAT profile.

   Recommended next tax profile:
   - Previous Self Assessment bill.
   - Amount paid through PAYE or otherwise collected at source.
   - Other taxable income estimate.
   - Student loan plan and pension contributions as optional advanced fields.
   - VAT registered toggle plus taxable-turnover warning near GBP 90,000.
   - Scottish-specific explainer copy when `isScottishTaxpayer` is true.

4. Add private-hire/PCO mode.

   Driver roles exist for private hire, courier, food delivery, and multi-app (`Settings.tsx:60-64`, `types.ts:359-363`), but the product experience is mostly generic. PCO/private-hire drivers need:
   - Licence, badge, MOT, vehicle plate, insurance, and medical renewal reminders.
   - Airport fees, congestion charge, ULEZ/CAZ, car wash, vehicle rental, operator rent.
   - Waiting time and dead mileage.
   - Weekly cashflow against vehicle rent/insurance direct debits.
   - A clear simplified-expenses caveat for vehicles that may not qualify for flat-rate mileage, such as black cabs or hackney carriages.

5. Make daily use more valuable than weekly catch-up.

   Daily reminders exist (`components/Settings.tsx:707-751`, `services/reminderService.ts:47-172`), and the dashboard has missed-day/backfill mechanics (`components/dashboard/IntelligenceFeed.tsx:118-130`, `components/BackfillSheet.tsx:45-87`). The app will become daily if the end-of-day closeout answers:
   - "Did I log all earnings today?"
   - "Did I capture mileage?"
   - "Did I capture fuel/charging/tolls?"
   - "How much should I move to tax pot now?"
   - "Was today better or worse than usual?"

   Build a post-shift checklist and "tonight's closeout" notification rather than only a generic log reminder.

## Priority 3 improvements

1. Make the IntelligenceFeed more immediately useful.

   Currently only one top prediction is shown after filtering dismissed items (`components/dashboard/DashboardScreen.tsx:394-401`), and the collapsed card hides the actual message behind generic copy (`components/dashboard/IntelligenceFeed.tsx:71-86`). Prediction logic is sensible but limited: it needs three eligible logs (`utils/predictions.ts:78-85`), provider/day logic ignores `providerSplits` (`utils/predictions.ts:125-160`), and target nudges only happen Wednesday/Thursday (`utils/predictions.ts:193-212`).

   Improvements:
   - Show the actual top insight in collapsed state.
   - Allow two or three compact insights when they differ by category.
   - Include confidence and sample size in plain language.
   - Use provider splits for multi-app shifts.

2. Improve expense completeness without adding friction.

   The app already nudges about expenses and uncategorised "Other" spending (`utils/insights.ts:299-318`). Add:
   - Role-specific recurring templates: insurance, phone, platform bag, parking, PCO licence, MOT, vehicle rental.
   - Weekly "missing common costs" review for drivers who log shifts but no fuel/charging/tolls.
   - "Receipt missing" and "receipt local-only" filters.

3. Better mileage completeness tools.

   MileageLog permits "Unknown start" / "Unknown end" and zero odometers as long as total miles is positive (`components/MileageLog.tsx:276-306`). That is useful for catch-up but risky for tax records. Add:
   - "Estimated miles" flag with reason.
   - Odometer consistency checks.
   - Weekly mileage reconciliation.
   - "Personal miles not logged" warning before actual-cost business-use percentage is trusted.

4. Make exports more accountant-ready.

   Current export paths are useful, but the accountant pack should include:
   - Selected tax method and method comparison.
   - Mileage-rate bands used.
   - Payments-on-account assumptions.
   - Receipt status counts.
   - Import source names and statement IDs.
   - Data-quality warnings: missing mileage, uncategorised expenses, local-only receipts, estimated odometer entries.

## Feature ideas

- Import hub: Uber/Bolt CSV, Deliveroo weekly statement, Amazon Flex block/route template, manual statement mapper, screenshot-to-review later if OCR becomes reliable enough.
- Daily driver cockpit: one screen for Start/End, earnings, miles, fuel/charging, tolls, and tax-pot action. Optimise for a driver finishing a shift on a phone.
- Tax readiness score: a visible checklist for "ready for Self Assessment" with missing mileage, missing receipts, uncategorised expenses, claim-method consistency, and backup/sync status.
- Platform profitability: compare GBP/hour, GBP/mile, GBP/job, net-after-fuel, and variance by weekday/time. Use provider splits, not just primary provider.
- Cashflow planner: upcoming tax, vehicle insurance, PCO costs, rent/finance, maintenance buffer, and "safe to spend" estimate.
- PCO compliance wallet: licence/insurance/MOT/vehicle plate expiry reminders and document storage.
- Vehicle method advisor: simplified mileage vs actual cost forecast, with rule caveats and a "you need personal miles logged before this is reliable" warning.
- Maintenance forecast: tyre/service/brake fund based on business miles and vehicle type.
- Shift quality tags: traffic, weather, event, zone, airport, school holidays. Use only if they feed insights.
- Accountant mode: locked tax-year records, export history, and "what changed since last export."

## Technical concerns

- Tax accuracy fix status in the current dirty worktree:
  - HIGH 1 is addressed through shared classification/deduction helpers. `calculateExpenseTaxClassification` uses VAT-exclusive tax basis amounts (`shared/calculations/expenses.ts:98-156`), `getTaxDeductibleAmount` caps legacy stored gross values (`shared/calculations/expenses.ts:158-190`), and `calcVehicleTaxDeductions` calls that helper (`shared/calculations/tax.ts:62-70`). Coverage exists for VAT-exclusive vehicle/parking expenses and a gross stored `deductibleAmount` regression (`shared/calculations/__tests__/tax.test.ts:81-139`).
  - HIGH 2 is addressed for current creation and sync payloads. Ledger add/update classifies all expenses before local storage (`hooks/useDriverLedger.ts:158-195`), active/manual shift expenses pass through `addExpense` (`hooks/useDriverLedger.ts:302-313`, `hooks/useDriverLedger.ts:415-425`), recurring dashboard expenses are classified at creation (`components/dashboard/DashboardScreen.tsx:317-337`), and `buildSyncPayload` classifies incomplete expenses before upload (`services/syncTransforms.ts:171-198`). Coverage exists for generic unclassified sync payload classification (`services/syncTransforms.test.ts:127-156`), but not the exact Phone/Data shift-flow path requested.
  - MEDIUM 1 is addressed in code: `calculateMileageClaim` now filters prior business miles to the tax year containing the shift date before applying the 45p/25p split (`hooks/useDriverLedger.ts:227-240`). Shared incremental allowance coverage exists (`shared/calculations/__tests__/mileage.test.ts:50-58`), but I did not find a hook-level test for "9,000 previous-tax-year miles plus 2,000 current-year miles."
  - MEDIUM 2 is addressed in code: the ExpenseLog deductible callout now filters `date >= taxYearStart && date <= taxYearEnd` and excludes unclassified vehicle-running costs (`components/ExpenseLog.tsx:136-144`). I did not find a unit/component test for the exact "1 January next tax year" callout scenario.
  - MEDIUM 3 is addressed by inspection: the Playwright smoke expectation now matches `TaxLogic` copy (`e2e/dashboard.spec.ts:79-83`, `components/TaxLogic.tsx:241`). This remains code-inspection only because Playwright was not run.
  - LOW is addressed in code: MileageLog calculates per-trip and monthly claimable amounts using prior tax-year business miles (`components/MileageLog.tsx:63-95`, `components/MileageLog.tsx:106-108`, `components/MileageLog.tsx:400-403`). Shared function coverage verifies the 25p band once the 10,000-mile band is exhausted (`shared/calculations/__tests__/mileage.test.ts:50-58`), but I did not find a component-level test for the exact 10,500 + 100-mile display.
- Test count before/after: no pre-fix baseline was available in this report-only pass. Current state is 21/21 test files and 183/183 tests passing. Since no source code changed during this pass, the before/after count for this pass is unchanged at 183.
- Full-state sync and conflict handling will get brittle. The orchestrator compares large state blobs via `JSON.stringify` (`hooks/useSyncOrchestrator.ts:45`) and schedules a full payload push on every hydrated state change (`hooks/useSyncOrchestrator.ts:200-205`). This is acceptable at 391 users, but record-level changes and conflict UI will matter as users accumulate years of tax data.
- Retry semantics are not trustworthy enough for tax records. After `MAX_PUSH_RETRIES`, sync clears the queued payload and emits an error (`services/syncService.ts:118-121`). The local data remains, but the user may assume sync will keep trying. It should show "not synced" until a successful later push and offer manual retry.
- Canonical sync can lose mileage linkage. Build payload pushes legacy `workLogs` with `linkedTripId` in JSON notes (`services/syncTransforms.ts:227-243`), but canonical `mileageLogs` always have `linkedWorkId: null` (`services/syncTransforms.ts:248-263`), and `applyPulledShiftWorkLogs` does not restore `linkedTripId` (`services/syncTransforms.ts:381-417`). The worker schema already stores `linked_work_id` (`workers/sync-api/src/routes/sync.ts:242-247`), so the client should use it.
- Shift expense totals can go stale. Manual and dashboard shift saves snapshot `expensesTotal` into DailyWorkLog (`hooks/useDriverLedger.ts:384-435`, `components/dashboard/DashboardScreen.tsx:704-752`), but `deleteExpense` and `updateExpense` only mutate expenses (`hooks/useDriverLedger.ts:182-195`). Dashboard totals sometimes use the shift snapshot (`components/dashboard/DashboardScreen.tsx:413-414`), while TaxLogic uses expenses directly. This can produce mismatched dashboard vs tax numbers.
- Actual-cost business-use percentage can be misleading. `buildTaxAnalysis` derives business use from logged business/personal/commute trip miles (`utils/tax.ts:171-177`). If a user logs only business trips and no personal miles, actual costs may look 100 percent business. Actual-cost mode needs a personal-mile baseline or explicit odometer reconciliation.
- Expense classification is stored too eagerly. Stored `taxTreatment` makes per-expense UI fast, but it becomes stale when claim method changes, tax rules change, or a tax-year view changes. Treat classification as derived for estimates, or store it with a tax year and method version.
- Platform identity is too narrow in canonical sync. `shared/types/shift.ts:3` supports only Uber, Deliveroo, Just Eat, Amazon Flex, Bolt, and Other. `migrateShift` maps Uber Eats to Uber and everything else to Other (`shared/migrations/migrateShift.ts:73-82`). This loses signal for Evri, DPD, Yodel, Stuart, Gophr, food vs ride-hail Uber, and future platform insights.
- Provider lists are duplicated. Dashboard and WorkLog each define role-based provider lists (`components/dashboard/DashboardScreen.tsx:68-80`, `components/WorkLog.tsx:50-63`). This will drift as platforms change. Move to one provider registry with role, platform type, import capabilities, and tax/business metadata.
- Prediction quality is limited by primary-provider attribution. PlatformBreakdown handles provider splits (`utils/platformInsights.ts:53-80`), but `generatePredictions` uses `log.provider` and whole-shift revenue/hours for provider/day insights (`utils/predictions.ts:125-160`). Multi-app drivers can get misleading "prioritise platform" advice.
- Several "future" settings/features are hidden, not clearly unavailable. `linkedDevices`, `receiptSync`, and `bankSync` are imported but disabled (`components/Settings.tsx:76-80`). This is fine during development, but once users depend on tax records, hidden reliability controls create support issues.

Tax source notes checked for this audit:

- GOV.UK Income Tax rates and allowances, updated for 2026 to 2027: <https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past>
- GOV.UK National Insurance contribution rates and allowances, including Class 4 2026 to 2027: <https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions>
- GOV.UK simplified expenses vehicle flat rates and vehicle restrictions: <https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles->
- GOV.UK payments on account rules: <https://www.gov.uk/understand-self-assessment-statement/payments-on-account>
- Scottish Government 2026 to 2027 Scottish Income Tax bands: <https://www.gov.scot/publications/scottish-income-tax-rates-and-bands/pages/rates-and-bands-2026-to-2027/>
- GOV.UK VAT registration threshold: <https://www.gov.uk/how-vat-works/vat-thresholds>
- GOV.UK sole trader registration and record-keeping responsibilities: <https://www.gov.uk/become-sole-trader/register-sole-trader>
