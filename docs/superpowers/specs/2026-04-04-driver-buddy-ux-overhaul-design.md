# Driver Buddy UX Overhaul — Design Spec
**Date:** 2026-04-04  
**Status:** Approved  
**Goal:** Cut drop-off from 92% by making logging feel lighter than not logging.

---

## Design Decisions (Approved)

| Area | Decision |
|------|----------|
| Dashboard | Hybrid: outcomes + one insight + missed-log alert |
| End-of-shift flow | Single screen: earnings + odometer + fuel toggle |
| Missed-log recovery | Backfill sheet with Add Shift / Day Off / Skip per day |
| Shift summary card | Smart coaching: earned/kept/tax + hourly rate + one insight + weekly bar |

---

## 1. Dashboard Redesign (`components/Dashboard.tsx`)

### What changes
The dashboard currently shows the active session controls but lacks an at-a-glance outcome view. Drivers need to see three numbers immediately: earned, kept, set aside.

### New layout (above the fold, always visible)
```
┌─────────────────────────────────┐
│ Today          [Shift active]   │
│                                 │
│      £87.40  earned today       │
│  ┌──────┐ ┌──────┐ ┌──────┐   │
│  │ £61  │ │ £17  │ │ £9   │   │
│  │ kept │ │ aside│ │ exps │   │
│  └──────┘ └──────┘ └──────┘   │
│  ████████████░░░░  £420/£600wk │
│                                 │
│  💡 Bolt outperformed Uber      │
│     by £3.20/hr this week       │
│                                 │
│  ⚠ No log for yesterday →      │
│                                 │
│  [   Start Shift   ]  [Quick+] │
└─────────────────────────────────┘
```

### Implementation details
- **Outcome bar** (earned/kept/set aside): compute from `activeSession` if in progress, else from today's `dailyLogs`. Use existing `taxSetAsidePercent` from settings.
- **Weekly target bar**: progress bar using `getWeekSnapshot()` helper already in Dashboard.tsx. Show as `£X / £Y wk` with a slim progress bar below the outcome cards.
- **Smart insight pill**: pull from `generateInsights()` util (already exists at `utils/insights`). Show only the first/most relevant insight. Tap to dismiss.
- **Missed-log alert**: new amber banner shown when `getMissedDays()` returns >0 days. Tap opens backfill sheet (see Section 3).
- **Primary CTA**: `Start Shift` button stays primary. Add a secondary `Quick add` button for manual log entry without starting a timed session.
- **No regressions**: active session live tracker, expense dock, end-shift controls all remain — just repositioned below the outcome view.

---

## 2. End-of-Shift Flow (`components/Dashboard.tsx` — EndSheetPanel)

### What changes
Current end-shift sheet has too many fields. Replace with a single-screen panel showing only the 3 essential fields. All optional fields collapsed behind a disclosure row.

### New end-shift sheet layout
```
┌─────────────────────────────┐
│  End your shift              │
│  3h 14m                      │
│                              │
│  💰 Earnings    [  £87.40  ]│
│  📍 End odometer [ 45,210  ]│  ← pre-filled: startOdometer + estimated miles
│  ⛽ Fuel today?  [Yes] [No] │  ← toggle; if Yes, show amount field inline
│                              │
│  + Add notes / + Add expense │  ← collapsed disclosure row
│                              │
│  [      Save shift ✓      ] │
└─────────────────────────────┘
```

### Implementation details
- **Odometer pre-fill**: if `activeSession.startOdometer` is set, pre-fill end odometer with `startOdometer + (session.miles ?? 0)`. Editable.
- **Fuel toggle**: two pill buttons (Yes/No). If Yes, show a numeric input for fuel amount inline (no separate sheet). Amount pre-filled with last fuel entry if within 7 days.
- **Draft persistence**: write `activeSession` to `localStorage` key `draftEndShift` on every field change. On mount, restore if present and session ID matches. Clear on successful save.
- **Optional fields**: `+ Add notes` and `+ Add expense` are collapsed by default. Tapping either expands inline. Do not require these to save.
- **Save action**: calls existing `onCompleteSession()`. On success, show shift summary card (Section 4).

---

## 3. Missed-Log Recovery (`components/BackfillSheet.tsx` — NEW)

### What it is
A new bottom sheet component that appears when the app detects missed log days (gaps in `dailyLogs` over the past 7 days, excluding today and future dates).

### Detection logic (`utils/missedDays.ts` — NEW)
```typescript
// Returns array of date strings (YYYY-MM-DD) with no log and no day-off marker
getMissedDays(dailyLogs: DailyWorkLog[], dayOffDates: string[]): string[]
```
- Look back 7 days from yesterday
- Exclude: today, dates with existing `dailyLogs`, dates in `dayOffDates` array
- Return array of missing dates (max 7)

