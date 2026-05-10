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

1. **Instant comprehension** — A user should understand their tax position and today’s performance in under 3 seconds.
2. **Scan, then act** — Quick-glance numbers first, then actionable stories, then deep-dive sections.
3. **Premium feel** — The existing glassmorphism theme is elevated with tighter grids, motion, and focus.
4. **Progressive disclosure** — Everything is available, but nothing is in the way.

## 3. Layout: Three Zones

### Zone 1 — Hero (top, sticky-aware)

Responsive two-column grid:
- **Left (2/3 width on desktop, full on mobile):** Enlarged `RealTimeTaxMeter` with animated SVG progress ring.
- **Right (1/3 width on desktop, full on mobile, 2×2 grid):** Four mini tiles:
  1. **Today's Revenue** — `todayRevenue` with delta vs yesterday.
  2. **Week Progress** — `weekRevenue` / `weeklyRevenueTarget` with percentage.
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

## 6. Component Breakdown

### New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `BentoHero` | `components/dashboard/BentoHero.tsx` | Hero grid layout: TaxMeter on left, 4 tiles on right. |
| `HeroTile` | `components/dashboard/HeroTile.tsx` | Single mini tile with label, animated number, optional delta. |
| `StoryStrip` | `components/dashboard/StoryStrip.tsx` | Horizontal scroll container with snap, dot indicator. |
| `StoryCard` | `components/dashboard/StoryCard.tsx` | Typed story card with gradient, icon, label, CTA. |
| `CollapsibleSection` | `components/dashboard/CollapsibleSection.tsx` | Sticky header, chevron, expand/collapse transition. |
| `AnimatedNumber` | `components/AnimatedNumber.tsx` | Count-up animation utility with IntersectionObserver. |
| `TaxMeterRing` | `components/dashboard/TaxMeterRing.tsx` | SVG circular progress ring for personal allowance. |

### Modified Components

| Component | Change |
|-----------|--------|
| `DashboardScreen.tsx` | Reorder children: `BentoHero` → `StoryStrip` → collapsible depth sections. Move existing cards into `CollapsibleSection` wrappers. |
| `RealTimeTaxMeter.tsx` | Accept a `size: 'compact' \| 'hero'` prop. In hero mode: larger text (`text-4xl`), include `TaxMeterRing`, larger breakdown grid touch targets. |
| `PlatformBreakdownCard.tsx` | Add `timeFilter: 'week' \| 'month' \| 'year'` tabs. Filter `dailyLogs` accordingly before computing breakdown. |
| `MonthlySummaryCard.tsx` | Overlay a sparkline SVG showing revenue per day for the current month. |

## 7. Interactions

| Interaction | Trigger | Result |
|-------------|---------|--------|
| Tap hero tile | User tap on any of the 4 tiles | Opens bottom sheet with full detail view. |
| Swipe stories | Horizontal scroll or drag | Snaps to next card. Dot indicator updates. |
| Tap story CTA | Tap button inside story card | Fires existing callback (e.g., `onOpenBackfill`). |
| Tap section header | Tap collapsible section title | Toggles expand/collapse. Chevron rotates. |
| Tax meter ring mount | Component mounts | SVG stroke animates from 0 to `personalAllowancePercent`. |
| Number enters viewport | IntersectionObserver fires | `AnimatedNumber` counts up from 0. |
| Pull to refresh | User pulls down at top | Reuses existing `PullToRefreshIndicator`. |

## 8. Accessibility & Performance

- **Touch targets:** All interactive tiles and story cards are minimum 44×44px.
- **Reduced motion:** `AnimatedNumber` and `TaxMeterRing` skip animation if `prefers-reduced-motion: reduce`.
- **Lazy charts:** Any sparklines or breakdown charts below the fold are loaded lazily (already lightweight SVGs).
- **No new dependencies:** All animations use CSS transitions and `IntersectionObserver` (native).

## 9. Out of Scope

- New data sources (e.g., Plaid bank sync, HMRC API).
- New backend logic or worker changes.
- New settings or user preferences.
- Bottom-sheet content redesign — sheets open with existing layouts; only the entry points change.

## 10. Success Criteria

- [ ] User can see tax owed, today's revenue, week progress, tax saved, and miles logged without scrolling.
- [ ] User can swipe horizontally to see actionable stories and tap to act.
- [ ] Collapsible sections animate smoothly and remember open/closed state for the session.
- [ ] All animations respect `prefers-reduced-motion`.
- [ ] Layout is responsive across mobile, tablet, and desktop breakpoints.
- [ ] No regression in existing dashboard functionality (start shift, end shift, manual entry, predictions, insights).
