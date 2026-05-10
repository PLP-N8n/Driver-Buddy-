# Dashboard v2 — Bento-Grid Hero Design Spec

**Date:** 2026-05-10  
**Scope:** Dashboard frontend redesign — hierarchy, visuals, actionability, depth  
**Approach:** Bento-Grid Hero (Option C)

---

## 1. Problem Statement

The current dashboard presents all information as a vertical scroll of cards. It is information-rich but lacks:
- Clear visual hierarchy — no single focal point.
- Scanning efficiency — users must scroll to see the most important numbers.
- Actionability — insights and nudges are buried in a generic list.
- Depth — trends and breakdowns are static, not explorable.

## 2. Design Goals

1. **Instant comprehension** — A user should understand their tax position and today's performance in under 3 seconds.
2. **Scan, then act** — Quick-glance numbers first, then actionable stories, then deep-dive sections.
3. **Premium feel** — The existing glassmorphism theme is elevated with tighter grids, motion, and focus.
4. **Progressive disclosure** — Everything is available, but nothing is in the way.
5. **First screen operational** — Shift controls (Start/End/Quick Add) remain immediately accessible per existing UX principle.

## 3. Layout: Three Zones + Action Strip

### Zone 0 — Persistent Action Strip (below hero, always visible)

The primary shift controls live here, separate from the data grid, so they are never buried:

- **Active session running:**
  - Left: Live timer (`formatNumber(activeDurationHours, 2)h`) + `Clock3` icon
  - Center: `+ £10 quick add` (secondary button)
  - Right: `End shift` (primary button, brand color)
- **No active session:**
  - Left: `Start Shift` (primary button)
  - Right: `Add shift` (secondary button)
- **Empty state (no logged shifts ever):**
  - Full-width: `Log your first shift` (primary)
  - Below: `Restore from cloud` (secondary, if backupCode present)

This strip replaces the `EarningsSummary` action buttons. It is NOT sticky — it scrolls naturally below the hero.

### Zone 1 — Hero (top, sticky-aware)

Responsive two-column grid:
- **Left (2/3 width on desktop, full on mobile):** Enlarged `RealTimeTaxMeter` with animated SVG progress ring (`TaxMeterRing`).
- **Right (1/3 width on desktop, full on mobile, 2×2 grid):** Four mini tiles:
  1. **Today's Revenue** — `todayRevenue`. If active session, overlays live duration badge.
  2. **Week Progress** — `weekRevenue` / `weeklyRevenueTarget` with inline progress bar (absorbed from `EarningsSummary`).
  3. **Tax Saved** — `taxSetAside` for current tax year.
  4. **Miles Logged** — `totalBusinessMiles` for current tax year.

Each tile is tappable. Tap opens a bottom sheet with the full breakdown.

### Zone 2 — Stories (horizontal scroll)

A `scroll-snap-x` strip of cards, each representing an actionable item:
- **Recent Shift** — Last logged shift with revenue, provider, CTA "View".
- **Prediction** — `topPrediction` with CTA "Set Reminder" or "Start Shift".
- **Missed Day** — `missedDays[0]` with CTA "Backfill".
- **Recurring Due** — `dueRecurringExpenses[0]` with CTA "Log Now".
- **Streak / Habit** — `habitState` with CTA "Keep It Up".

Cards have fixed width (`w-64`), consistent height (`h-40`), and type-specific gradient tints.
A dot indicator shows position.

### Zone 3 — Depth (vertical scroll, collapsible)

Three collapsible sections:
1. **Platform Breakdown** — Expanded by default. Existing `PlatformBreakdownCard` enhanced with time-filter tabs: Week / Month / Year.
2. **Monthly Summary** — Collapsed by default. Existing `MonthlySummaryCard` with a mini sparkline overlay.
3. **Intelligence Feed** — Expanded by default. Existing `IntelligenceFeed` with insights and predictions. Predictions are now also promoted to Stories, so the feed is a fallback view.

Below the collapsible sections, the existing **Recent Shifts** list remains.

## 4. Visual System

### Colors & Effects
- All cards use existing `glass-card` utility.
- Hero tiles: `hover:scale-[1.02] transition-transform duration-200`.
- Numbers: `number-large` (Fira Code, bold, `letter-spacing: -0.02em`).
- Positive emphasis: subtle `glow-green` / `glow-amber` text shadow.
- Stories: Type-specific gradient backgrounds:
  - Predictions: `from-amber-500/20 to-orange-500/10`
  - Streaks: `from-emerald-500/20 to-teal-500/10`
  - Shifts: `from-indigo-500/20 to-purple-500/10`
  - Missed: `from-rose-500/20 to-red-500/10`