### Day-off marker storage
- Add `dayOffDates: string[]` to `Settings` type (default: `[]`)
- When driver marks a day as "Day off", add that date to `settings.dayOffDates` via `onUpdateSettings`
- Persist via existing settings save path

### BackfillSheet behaviour
- Opens automatically on app load if `getMissedDays()` returns >0 results (max once per day — track `lastBackfillPrompt` in localStorage)
- Also opens when user taps the missed-log amber banner on dashboard
- Each missed day shown as a card with three actions:
  - **Add shift** → opens the single-screen end-shift form (Section 2) pre-filled with that date + last shift as template (earnings, hours, provider from most recent log)
  - **Day off** → marks date in `dayOffDates`, removes card immediately
  - **Skip** → dismisses that day's card without marking
- **"Skip all"** button at bottom dismisses the sheet for today
- No guilt language — copy is neutral and helpful

### Template pre-fill
When "Add shift" is tapped for a missed day, pre-fill:
- `provider` from most recent log
- `hoursWorked` from most recent log's `hoursWorked`
- `revenue` left blank (driver must enter)

---

## 4. Shift Summary Card (`components/ShiftSummaryCard.tsx` — enhance existing)

The `CompletedShiftSummary` modal already exists. Enhance it with the smart coaching layout.

### New layout
```
┌─────────────────────────────┐
│  🏁  Shift done · great work │
│                              │
│        £87.40                │
│   3h 14m · £27.02/hr        │
│                              │
│  ┌──────┐ ┌──────┐ ┌──────┐│
│  │ £61  │ │ £17  │ │ 87mi ││
│  │ kept │ │ aside│ │driven││
│  └──────┘ └──────┘ └──────┘│
│                              │
│  ▌ Bolt = 60% of earnings   │
│    Your best shift this week │
│                              │
│  ████████████░░  £420/£600  │
│  Weekly target — 70%         │
│                              │
│  [        Done ✓          ] │
└─────────────────────────────┘
```

### Implementation details
- **Effective hourly rate**: `revenue / hoursWorked` — show as `£X.XX/hr`
- **Insight line**: use first item from `completedShiftSummary.insights[]` (already populated). If empty, generate from shift data: best platform, shift rank vs week average.
- **Weekly bar**: use `weekRevenue` and `weekTaxToSetAside` from `CompletedShiftSummary` (already computed). Show as slim progress bar with `£weekKept / £weekTarget` label.
- `weekTarget` comes from `settings` — add `weeklyRevenueTarget: number` to `Settings` type (default `600`). Add input to Settings panel.
- **No gamification emoji overload** — one emoji max (🏁), rest is clean numbers.

---

## 5. Export Label Clarification (`components/TaxLogic.tsx`, `components/WorkLog.tsx`)

Anywhere "Download tax-ready report" or similar appears, replace with specific labels:

| Old | New |
|-----|-----|
| "Download tax-ready report" | "Download Accountant CSV" |
| "Export data" / "Export CSV" | "Download Tax Summary CSV" |
| Generic export button | Tooltip: "Formatted for HMRC self-assessment" |

Audit all export CTAs across `TaxLogic.tsx`, `WorkLog.tsx`, and `App.tsx` and apply consistent labels.

---

## 6. Weekly Review Card (`components/WeeklyReviewCard.tsx` — NEW)

### What it is
A card that appears on Monday mornings (or when user taps "Last week" on dashboard) summarising the prior week.

### Trigger
- On app load: if today is Monday and `lastWeeklyReview` in localStorage is not last Monday's date → show card
- Dismissing sets `lastWeeklyReview = lastMonday`

### Card content
```
Week of 28 Mar – 3 Apr

Total earned:     £ 487
Total kept:       £ 341
Top platform:     Bolt
Business miles:   312 mi
Tax pot status:   £1,240 saved / £1,380 est. liability
Recommendation:   Work 2 more Bolt shifts next week
                  to hit your £600/wk target
```

Data sources: `dailyLogs` filtered to prior week, `settings.taxSetAsidePercent`, `trips` for mileage.

---

## 7. Smart Profit Coaching (`utils/insights.ts` — enhance existing)

The `generateInsights()` function already exists. Extend it to produce:

1. **Platform comparison**: "Bolt paid £X/hr more than Uber over last 7 days" — compare `revenue / hoursWorked` per provider across last 7 days of `dailyLogs`
2. **Fuel cost trend**: "Fuel cost per mile rose X% this week" — compare `expensesTotal (fuel only) / milesDriven` week-on-week
3. **Miles vs earnings**: "You drove X% more miles for the same earnings vs last week" — flag if `revenue/milesDriven` ratio dropped >10%
4. **Tax gap alert**: "You're £X short of your tax pot target" — if `taxSaved < estimatedLiability * 0.9`

Insights are ranked by impact. Dashboard shows top 1. Shift summary shows top 1 relevant to that shift.

---

## 8. Progressive Disclosure (`components/Settings.tsx`, `App.tsx`)

