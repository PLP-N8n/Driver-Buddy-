# Driver Buddy Algorithmic Intelligence Suite — Design Spec

**Date:** 2026-05-10
**Status:** Approved
**Owner:** Hunny + Gayatri
**Scope:** 5 algorithmic modules, all local-first, zero API cost

---

## Overview

Add five deterministic, privacy-first intelligence features to Driver Buddy. Each module runs entirely on-device using historical shift data and user-configured settings. No external APIs, no server-side changes (except optional sync field additions), no AI models.

**Modules:**
1. True Take-Home & Tax Ring-Fencing
2. Golden Hours Profitability Matrix
3. Dynamic Goal Pacing
4. Fatigue & Family Guardian
5. Predictive Maintenance Budgeting

**Build order:** True Take-Home → Golden Hours → Goal Pacing → Fatigue Guardian → Maintenance Budgeting

---

## 1. True Take-Home & Tax Ring-Fencing

### Purpose
Show the driver what they actually keep after deducting estimated tax and vehicle costs from gross earnings.

### Algorithm

**Input:**
- `grossEarnings: number` — revenue for the period
- `businessMiles: number` — work miles driven
- `expenses: Expense[]` — expenses logged in the period
- `claimMethod: 'SIMPLIFIED' | 'ACTUAL'`
- `taxBracketPercent: 0 | 20 | 40 | 45` — user-configurable
- `vehicleCostPerMile?: number` — optional override

**Formula:**
1. `taxSetAside = calcTaxBuffer(grossEarnings, taxBracketPercent)` — calls existing `shared/calculations/tax.ts`
2. Split expenses via `isVehicleRunningCostCategory()` + `getTaxDeductibleAmount()` from `shared/calculations/expenses.ts`
3. Vehicle cost deduction:
   - Simplified: `calcSimplifiedDeduction(businessMiles)` or `businessMiles * vehicleCostPerMile`
   - Actual: `actualVehicleCosts` or `businessMiles * vehicleCostPerMile`
4. `totalDeductions = vehicleCostDeduction + otherBusinessExpenses`
5. `trueTakeHome = calcKept(grossEarnings, totalDeductions, taxSetAside)` — existing helper

**Output:** `{ grossEarnings, taxSetAside, vehicleCostDeduction, otherBusinessExpenses, totalDeductions, trueTakeHome }`

**Edge cases:**
- Zero earnings → taxSetAside = 0, trueTakeHome may be negative (loss day)
- Simplified + logged fuel expenses → `getTaxDeductibleAmount` returns 0 (blocked_under_simplified), no double-count
- Custom per-mile override → replaces method-derived cost only for take-home display, not tax filing projections

### UI Surface
- Post-shift summary card (`WeeklySummary.tsx`): add "You kept X, saved Y tax, claimed Z mileage" line
- Daily/weekly drill-down: show gross → deductions → take-home waterfall

### Settings Additions
- `taxBracketPercent: 0 | 20 | 40 | 45` (default 20)
- `vehicleCostPerMile?: number` (optional, overrides method-derived cost)

---

## 2. Golden Hours Profitability Matrix

### Purpose
Transform historical shifts into a ranked day-of-week × time-of-day profitability map.

### Algorithm

**Time buckets (4):**
| Label | Hours |
|-------|-------|
| Morning | 06:00–11:59 |
| Afternoon | 12:00–17:59 |
| Evening | 18:00–21:59 |
| Night | 22:00–05:59 |

**Steps:**
1. Filter logs to `revenue > 0 && hoursWorked > 0 && startedAt present`
2. Assign each shift to bucket via UK-local start hour (`Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric' })`)
3. Group by `(dayOfWeek, bucket)` — 28 possible groups
4. Per group: `avgHourlyWage = totalRevenue / totalHours`
5. Trend (4-week lookback): compare last 14 days vs prior 14 days
   - Improving: recent > previous × 1.05
   - Declining: recent < previous × 0.95
   - Stable: otherwise
6. Confidence: `0.55 + count * 0.04 + min(1, totalHours/20) * 0.10`, clamped to 0.96
7. Rank by `avgHourlyWage` descending
8. Contrast threshold: best must be > contrast × 1.15 (established) or × 1.05 (early sample)

**Message templates:**
- Contrast available: "You average {bestWage}/hr on {day} {bucket}s, but only {contrastWage}/hr on {contrastDay} {contrastBucket}s"
- Best only: "Your best time is {day} {bucket} — you average {bestWage}/hr{trendPhrase}"