### Animations
- **Tax meter ring:** SVG `stroke-dashoffset` animates on mount. Duration `700ms`, `ease-out`.
- **Number count-up:** `AnimatedNumber` utility. Animates from 0 to target on first viewport entry (`IntersectionObserver`). Duration `800ms`, `ease-out`. Respects `prefers-reduced-motion`.
- **Section expand/collapse:** `max-height` transition, `300ms`, `ease-out`. Chevron rotates `180deg`.
- **Story snap:** `scroll-snap-type: x mandatory; scroll-snap-align: start`.

### Responsive Behavior
- **< 640px (mobile):** Hero stacks vertically. Tiles become a 2×2 grid below the tax meter. Stories are full-width swipe.
- **640px – 1024px (tablet):** Hero is two-column. Tiles are stacked vertically on the right. Stories are 3 visible.
- **> 1024px (desktop):** Hero is two-column with tiles as a 2×2 grid. Stories are 4 visible. Max-width container `max-w-2xl` remains centered.

## 5. Data Flow

### No New Stores
All data comes from existing props passed to `DashboardScreen`:
- `trips`, `expenses`, `dailyLogs`, `settings`, `activeSession`

### New Local State (inside `DashboardScreen`)
- `heroExpandedTile: string | null` — which tile's detail sheet is open.
- `activeStoryIndex: number` — for programmatic scroll and dot indicator.
- `expandedSections: Set<string>` — open/closed state for collapsible sections. Default: `{'platform', 'intelligence'}`.

### New Derived Data (all memoized)
- `todayTileData` — `todayRevenue`, `todayExpenses`, `todaySetAside`, `todayKept`
- `weekTileData` — `weekRevenue`, `weekProgressPercent`
- `taxSavedTileData` — `taxYearTotals.taxSetAside`
- `milesTileData` — `taxYearTotals.totalBusinessMiles`
- `storiesData` — Array of typed story cards generated from:
  - `recentLogs[0]` → Recent Shift story
  - `topPrediction` → Prediction story
  - `missedDays[0]` → Missed Day story
  - `dueRecurringExpenses[0]` → Recurring Due story
  - `habitState` → Habit story

### Detail Sheets
- Tap a hero tile → bottom sheet with full breakdown. Reuses existing sheet styling.
- Tap a story card → triggers existing action callbacks (`onOpenBackfill`, `onSetPredictionReminder`, `onStartWorkDayRequestHandled`, etc.).

## 6. Empty States

### Hero Tiles (no data yet)
- **Numbers:** Render `--` instead of `£0.00` to distinguish "no data" from "zero."
- **Week Progress tile:** Bar at 0%, label says "No shifts this week."
- **Tax Saved / Miles Logged:** Label includes "Log a shift to see this."
- **Tax meter hero:** Shows `£0.00` with "Estimated tax owed" unchanged, but adds a subtle "No income logged yet" sub-label. Tax band badge reads "No tax due" (already handled).

### Stories Strip (no data yet)
- If no stories exist (no shifts, no predictions, no missed days, no recurring due), show a single **Welcome Story Card**:
  - Gradient: `from-brand/20 to-accent/10`
  - Icon: `Sparkles`
  - Title: "Welcome to Driver Buddy"
  - Body: "Log your first shift to unlock insights, predictions, and tax estimates."
  - CTA: "Log first shift" → calls `openManualEntry()`

### Action Strip (empty state)
- Shows "Log your first shift" (primary, full-width) + optional "Restore from cloud" (secondary).
- This replaces the current empty-state `<section>` inside `DashboardScreen` that lives below the tax meter.

## 7. Component Breakdown

### New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `BentoHero` | `components/dashboard/BentoHero.tsx` | Hero grid layout: TaxMeter on left, 4 tiles on right. |
| `HeroTile` | `components/dashboard/HeroTile.tsx` | Single mini tile with label, animated number, optional delta, empty-state fallback. |
| `ActionStrip` | `components/dashboard/ActionStrip.tsx` | Persistent shift control bar: Start/End/Quick Add/Add Shift. |
| `StoryStrip` | `components/dashboard/StoryStrip.tsx` | Horizontal scroll container with snap, dot indicator. |
| `StoryCard` | `components/dashboard/StoryCard.tsx` | Typed story card with gradient, icon, label, CTA. |
| `CollapsibleSection` | `components/dashboard/CollapsibleSection.tsx` | Sticky header, chevron, expand/collapse transition. |
| `AnimatedNumber` | `components/AnimatedNumber.tsx` | Count-up animation utility with IntersectionObserver. |
| `TaxMeterRing` | `components/dashboard/TaxMeterRing.tsx` | SVG circular progress ring for personal allowance. |