### New user experience (first 3 sessions)
- Hide: Debt Manager tab, Tax Assistant tab, mileage tracking toggle, manual allowances
- Show: Dashboard, Work Log, Tax summary only
- After 3 logged shifts, unlock full UI with a subtle "You've unlocked more features" toast

### Implementation
- Add `totalLogs: number` to `PlayerStats` (already exists)
- `isAdvancedUser = playerStats.totalLogs >= 3`
- Gate advanced tabs in `App.tsx` nav render: `isAdvancedUser && <Tab name="debt" />`
- No hard-block — settings still accessible, just tabs hidden to reduce overwhelm

---

## Data Model Changes (`types.ts`)

```typescript
// Add to Settings
weeklyRevenueTarget: number;   // default 600
dayOffDates: string[];          // default []

// Add to DEFAULT_SETTINGS
weeklyRevenueTarget: 600,
dayOffDates: [],
```

No changes to `DailyWorkLog` or `ActiveWorkSession` — all new features build on existing structures.

---

## File Map

| File | Change type |
|------|-------------|
| `types.ts` | Add `weeklyRevenueTarget`, `dayOffDates` to Settings + DEFAULT_SETTINGS |
| `components/Dashboard.tsx` | Outcome bar, weekly progress bar, insight pill, missed-log banner, Quick add CTA |
| `components/Dashboard.tsx` (EndSheet) | Single-screen end-shift with fuel toggle + draft persistence |
| `components/BackfillSheet.tsx` | NEW — missed-log recovery with Add Shift / Day Off / Skip |
| `utils/missedDays.ts` | NEW — getMissedDays() detection logic |
| `components/ShiftSummaryCard.tsx` or inline | Enhance with hourly rate, insight line, weekly bar |
| `components/WeeklyReviewCard.tsx` | NEW — Monday weekly summary card |
| `utils/insights.ts` | Extend generateInsights() with 4 new insight types |
| `components/TaxLogic.tsx` | Export label rename |
| `components/WorkLog.tsx` | Export label rename |
| `App.tsx` | Progressive disclosure gating, BackfillSheet integration, WeeklyReviewCard trigger |
| `components/Settings.tsx` | Add weeklyRevenueTarget input field |

---

## 9. Sheet Overlay Fix (`components/WorkLog.tsx`, `components/ExpenseLog.tsx`, `components/Dashboard.tsx`)

### Problem
Bottom sheets slide up full-viewport, covering the bottom nav tabs. Multiple sheets can also stack on top of each other (e.g. expense sheet opening inside end-shift sheet), making navigation impossible.

### Fix
- All bottom sheet panels must use `max-h-[calc(100vh-64px)]` (or equivalent) to leave the bottom nav always visible and tappable
- Set `z-index` hierarchy clearly: nav = `z-50`, sheet backdrop = `z-40`, sheet panel = `z-40` — nav must always be above sheets
- When a sheet is open, the backdrop covers only the content area, not the nav bar
- Sheets must not open on top of other open sheets — if a secondary action (e.g. "Add expense" inside end-shift) is needed, it must either inline-expand or close the parent sheet first
- Audit every `sheetPanelClasses` and `dialogPanelClasses` usage across all components and apply consistent containment
- Test on a 375px wide viewport (iPhone SE) to confirm nav is never obscured

---

## 10. Visual Smoke Tests (Playwright)

After all implementation is complete, Codex must run Playwright visual tests to confirm the UI renders correctly.

### Test file: `e2e/visual-smoke.spec.ts` (new or extend existing)

Capture screenshots of the following states and save to `screenshots/`:

| Test | State to capture |
|------|-----------------|
| `dashboard-empty` | Fresh app, no logs, new user |
| `dashboard-active-shift` | Active session running, outcome bar visible |
| `dashboard-with-insight` | Seeded data with insight pill showing |
| `dashboard-missed-log-banner` | Missed log amber banner visible |
| `end-shift-sheet` | End-shift single-screen sheet open |
| `backfill-sheet` | Backfill sheet open with 2 missed days |
| `shift-summary-card` | Post-shift summary card with coaching data |
| `weekly-review-card` | Weekly review card visible |
| `worklog-tab` | WorkLog tab, sheet closed, nav visible |
| `expense-sheet-open` | Expense entry sheet open, nav still visible |
| `settings-with-target` | Settings showing weeklyRevenueTarget field |

Use `page.screenshot({ fullPage: false })` to capture viewport only (simulates mobile).
Playwright config already targets `http://localhost:4173` (vite preview).
Run: `npx playwright test e2e/visual-smoke.spec.ts --reporter=html`
Output the test result summary at the end.

---

## Out of Scope (Later)
- Push notifications / reminders
- Route/provider auto-suggestions (requires location history)
- Profitability forecasting by day/time/platform
- HMRC PDF export + paywall