**Output:** `DriverPrediction { type: 'goldenHours', message, confidence, actionLabel: 'Plan around it' }`

### UI Surface
- Feeds into existing `IntelligenceFeed` via `generatePredictions` pipeline
- Competes naturally with schedule/platform/timing/target predictions by confidence score

### Edge Cases
- No `startedAt` on any log → return null
- Equal earnings across all buckets → fallback to Template B, confidence capped at 0.78
- Single-shift driver → early-sample rules (1 shift per bucket eligible, cautious phrasing)

---

## 3. Dynamic Goal Pacing

### Purpose
Tell the driver in real time whether their week's earnings are ahead, on track, or behind their weekly revenue target.

### Algorithm

**Input:**
- `goal: number` — `settings.weeklyRevenueTarget`
- `today: string` — `todayUK()`
- `workWeekStartDay: Settings['workWeekStartDay']`
- `weekLogs: DailyWorkLog[]` — current week
- `eligibleHistory: DailyWorkLog[]` — all eligible logs for historical average

**Formula:**
1. `weekStart = ukWeekStart(today, workWeekStartDay)`
2. `currentRevenue = sum(weekLogs.revenue)`
3. `remaining = max(0, goal - currentRevenue)`
4. `daysLeft = 7 - dayIndex` (today through week-end inclusive)
5. `requiredDailyRate = remaining / daysLeft`
6. `historicalAvgShiftRevenue = average(eligibleHistory.revenue)`
7. `paceRatio = requiredDailyRate / historicalAvgShiftRevenue`

**Status thresholds:**
| Status | Condition |
|--------|-----------|
| Ahead | `currentRevenue >= goal` OR `paceRatio < 0.9` |
| On track | `paceRatio >= 0.9 && paceRatio <= 1.1` |
| Behind | `paceRatio > 1.1` |
| Stretch | `paceRatio > 1.3` |

**Messages (supportive tone):**
- Ahead: "You're ahead of pace. You could ease off or bank extra toward next week."
- On track: "You're on track. £{remaining} to go and {daysLeft} days left — about £{requiredDailyRate}/day."
- Behind mild: "You've got £{remaining} and {daysLeft} days. That's about £{requiredDailyRate}/day — one solid shift each remaining day should do it."
- Behind stretch: "You've got £{remaining} and {daysLeft} day(s). That's a big ask — do what you can and the rest rolls into next week."

**Confidence:** `0.70 + min(weekLogs.length, 4) * 0.02 + (eligibleHistory.length >= 10 ? 0.05 : 0) - (paceRatio > 1.3 ? 0.05 : 0)`, clamped to 0.92

**Output:** `DriverPrediction { type: 'pace', message, confidence, actionLabel }`

### UI Surface
- Primary: `IntelligenceFeed` via `generatePredictions` pipeline
- Secondary: small pacing badge in `WeeklySummary.tsx` (e.g. "On pace · £120/day needed")

### Edge Cases
- Zero goal → return null
- Goal already hit → celebrate surplus
- Last day of week with remaining → frame as "carries forward", never "impossible"
- No historical average → skip ratio, use plain run-rate
- <3 shifts in history → light tone, no historical comparisons

### Settings Additions
- `weeklyRevenueTarget?: number` (optional, no pacing shown if undefined)

---

## 4. Fatigue & Family Guardian

### Purpose
Local wellbeing layer that nudges drivers before they hit unhealthy hours, protects family time, and encourages rest between shifts.

### Algorithm

**Settings:**
- `fatigueGuardianEnabled: boolean` (default true)
- `dailyHourLimit: number` (default 10, range 4–16)
- `weeklyHourLimit: number` (default 50, range 20–80)
- `familyTimeBlocks: FamilyTimeBlock[]` (default [])
- `restRuleEnabled: boolean` (default true)
- `restMinimumHours: number` (default 11, range 8–24)

```typescript
interface FamilyTimeBlock {
  id: string;
  label: string;
  days: ('MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN')[];
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}
```

**Evaluation:** `useFatigueGuardian` hook runs `setInterval(60_000)` only while `activeSession` is truthy. Tracks `firedThresholds` ref per session to prevent spam.

**Rule A — Daily Hour Limit:**
- `totalDailyHours = sum(today's completed logs.hoursWorked) + activeSession duration`
- Soft (`limit - 2`): "You've been driving for ~X hours. A break keeps you sharp."
- Firm (`limit - 1`): "You're nearing your daily limit. Wrapping up soon protects your earnings and your energy."
- Limit: "You've reached your daily hour limit. Time to rest — you've earned it."

