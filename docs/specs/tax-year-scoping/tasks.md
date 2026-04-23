# tax-year-scoping — tasks

## Task 1 — Add `filterToCurrentTaxYear` helper

- [ ] Open `C:/Projects/ventures/Driver-Buddy/utils/ukDate.ts`
- [ ] Append exported helper:
  - signature: `export function filterToCurrentTaxYear<T extends { date: string }>(items: T[]): T[]`
  - body: `return items.filter((item) => isInCurrentTaxYear(item.date));`
- [ ] Open `C:/Projects/ventures/Driver-Buddy/utils/ukDate.test.ts` (create if missing)
- [ ] Add 4 boundary test cases:
  - `2026-04-05` (prior year) excluded
  - `2026-04-06` (start of current year on 2026-04-21) included
  - `2027-04-05` (end of current year) included
  - `2027-04-06` (next year) excluded
- [ ] Verify: `npm test -- ukDate` passes
- [ ] Commit: `feat(ukDate): add filterToCurrentTaxYear helper`

## Task 2 — Fix TaxLogic input filtering

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/TaxLogic.tsx`
- [ ] Import `filterToCurrentTaxYear` from `../utils/ukDate`
- [ ] At line 93 (`buildTaxAnalysis` call), wrap each of `trips`, `expenses`, `dailyLogs` with `filterToCurrentTaxYear(...)`
- [ ] Decide: drop the duplicate filter declarations at lines 116–118 (use the helper everywhere) OR keep them as memos that the helper returns. Pick the smaller diff.
- [ ] Verify: open `npm run dev`, navigate to Tax tab with seeded two-year data; "Total revenue" reflects only current-year records
- [ ] Commit: `fix(TaxLogic): scope tax analysis to current tax year`

## Task 3 — Fix Dashboard "This tax year" totals

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/dashboard/DashboardScreen.tsx`
- [ ] Import `filterToCurrentTaxYear` from `../../utils/ukDate`
- [ ] At lines 348–352, replace:
  - `dailyLogs.reduce(...)` → `filterToCurrentTaxYear(dailyLogs).reduce(...)` for `totalRevenue` and `totalExpenses`
  - `trips.filter((trip) => trip.purpose === 'Business').reduce(...)` → first `filterToCurrentTaxYear(trips)`, then existing chain
- [ ] Verify: open Dashboard with seeded two-year data; `<TaxEstimateCard />` totals reflect only current year
- [ ] Commit: `fix(Dashboard): scope this-tax-year totals to current UK tax year`

## Task 4 — Add tax-year label to Tax screen header

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/TaxLogic.tsx`
- [ ] Compute label inline: `const taxYearLabel = \`\${getTaxYear()}/\${String((getTaxYear() + 1) % 100).padStart(2, '0')}\`;`
- [ ] Find the existing "Tax year {TAX_YEAR_LABEL}" string at line 256 — replace `TAX_YEAR_LABEL` constant usage with the computed `taxYearLabel` if `TAX_YEAR_LABEL` is hardcoded
- [ ] Verify: header reads `Tax year 2026/27` on 2026-04-21
- [ ] Commit: `chore(TaxLogic): show dynamic tax-year label in header`

## Task 5 — Unit test: TaxLogic filters by current tax year

- [ ] Create `C:/Projects/ventures/Driver-Buddy/components/TaxLogic.test.tsx`
- [ ] Build a two-year fixture (`dailyLogs` with 5 entries spanning 2025-12-01 → 2026-06-01, expenses similar)
- [ ] Render `<TaxLogic />` with the fixture, mount via React Testing Library
- [ ] Assert displayed "Total earned" / `analysis.totalRevenue` equals the sum of only post-2026-04-06 entries
- [ ] Verify: `npm test -- TaxLogic` passes
- [ ] Commit: `test(TaxLogic): assert tax-year filtering of dailyLogs/trips/expenses`

## Task 6 — E2E: Dashboard prior-year fixture

- [ ] Open `C:/Projects/ventures/Driver-Buddy/e2e/dashboard.spec.ts`
- [ ] Add a new test case: seed `localStorage` with a prior-year work log + a current-year work log
- [ ] Read `data-kept-estimate` attribute from `<TaxEstimateCard />` (selector: `[data-kept-estimate]`)
- [ ] Assert it matches the kept-estimate computed from only the current-year log
- [ ] Verify: `npx playwright test dashboard` passes
- [ ] Commit: `test(e2e): assert dashboard tax-year scoping with prior-year fixture`

## Task 7 — Regression sweep

- [ ] Run `npm test` (full vitest suite)
- [ ] Run `npx playwright test`
- [ ] Run `npm run build` and confirm build succeeds
- [ ] Manual smoke (production build): tax screen header shows `2026/27`; estimated liability for a fresh user matches a hand-calculated value from the seeded current-year data
- [ ] No commit (verification only)