### Modified Components

| Component | Change |
|-----------|--------|
| `DashboardScreen.tsx` | Reorder children: `BentoHero` → `ActionStrip` → `StoryStrip` → collapsible depth sections. Move existing cards into `CollapsibleSection` wrappers. Remove `EarningsSummary` entirely (functionality absorbed into Hero + ActionStrip). `WeeklySummary` overlay behavior unchanged. |
| `RealTimeTaxMeter.tsx` | Accept a `size: 'compact' \| 'hero'` prop. In hero mode: larger text (`text-4xl` for main tax owed), include `TaxMeterRing`, larger breakdown grid touch targets (`p-4` instead of `p-3`), and `mt-6` spacing. Compact mode keeps current styling for use inside the Tax tab. |
| `PlatformBreakdownCard.tsx` | Add internal tab state `timeFilter: 'week' \| 'month' \| 'year'`. Filter `dailyLogs` accordingly before computing breakdown. Tabs are self-contained; no lifted state. |
| `MonthlySummaryCard.tsx` | Overlay a sparkline SVG showing revenue per day for the current month. Sparkline is a simple `<polyline>` inside a viewBox, no library needed. |

## 8. Interactions

| Interaction | Trigger | Result |
|-------------|---------|--------|
| Tap hero tile | User tap on any of the 4 tiles | Opens bottom sheet with full detail view. |
| Swipe stories | Horizontal scroll or drag | Snaps to next card. Dot indicator updates. |
| Tap story CTA | Tap button inside story card | Fires existing callback (e.g., `onOpenBackfill`). |
| Tap section header | Tap collapsible section title | Toggles expand/collapse. Chevron rotates. |
| Tax meter ring mount | Component mounts | SVG stroke animates from 0 to `personalAllowancePercent`. |
| Number enters viewport | IntersectionObserver fires | `AnimatedNumber` counts up from 0. |
| Pull to refresh | User pulls down at top | Reuses existing `PullToRefreshIndicator`. |
| Tap Start/End Shift | Action strip button | Fires existing `onStartSession` / `onCompleteSession` callbacks. |
| Tap +£10 quick add | Action strip button | Fires existing `onUpdateSession({ revenue: liveRevenue + 10 })`. |

## 9. Accessibility & Performance

- **Touch targets:** All interactive tiles, story cards, and action strip buttons are minimum 44×44px.
- **Reduced motion:** `AnimatedNumber` and `TaxMeterRing` skip animation if `prefers-reduced-motion: reduce`.
- **Lazy charts:** Any sparklines or breakdown charts below the fold are loaded lazily (already lightweight SVGs).
- **No new dependencies:** All animations use CSS transitions and `IntersectionObserver` (native).

## 10. Out of Scope

- New data sources (e.g., Plaid bank sync, HMRC API).
- New backend logic or worker changes.
- New settings or user preferences.
- Bottom-sheet content redesign — sheets open with existing layouts; only the entry points change.

## 11. WeeklySummary Coexistence

When `completedShiftSummary` is present, the existing behavior remains:
- `WeeklySummary` renders at the top of the dashboard content area, replacing the normal view (same as current line 836 of `DashboardScreen.tsx`).
- The bento grid, action strip, and stories are **not rendered** while `completedShiftSummary` is visible.
- After dismissal, the full bento dashboard reappears.
- No changes to `WeeklySummary` itself.

## 12. EarningsSummary Deprecation

`EarningsSummary.tsx` is **removed** entirely. Its responsibilities are redistributed:
- Revenue/kept/setAside stats → absorbed into `BentoHero` tiles.
- Weekly progress bar → absorbed into the "Week Progress" `HeroTile`.
- Active session sub-panel (live earnings, miles, set-aside) → absorbed into "Today's Revenue" tile when session is active.
- Start/End/Quick Add/Add Shift buttons → moved to new `ActionStrip` component.
- Empty state (no shifts ever) → moved to `ActionStrip` + Welcome Story Card.

## 13. Success Criteria

- [ ] User can see tax owed, today's revenue, week progress, tax saved, and miles logged without scrolling.
- [ ] User can start or end a shift from the persistent action strip without scrolling.
- [ ] User can swipe horizontally to see actionable stories and tap to act.
- [ ] Collapsible sections animate smoothly and remember open/closed state for the session.
- [ ] All animations respect `prefers-reduced-motion`.
- [ ] Layout is responsive across mobile, tablet, and desktop breakpoints.
- [ ] No regression in existing dashboard functionality (start shift, end shift, manual entry, predictions, insights).
- [ ] Empty states are graceful and guide the user to their first action.