**Rule B — Weekly Hour Limit:**
- `weekHours = sum(current week logs.hoursWorked) + activeSession duration`
- 90%: "You're at 90% of your weekly hours. Pace yourself."
- 100%: "You've hit your weekly hour limit. Rest is part of the job."

**Rule C — Family Time Block:**
- Check if today is in block.days and current time is within block range
- Handle overnight blocks (`startTime > endTime`)
- Fire once per session when block becomes relevant: "Your {label} time started at {startTime}. Want to wrap up?"
- In-app banner: "End shift" + "Dismiss"

**Rule D — Rest Rule (shift-start intercept):**
- `hoursSinceEnd = (now - mostRecentShift.endedAt) / (1000*60*60)`
- If `< restMinimumHours`: show confirmation sheet before `startActiveSession`
- "You last finished at {time}. {restMinimumHours} hours rest helps you stay safe and alert."
- Actions: "Start anyway" (proceeds) + "Wait" (cancels)

### UI Surface
- In-app banner in `DashboardScreen.tsx` beneath `BentoHero` when active
- `reminderService.ts` extended with `showGuardianNotification()` reusing existing SW patterns
- Shift-start confirmation sheet in `AppShell.tsx`

### Edge Cases
- Overnight shift → entire session counts toward start date's daily total
- Family block spans midnight → active if `now >= startDate OR now < endDate`
- App backgrounded → interval pauses; catch-up evaluation on `visibilitychange` to visible
- Notification permission denied → pure in-app banner
- Most recent shift still active → rest rule passes silently (should never happen)

---

## 5. Predictive Maintenance Budgeting

### Purpose
Project upcoming vehicle maintenance costs and days remaining using mileage history and user-defined maintenance schedules.

### Algorithm

**New types:**
```typescript
type VehicleType = 'CAR' | 'VAN' | 'MOTORCYCLE';
type MaintenanceItemType = 'OIL_CHANGE' | 'TYRES' | 'BRAKE_PADS' | 'BRAKE_DISCS' | 'MOT' | 'SERVICE' | 'AIR_FILTER' | 'BATTERY' | 'COOLANT';

interface MaintenanceScheduleItem {
  id: string;
  type: MaintenanceItemType;
  label: string;
  intervalMiles: number;
  intervalMonths?: number;
  lastDoneMiles?: number;
  lastDoneDate?: string;
  estimatedCost: number;
  isEnabled: boolean;
  notes?: string;
}
```

**Default intervals by vehicle type:**
| Item | Car | Van | Motorcycle | Time | Cost |
|------|-----|-----|-----------|------|------|
| Oil change | 7,500 | 6,000 | 4,000 | — | £60 |
| Tyres | 20,000 | 18,000 | 12,000 | — | £200 |
| Brake pads | 30,000 | 25,000 | 20,000 | — | £150 |
| Brake discs | 60,000 | 50,000 | 40,000 | — | £250 |
| MOT | — | — | — | 12 months | £55 |
| Service | 12,000 | 10,000 | 6,000 | 12 months | £200 |
| Air filter | 15,000 | 12,000 | 10,000 | — | £40 |
| Battery | 48,000 | 40,000 | 30,000 | 48 months | £120 |
| Coolant | 30,000 | 24,000 | 20,000 | 24 months | £50 |

**Average daily mileage:**
- Last 28 days of `Trip.totalMiles`; fallback to `DailyWorkLog.milesDriven`
- Floor at 1 mile/day to avoid divide-by-zero
- No history → prompt user for estimate; defaults: car 50, van 80, motorcycle 30

**Projection formula:**
- Mileage-based: `milesRemaining = intervalMiles - (currentOdometer - lastDoneMiles)`, `daysRemaining = milesRemaining / averageDailyMiles`
- Time-based: `nextDueDate = addMonths(lastDoneDate, intervalMonths)`, `daysRemaining = daysBetween(today, nextDueDate)`
- Dual-trigger (service): `min(daysRemainingMileage, daysRemainingTime)`

**Urgency levels:**
| Level | Condition |
|-------|-----------|
| Overdue | `daysRemaining < 0` OR `milesRemaining < 0` |
| Soon | `daysRemaining <= 14` OR `milesRemaining <= avgDaily * 14` |
| Upcoming | `daysRemaining <= 60` OR `milesRemaining <= avgDaily * 60` |
| Distant | Everything else |

