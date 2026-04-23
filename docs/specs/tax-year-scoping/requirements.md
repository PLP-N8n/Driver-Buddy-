# tax-year-scoping — requirements

## R1 — buildTaxAnalysis receives only current-tax-year records
**The system SHALL** filter `dailyLogs`, `trips`, and `expenses` to only records dated within the current UK tax year (Apr 6 – Apr 5) before passing them to `buildTaxAnalysis` in `components/TaxLogic.tsx`.

**Acceptance:** load the app with seeded data containing entries from a previous tax year. The "Estimated liability" and "Total revenue" displayed in the Tax screen exclude every previous-year entry. A unit test in `components/TaxLogic.test.tsx` (new) feeds two-year data into TaxLogic and asserts the rendered totals match only the current-year subset.

## R2 — Dashboard "This tax year" totals exclude prior-year records
**The system SHALL** compute `totalRevenue`, `totalExpenses`, and `totalBusinessMiles` in `components/dashboard/DashboardScreen.tsx` from records dated within the current UK tax year only.

**Acceptance:** with seeded prior-year data, the `data-kept-estimate` attribute on `<TaxEstimateCard />` matches the value computed from current-year-only inputs. Existing E2E `e2e/dashboard.spec.ts` assertion is extended with a prior-year fixture and the totals stay unchanged from the current-year-only run.

## R3 — Filtering uses the existing helper, not bespoke logic
**The system SHALL** use `isInCurrentTaxYear(dateStr)` from `utils/ukDate.ts` (or `>= ukTaxYearStart() && <= ukTaxYearEnd()`) for every tax-year filter introduced. **The system SHALL NOT** compute its own tax-year boundary inline.

**Acceptance:** `grep -E "04-06|04-05|tax.year.*start|tax.year.*end" components/ src/` after the change returns only matches inside `utils/ukDate.ts`, `types.ts`, and the existing test fixtures (no new bespoke boundaries).

## R4 — Tax-year boundary visible in the Tax screen header
**The system SHALL** display the active tax-year label (format `YYYY/YY`, e.g. `2026/27`) in the Tax screen header, sourced from `getTaxYear()`.

**Acceptance:** opening the Tax tab on 2026-04-21 shows "Tax year 2026/27" in the header. Snapshot/visual test in `e2e/visual-smoke.spec.ts` is updated to assert the label.

## R5 — Filtering is centralised, not duplicated
**The system SHALL** expose a single helper `filterToCurrentTaxYear<T extends { date: string }>(items: T[]): T[]` in `utils/ukDate.ts` (or a new `utils/taxYear.ts`) used by both TaxLogic and DashboardScreen.

**Acceptance:** TaxLogic.tsx and DashboardScreen.tsx each call this helper instead of writing their own `.filter((x) => x.date >= ...)` for tax-year scoping. Unit test in `utils/ukDate.test.ts` covers boundary dates: `2026-04-05` excluded, `2026-04-06` included, `2027-04-05` included, `2027-04-06` excluded.

## R6 — Existing taxPack export is unaffected
**The system SHALL NOT** change the behaviour of the tax-pack export (`hooks/useExport.ts`, `utils/taxPack.ts`), which already filters explicitly via `ukTaxYearStart()` / `ukTaxYearEnd()`.

**Acceptance:** `npm test -- taxPack` passes without modification. The exported CSV row count for a fixture spanning two tax years stays identical to the pre-change baseline.

## R7 — No regression in projection-on-account behaviour
**The system SHALL** preserve `buildProjection`'s payments-on-account logic (`utils/tax.ts`), which is independent of input filtering.

**Acceptance:** existing `utils/tax.test.ts` suite passes unchanged.
