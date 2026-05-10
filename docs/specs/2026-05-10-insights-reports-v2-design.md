# Insights & Reports v2 — Trends, Charts, Drill-Down Design Spec

**Date:** 2026-05-10  
**Scope:** Tax projections enhancement, revenue trends, platform comparisons, exportable reports  
**Approach:** Charts added to existing Tax tab, trend cards on dashboard, export polish

---

## 1. Problem Statement

Current insights are text-heavy and static:
- Tax tab shows numbers but no visual trends.
- No way to see revenue over time.
- Platform breakdown is current-period only.
- Exports are functional but bare CSV.
- No monthly/yearly comparison.

## 2. Design Goals

1. **Visual trends** — Revenue, hours, and profit shown as sparklines and bar charts.
2. **Platform comparison over time** — See which platform pays best per month.
3. **Monthly drill-down** — Tap a month to see daily breakdown.
4. **Polished exports** — Styled HTML report with charts embedded.
5. **Tax projection confidence** — Show range (min/max estimate) not just single number.

## 3. Layout & Components

### Tax Tab Charts

Add 3 chart sections to `TaxLogic`:
1. **Revenue Trend** — Bar chart of revenue per week for current tax year. Simple SVG `<rect>` bars, no library.
2. **Profit vs Tax** — Stacked area chart showing profit, tax, and deductions over time.
3. **Platform Comparison** — Horizontal bar chart showing earnings per platform for selected period.

### Monthly Drill-Down

New `MonthlyDrillDown` component:
- Triggered from dashboard MonthlySummary card or Tax tab.
- Shows calendar grid for selected month.
- Each day cell shows revenue (if logged) or gray (if missed).
- Tap a day to see that day's shift details.
- Swipe left/right to change month.

### Tax Projection Range

Modify `TaxLogic` to show:
- **Conservative estimate**: Current trajectory (no change).
- **Optimistic estimate**: If user maintains last 4-week average.
- **Required average**: Weekly revenue needed to hit a user-defined annual target.

### Styled Export

New `StyledExport` utility:
- Generates a self-contained HTML file with embedded CSS and SVG charts.
- Includes cover page, summary, detailed tables, and chart images.
- Accountant-friendly formatting.

## 4. Data Flow

- Charts use existing `dailyLogs`, `trips`, `expenses` data.
- Monthly drill-down filters `dailyLogs` by month.
- Projection range extends existing `buildTaxAnalysis` with trajectory calculation.
- Styled export reuses `generateTaxPackCSVs` and `generateHmrcSummaryHtml` but wraps in a styled template.

## 5. Component Breakdown

### New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `RevenueTrendChart` | `components/charts/RevenueTrendChart.tsx` | SVG bar chart of weekly revenue. |
| `ProfitTaxChart` | `components/charts/ProfitTaxChart.tsx` | SVG stacked area chart. |
| `PlatformBarChart` | `components/charts/PlatformBarChart.tsx` | SVG horizontal bar chart. |
| `MonthlyDrillDown` | `components/MonthlyDrillDown.tsx` | Calendar grid with daily revenue cells. |
| `TaxProjectionRange` | `components/TaxProjectionRange.tsx` | Conservative/optimistic/required estimates. |
| `StyledExportTemplate` | `utils/styledExport.ts` | Self-contained HTML report generator. |

### Modified Components

| Component | Change |
|-----------|--------|
| `TaxLogic.tsx` | Add chart sections, projection range, styled export button. |
| `MonthlySummaryCard.tsx` | Add "Drill down" chevron that opens `MonthlyDrillDown`. |

## 6. Empty States

- Charts: If no data, show "Log shifts to see trends" with a CTA.
- Monthly drill-down: Empty days show `--`.
- Projection: If no revenue, show "Set a target to see projections".

## 7. Accessibility & Performance

- Charts: All SVG elements have `role="img"` and `aria-label`.
- Monthly drill-down: Grid uses `<table>` or `role="grid"` for screen readers.
- Charts are lightweight SVGs; no canvas or heavy libraries.
- Exports are generated client-side; no server needed.

## 8. Out of Scope

- Third-party charting libraries (D3, Chart.js, Recharts).
- Server-side report generation.
- Real-time data updates (charts refresh on data change, not live).

## 9. Success Criteria

- [ ] Revenue trend chart visible on Tax tab with weekly bars.
- [ ] Monthly drill-down accessible from dashboard.
- [ ] Tax projection shows conservative/optimistic range.
- [ ] Styled HTML export looks professional.
- [ ] All charts are pure SVG, no new dependencies.