**User input:**
- New Settings screen: "Maintenance Schedule"
- Per item: last done mileage, last done date, "I just did this" button
- Cost defaults: user-editable, all items of same type update

### UI Surface
- Settings panel: new "Maintenance Schedule" section
- Dashboard: optional health check signal from `utils/healthCheck.ts`
- IntelligenceFeed: maintenance alerts alongside tax predictions
- Set-aside nudge: compare 90-day upcoming spend to `maintenanceSetAsidePercent`

### Storage
- `localStorage` key: `dtpro_maintenance_schedule_v1` — array of `MaintenanceScheduleItem[]`
- `localStorage` key: `dtpro_maintenance_cost_defaults_v1`
- Migration: seed from vehicle-type defaults on first load; stamp `updatedAt` for future sync

### Edge Cases
- Brand new vehicle → all `lastDoneMiles` default to current odometer; MOT suppressed if < 3 years old
- Zero average daily miles → floor at 1; show "estimate-based" warning chip
- `lastDoneMiles > currentOdometer` → flag "Check odometer reading", pause projection
- User switches vehicle type → re-seed intervals, preserve overrides and last-done data
- Simplified vs actual costs → maintenance is financial planning only, always shown regardless of `claimMethod`

### Settings Additions
- `vehicleType: VehicleType` (default 'CAR')
- `vehicleYear?: number`
- `currentOdometer?: number`
- `maintenanceCostDefaults: Record<MaintenanceItemType, number>`

---

## Integration Architecture

### Calculation Modules (new files)
| Module | File |
|--------|------|
| True Take-Home | `shared/calculations/trueTakeHome.ts` |
| Golden Hours | `utils/goldenHours.ts` |
| Goal Pacing | `utils/goalPacing.ts` |
| Maintenance | `shared/calculations/maintenance.ts` |

### Hooks (new files)
| Module | File |
|--------|------|
| Fatigue Guardian | `hooks/useFatigueGuardian.ts` |

### UI Modifications
| Module | File(s) |
|--------|---------|
| True Take-Home | `components/dashboard/WeeklySummary.tsx`, `components/MonthlyDrillDown.tsx` |
| Golden Hours | `utils/predictions.ts` (add to `generatePredictions`) |
| Goal Pacing | `utils/predictions.ts` (add to `generatePredictions`), `components/dashboard/WeeklySummary.tsx` |
| Fatigue Guardian | `components/DashboardScreen.tsx`, `components/AppShell.tsx`, `services/reminderService.ts` |
| Maintenance | `components/Settings.tsx`, `utils/healthCheck.ts` |

### Types (modifications)
- `types.ts`: add new settings fields, `FamilyTimeBlock`, `MaintenanceScheduleItem`, `VehicleType`, `MaintenanceItemType`
- `shared/types/index.ts`: extend `Settings` interface

---

## Implementation Order

1. **True Take-Home** — lowest complexity, reuses existing tax engine; quick win
2. **Golden Hours** — reuses existing predictions pipeline; pure function
3. **Goal Pacing** — reuses existing earnings/week math; additive to predictions
4. **Fatigue Guardian** — new hook but reuses reminder infrastructure
5. **Maintenance Budgeting** — most complex, needs new data model + settings UI

---

## Success Criteria

- True Take-Home: post-shift summary shows gross → tax → vehicle cost → take-home breakdown; simplified vs actual methods produce different (correct) results
- Golden Hours: after 5+ shifts with `startedAt`, dashboard shows best day/time recommendation
- Goal Pacing: with `weeklyRevenueTarget` set, IntelligenceFeed shows ahead/on/behind status every day
- Fatigue Guardian: active shift shows daily limit banner at configured threshold; family block triggers notification; rest rule intercepts short-break shift starts
- Maintenance: dashboard warns when oil change is < 14 days away; user can input "just did this" and projection resets

---

## Privacy & Trust

- All calculations run locally on the device
- No location tracking beyond existing trip mileage
- No bank statement access
- No data sold or transmitted for algorithmic purposes
- Maintenance costs and intervals are user-configurable defaults, not prescriptive mandates

---

## Non-Goals

- Predictive demand forecasting (no external event/weather APIs)
- Automatic shift optimization (the app suggests, driver decides)
- Vehicle diagnostic integration (no OBD-II, no CAN bus)
- Multi-vehicle support (single vehicle per account for now)
- Maintenance booking/appointment scheduling (pure budgeting only)
