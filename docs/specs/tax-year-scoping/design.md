# tax-year-scoping — design

## Goal

Stop overstating "this tax year" totals on the Dashboard and Tax screens for any user with records that pre-date 2026-04-06. The bug undermines the only number drivers actually care about — what HMRC will demand.

## Context

The UK tax year runs Apr 6 – Apr 5. The codebase already has the right helpers in `utils/ukDate.ts`:
- `getTaxYear()` — returns the starting calendar year of the current tax year
- `ukTaxYearStart()` / `ukTaxYearEnd()` — `YYYY-MM-DD` boundaries
- `isInCurrentTaxYear(dateStr)` — single-record boolean check

Where the bug lives:
1. `components/TaxLogic.tsx:93` — `buildTaxAnalysis({ trips, expenses, dailyLogs, settings })` is called with **unfiltered** collections. The `filteredLogs/filteredTrips/filteredExpenses` declared at lines 116–118 are only consumed by the export-pack section (`taxPack` useMemo, line 119+). The tax projection itself sees all-time data.
2. `components/dashboard/DashboardScreen.tsx:348–352` — `totalRevenue`, `totalExpenses`, and `totalBusinessMiles` are reduced from full `dailyLogs` and `trips` arrays. These totals feed `<TaxEstimateCard />` (`components/dashboard/TaxEstimateCard.tsx`) under the heading "This tax year".
3. `components/dashboard/TaxEstimateCard.tsx` — innocent. It renders whatever totals it's given. Fix at the producer, not the consumer.

The export pack (`utils/taxPack.ts:85`) already builds its own `buildTaxAnalysis` call from the filtered collections in `useExport.ts`. That path is correct and stays untouched.

## Approach

1. Add `filterToCurrentTaxYear<T extends { date: string }>(items: T[]): T[]` to `utils/ukDate.ts`. One-line wrapper around `items.filter((item) => isInCurrentTaxYear(item.date))`.
2. In `TaxLogic.tsx`, replace the call site at line 93:
   ```
   buildTaxAnalysis({ trips, expenses, dailyLogs, settings })
   ```
   with the filtered inputs:
   ```
   buildTaxAnalysis({
     trips: filterToCurrentTaxYear(trips),
     expenses: filterToCurrentTaxYear(expenses),
     dailyLogs: filterToCurrentTaxYear(dailyLogs),
     settings,
   })
   ```
   Drop the duplicate `filteredLogs/Trips/Expenses` declarations (lines 116–118) once the helper covers them, OR keep them (they're identical to the new helper output) and pass them in. Choose whichever produces the smaller diff.
3. In `DashboardScreen.tsx`, wrap the three reductions at 348–352 with `filterToCurrentTaxYear(...)` before `.reduce(...)`.
4. Add the tax-year label to the Tax screen header. The format is `2026/27` for the year starting 2026-04-06 — derived from `getTaxYear()` and `(getTaxYear() + 1) % 100`.
5. Tests:
   - Unit: `utils/ukDate.test.ts` boundary cases for `filterToCurrentTaxYear`.
   - Unit: `components/TaxLogic.test.tsx` (new) — render with two-year fixture, assert displayed totals are current-year only.
   - E2E: extend `e2e/dashboard.spec.ts` with a fixture containing prior-year entries; assert `data-kept-estimate` matches current-year subset.

## Out of scope

- Multi-tax-year switcher UI (let users compare 2025/26 vs 2026/27). Defer to a later spec.
- Historical tax-year exports. The existing tax-pack export already supports per-year exports via `useExport.ts` arguments.
- Re-categorising historical records. Records keep their original dates; this spec is about filtering, not migration.
- Changing `isInCurrentTaxYear`'s boundary handling — it's already correct (inclusive of Apr 6 start, inclusive of Apr 5 end).

## Testing

1. Unit (vitest): `utils/ukDate.test.ts` — 4 boundary cases for `filterToCurrentTaxYear`.
2. Unit (vitest + Testing Library): `components/TaxLogic.test.tsx` — feed two-year fixture, assert `analysis.totalRevenue` equals the current-year subset sum.
3. E2E (Playwright): `e2e/dashboard.spec.ts` — load with prior-year fixture, read `data-kept-estimate` from `<TaxEstimateCard />`, compare against expected current-year-only kept estimate.
4. Manual smoke: open production build, confirm tax-year header reads `2026/27`, totals match a hand-calculated current-year sum.
5. Regression guard: `npm test -- tax` and `npm test -- taxPack` pass unchanged.
