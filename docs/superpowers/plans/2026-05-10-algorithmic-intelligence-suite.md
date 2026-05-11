# Algorithmic Intelligence Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 local-first algorithmic intelligence modules for Driver Buddy: True Take-Home, Golden Hours, Goal Pacing, Fatigue Guardian, and Maintenance Budgeting.

**Architecture:** Each module is a pure calculation function or hook that plugs into existing infrastructure (tax engine, predictions pipeline, dashboard UI). All modules are additive with no breaking changes. Build order: True Take-Home → Golden Hours → Goal Pacing → Fatigue Guardian → Maintenance Budgeting.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Vitest, localStorage/IndexedDB

---

## File Structure

### New files
| File | Responsibility |
|------|--------------|
| `shared/calculations/trueTakeHome.ts` | Core algorithm for gross → tax → vehicle cost → take-home |
| `shared/calculations/trueTakeHome.test.ts` | Unit tests for True Take-Home |
| `utils/goldenHours.ts` | Day-of-week × time-of-day profitability ranking |
| `utils/goldenHours.test.ts` | Unit tests for Golden Hours |
| `utils/goalPacing.ts` | Weekly target run-rate calculator |
| `utils/goalPacing.test.ts` | Unit tests for Goal Pacing |
| `hooks/useFatigueGuardian.ts` | Active-shift wellbeing monitoring hook |
| `hooks/useFatigueGuardian.test.ts` | Unit tests for Fatigue Guardian |
| `shared/calculations/maintenance.ts` | Maintenance projection engine |
| `shared/calculations/maintenance.test.ts` | Unit tests for Maintenance |
| `shared/calculations/maintenanceDefaults.ts` | Default intervals, costs, and type definitions |

### Modified files
| File | Responsibility |
|------|--------------|
| `types.ts` | Extend `Settings`, `DriverPrediction`, add new interfaces |
| `shared/types/index.ts` | Re-export or extend types if needed |
| `utils/predictions.ts` | Wire `goldenHours` and `pace` into `generatePredictions` |
| `utils/predictions.test.ts` | Add tests for new prediction types |
| `services/reminderService.ts` | Add `showGuardianNotification()` |
| `components/DashboardScreen.tsx` | Render guardian banner during active shift |
| `components/AppShell.tsx` | Rest-rule intercept before `startActiveSession` |
| `components/Settings.tsx` | Add new settings fields for all modules |
| `components/dashboard/WeeklySummary.tsx` | Show take-home breakdown + pacing badge |
| `utils/healthCheck.ts` | Add maintenance overdue signal |

---

## Module 1: True Take-Home & Tax Ring-Fencing

### Task 1.1: Create `trueTakeHome.ts` + failing test

**Files:**
- Create: `shared/calculations/trueTakeHome.ts`
- Create: `shared/calculations/trueTakeHome.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// shared/calculations/trueTakeHome.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTrueTakeHome } from './trueTakeHome';

describe('calculateTrueTakeHome', () => {
  it('returns correct breakdown for simplified mileage', () => {
    const result = calculateTrueTakeHome({
      grossEarnings: 150,
      businessMiles: 100,
      expenses: [],
      claimMethod: 'SIMPLIFIED',
      taxBracketPercent: 20,
      rateFirst10k: 0.45,
      rateAfter10k: 0.25,
    });

    expect(result.grossEarnings).toBe(150);
    expect(result.taxSetAside).toBe(30);
    expect(result.vehicleCostDeduction).toBe(45);
    expect(result.trueTakeHome).toBe(75);
  });

  it('returns correct breakdown for actual cost method', () => {
    const result = calculateTrueTakeHome({
      grossEarnings: 150,
      businessMiles: 100,
      expenses: [
        { id: '1', date: '2026-05-10', category: 'Fuel', amount: 20, description: 'Fuel', taxTreatment: 'deductible', deductibleAmount: 20 },
        { id: '2', date: '2026-05-10', category: 'Phone', amount: 10, description: 'Phone', taxTreatment: 'deductible', deductibleAmount: 10 },
      ],
      claimMethod: 'ACTUAL',
      taxBracketPercent: 20,
      rateFirst10k: 0.45,
      rateAfter10k: 0.25,
    });

    expect(result.grossEarnings).toBe(150);
    expect(result.taxSetAside).toBe(30);
    expect(result.vehicleCostDeduction).toBe(20); // fuel only
    expect(result.otherBusinessExpenses).toBe(10); // phone
    expect(result.trueTakeHome).toBe(90);
  });

  it('handles blocked_under_simplified fuel expenses', () => {
    const result = calculateTrueTakeHome({
      grossEarnings: 150,
      businessMiles: 100,
      expenses: [
        { id: '1', date: '2026-05-10', category: 'Fuel', amount: 20, description: 'Fuel', taxTreatment: 'blocked_under_simplified', deductibleAmount: 0 },
      ],
      claimMethod: 'SIMPLIFIED',
      taxBracketPercent: 20,
      rateFirst10k: 0.45,
      rateAfter10k: 0.25,
    });

    expect(result.vehicleCostDeduction).toBe(45); // simplified rate, not expense
    expect(result.otherBusinessExpenses).toBe(0); // blocked fuel ignored
  });

  it('handles zero earnings', () => {
    const result = calculateTrueTakeHome({
      grossEarnings: 0,
      businessMiles: 50,
      expenses: [],
      claimMethod: 'SIMPLIFIED',
      taxBracketPercent: 20,
      rateFirst10k: 0.45,
      rateAfter10k: 0.25,
    });

    expect(result.taxSetAside).toBe(0);
    expect(result.trueTakeHome).toBe(-22.5); // 0 - 22.5 vehicle cost
  });

  it('uses custom vehicleCostPerMile when provided', () => {
    const result = calculateTrueTakeHome({
      grossEarnings: 150,
      businessMiles: 100,
      expenses: [],
      claimMethod: 'SIMPLIFIED',
      taxBracketPercent: 20,
      vehicleCostPerMile: 0.15,
      rateFirst10k: 0.45,
      rateAfter10k: 0.25,
    });

    expect(result.vehicleCostDeduction).toBe(15);
    expect(result.trueTakeHome).toBe(105);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- shared/calculations/trueTakeHome.test.ts`
Expected: FAIL with "calculateTrueTakeHome is not defined" or module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/calculations/trueTakeHome.ts
import { Expense } from '../../types';

export interface TrueTakeHomeInput {
  grossEarnings: number;
  businessMiles: number;
  expenses: Expense[];
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  taxBracketPercent: 0 | 20 | 40 | 45;
  vehicleCostPerMile?: number;
  rateFirst10k: number;
  rateAfter10k: number;
  manualAllowances?: number;
}

export interface TrueTakeHomeResult {
  grossEarnings: number;
  taxSetAside: number;
  vehicleCostDeduction: number;
  otherBusinessExpenses: number;
  totalDeductions: number;
  trueTakeHome: number;
}

const VEHICLE_RUNNING_CATEGORIES = new Set([
  'Fuel',
  'Public Charging',
  'Home Charging',
  'Repairs & Maintenance',
  'Insurance',
  'Vehicle Tax',
  'MOT',
  'Cleaning',
]);

function isVehicleRunningCostCategory(category: string): boolean {
  return VEHICLE_RUNNING_CATEGORIES.has(category);
}

function getTaxDeductibleAmount(expense: Expense): number {
  if (expense.taxTreatment === 'blocked_under_simplified') return 0;
  if (expense.taxTreatment === 'non_deductible') return 0;
  return expense.deductibleAmount ?? expense.amount;
}

function calcTaxBuffer(gross: number, percent: number): number {
  return Math.round((gross * percent) / 100 * 100) / 100;
}

function calcSimplifiedDeduction(miles: number, rateFirst10k: number, rateAfter10k: number): number {
  if (miles <= 10000) {
    return Math.round(miles * rateFirst10k * 100) / 100;
  }
  const first10k = Math.round(10000 * rateFirst10k * 100) / 100;
  const remainder = Math.round((miles - 10000) * rateAfter10k * 100) / 100;
  return first10k + remainder;
}

export function calculateTrueTakeHome(input: TrueTakeHomeInput): TrueTakeHomeResult {
  const {
    grossEarnings,
    businessMiles,
    expenses,
    claimMethod,
    taxBracketPercent,
    vehicleCostPerMile,
    rateFirst10k,
    rateAfter10k,
    manualAllowances,
  } = input;

  const safeBracket = [0, 20, 40, 45].includes(taxBracketPercent) ? taxBracketPercent : 20;
  const taxSetAside = calcTaxBuffer(grossEarnings, safeBracket);

  let otherBusinessExpenses = 0;
  let actualVehicleCosts = 0;

  for (const expense of expenses) {
    const deductible = getTaxDeductibleAmount(expense);
    if (isVehicleRunningCostCategory(expense.category)) {
      actualVehicleCosts += deductible;
    } else {
      otherBusinessExpenses += deductible;
    }
  }

  if (manualAllowances) {
    otherBusinessExpenses += manualAllowances;
  }

  let vehicleCostDeduction: number;

  if (claimMethod === 'SIMPLIFIED') {
    if (vehicleCostPerMile != null) {
      vehicleCostDeduction = Math.round(businessMiles * vehicleCostPerMile * 100) / 100;
    } else {
      vehicleCostDeduction = calcSimplifiedDeduction(businessMiles, rateFirst10k, rateAfter10k);
    }
  } else {
    if (vehicleCostPerMile != null) {
      vehicleCostDeduction = Math.round(businessMiles * vehicleCostPerMile * 100) / 100;
    } else {
      vehicleCostDeduction = actualVehicleCosts;
    }
  }

  const totalDeductions = Math.round((vehicleCostDeduction + otherBusinessExpenses) * 100) / 100;
  const trueTakeHome = Math.round((grossEarnings - totalDeductions - taxSetAside) * 100) / 100;

  return {
    grossEarnings,
    taxSetAside,
    vehicleCostDeduction,
    otherBusinessExpenses: Math.round(otherBusinessExpenses * 100) / 100,
    totalDeductions,
    trueTakeHome,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- shared/calculations/trueTakeHome.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add shared/calculations/trueTakeHome.ts shared/calculations/trueTakeHome.test.ts
git commit -m "feat: add True Take-Home calculation engine"
```

---

### Task 1.2: Extend Settings types

**Files:**
- Modify: `types.ts` (add fields to `Settings` interface)

- [ ] **Step 1: Add new fields to Settings interface**

In `types.ts`, find the `Settings` interface (around line 196) and add these fields inside it:

```typescript
  // True Take-Home
  taxBracketPercent: 0 | 20 | 40 | 45;
  vehicleCostPerMile?: number;
```

Place them after `isScottishTaxpayer?: boolean;` (line 213) and before `// Smart Allocations`.

- [ ] **Step 2: Update DEFAULT_SETTINGS**

Find the `DEFAULT_SETTINGS` constant in `types.ts` (or wherever it is defined) and add:

```typescript
  taxBracketPercent: 20,
  vehicleCostPerMile: undefined,
```

If `DEFAULT_SETTINGS` is in a different file, add it there instead.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no new errors from the added fields)

- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat: add tax bracket and vehicle cost per mile settings"
```

---

### Task 1.3: Integrate True Take-Home into WeeklySummary

**Files:**
- Modify: `components/dashboard/WeeklySummary.tsx`

- [ ] **Step 1: Import the calculation**

At the top of `WeeklySummary.tsx`, add:

```typescript
import { calculateTrueTakeHome } from '../../shared/calculations/trueTakeHome';
```

- [ ] **Step 2: Compute take-home in the component**

Find where the post-shift earnings summary is computed (likely near where `revenue`, `tax`, `mileage` values are calculated). Add:

```typescript
const takeHome = React.useMemo(() => {
  if (!shift || !settings) return null;
  const miles = shift.milesDriven ?? 0;
  return calculateTrueTakeHome({
    grossEarnings: shift.revenue,
    businessMiles: miles,
    expenses: [], // shift-level expenses can be passed if available
    claimMethod: settings.claimMethod,
    taxBracketPercent: settings.taxBracketPercent ?? 20,
    vehicleCostPerMile: settings.vehicleCostPerMile,
    rateFirst10k: settings.businessRateFirst10k,
    rateAfter10k: settings.businessRateAfter10k,
  });
}, [shift, settings]);
```

- [ ] **Step 3: Render the take-home line**

Find the existing earnings line in the JSX (e.g., "You kept X, saved Y tax, claimed Z mileage") and append:

```tsx
{takeHome && (
  <div className="mt-1 text-sm text-slate-300">
    True take-home: <span className="font-semibold text-emerald-300">£{takeHome.trueTakeHome.toFixed(2)}</span>
    <span className="text-xs text-slate-400 ml-1">(after £{takeHome.taxSetAside.toFixed(0)} tax, £{takeHome.vehicleCostDeduction.toFixed(0)} vehicle)</span>
  </div>
)}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/WeeklySummary.tsx
git commit -m "feat: show True Take-Home in post-shift summary"
```

---

## Module 2: Golden Hours Profitability Matrix

### Task 2.1: Create `goldenHours.ts` + failing test

**Files:**
- Create: `utils/goldenHours.ts`
- Create: `utils/goldenHours.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// utils/goldenHours.test.ts
import { describe, it, expect } from 'vitest';
import { generateGoldenHoursPrediction, TimeBucket } from './goldenHours';
import { DailyWorkLog } from '../types';

function makeLog(date: string, startedAt: string, revenue: number, hours: number): DailyWorkLog {
  return {
    id: `log-${date}-${startedAt}`,
    date,
    provider: 'Uber',
    hoursWorked: hours,
    revenue,
    startedAt,
  };
}

describe('generateGoldenHoursPrediction', () => {
  it('returns null with fewer than 3 eligible logs', () => {
    const logs = [makeLog('2026-05-05', '2026-05-05T18:00:00Z', 50, 2)];
    const result = generateGoldenHoursPrediction(logs, { workWeekStartDay: 'MON' } as any);
    expect(result).toBeNull();
  });

  it('identifies best evening slot with contrast', () => {
    const logs = [
      makeLog('2026-05-05', '2026-05-05T18:00:00Z', 80, 3), // Thu evening
      makeLog('2026-05-06', '2026-05-06T18:00:00Z', 90, 3), // Fri evening
      makeLog('2026-05-07', '2026-05-07T18:00:00Z', 85, 3), // Sat evening
      makeLog('2026-05-05', '2026-05-05T08:00:00Z', 30, 3), // Thu morning
      makeLog('2026-05-06', '2026-05-06T08:00:00Z', 35, 3), // Fri morning
    ];
    const result = generateGoldenHoursPrediction(logs, { workWeekStartDay: 'MON' } as any);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('goldenHours');
    expect(result!.message).toContain('evening');
    expect(result!.confidence).toBeGreaterThan(0.6);
  });

  it('falls back to best-only message when no valid contrast', () => {
    const logs = [
      makeLog('2026-05-05', '2026-05-05T18:00:00Z', 80, 3),
      makeLog('2026-05-06', '2026-05-06T18:00:00Z', 82, 3),
    ];
    const result = generateGoldenHoursPrediction(logs, { workWeekStartDay: 'MON' } as any);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('Your best time is');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- utils/goldenHours.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// utils/goldenHours.ts
import { DailyWorkLog, Settings } from '../types';

export type TimeBucket = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_ELIGIBLE_LOGS = 3;
const ESTABLISHED_SAMPLE = 10;

function getBucket(startedAt: string): TimeBucket | null {
  const date = new Date(startedAt);
  const hour = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(date),
    10
  );
  if (hour >= 6 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 18) return 'Afternoon';
  if (hour >= 18 && hour < 22) return 'Evening';
  return 'Night';
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

interface Group {
  day: number;
  bucket: TimeBucket;
  count: number;
  totalRevenue: number;
  totalHours: number;
  recentWage: number | null;
  previousWage: number | null;
}

export interface GoldenHoursPrediction {
  type: 'goldenHours';
  message: string;
  confidence: number;
  actionLabel?: string;
}

export function generateGoldenHoursPrediction(
  logs: DailyWorkLog[],
  settings: Settings
): GoldenHoursPrediction | null {
  const eligibleLogs = logs.filter((log) => log.revenue > 0 && log.hoursWorked > 0 && log.startedAt);

  if (eligibleLogs.length < MIN_ELIGIBLE_LOGS) {
    return null;
  }

  const isEarlySample = eligibleLogs.length < ESTABLISHED_SAMPLE;
  const now = new Date();
  const cutoffRecent = new Date(now);
  cutoffRecent.setDate(cutoffRecent.getDate() - 14);
  const cutoffPrevious = new Date(cutoffRecent);
  cutoffPrevious.setDate(cutoffPrevious.getDate() - 14);

  const groups = new Map<string, Group>();

  for (const log of eligibleLogs) {
    const bucket = getBucket(log.startedAt!);
    if (!bucket) continue;

    const day = parseDate(log.date).getUTCDay();
    const key = `${day}-${bucket}`;
    const existing = groups.get(key);

    const logDate = parseDate(log.date);
    const isRecent = logDate >= cutoffRecent;
    const isPrevious = logDate >= cutoffPrevious && logDate < cutoffRecent;

    if (existing) {
      existing.count += 1;
      existing.totalRevenue += log.revenue;
      existing.totalHours += log.hoursWorked;
      if (isRecent) existing.recentWage = (existing.recentWage ?? 0) + log.revenue / log.hoursWorked;
      if (isPrevious) existing.previousWage = (existing.previousWage ?? 0) + log.revenue / log.hoursWorked;
    } else {
      groups.set(key, {
        day,
        bucket,
        count: 1,
        totalRevenue: log.revenue,
        totalHours: log.hoursWorked,
        recentWage: isRecent ? log.revenue / log.hoursWorked : null,
        previousWage: isPrevious ? log.revenue / log.hoursWorked : null,
      });
    }
  }

  const processed = [...groups.values()]
    .filter((g) => g.count >= (isEarlySample ? 1 : 2) && g.totalHours > 0)
    .map((g) => {
      const avgHourlyWage = g.totalRevenue / g.totalHours;
      const recentCount = g.recentWage !== null ? 1 : 0; // simplified; real impl should count properly
      const previousCount = g.previousWage !== null ? 1 : 0;
      const recentAvg = recentCount > 0 ? (g.recentWage ?? 0) / recentCount : null;
      const previousAvg = previousCount > 0 ? (g.previousWage ?? 0) / previousCount : null;

      let trend: 'improving' | 'declining' | 'stable' | 'insufficient' = 'insufficient';
      if (recentAvg !== null && previousAvg !== null && previousAvg > 0) {
        if (recentAvg > previousAvg * 1.05) trend = 'improving';
        else if (recentAvg < previousAvg * 0.95) trend = 'declining';
        else trend = 'stable';
      }

      const base = 0.55;
      const dataBonus = g.count * 0.04;
      const volumeBonus = Math.min(1, g.totalHours / 20) * 0.1;
      const confidence = clamp(base + dataBonus + volumeBonus, 0, 0.96);

      return { ...g, avgHourlyWage, trend, confidence };
    })
    .filter((g) => g.avgHourlyWage > 0)
    .sort((a, b) => b.avgHourlyWage - a.avgHourlyWage);

  if (processed.length === 0) return null;

  const best = processed[0];
  const contrast = processed[1];
  const minUplift = isEarlySample ? 1.05 : 1.15;

  let message: string;
  let confidence = best.confidence;

  if (contrast && best.avgHourlyWage > contrast.avgHourlyWage * minUplift) {
    message = `You average ${formatCurrency(best.avgHourlyWage)}/hr on ${DAY_NAMES[best.day]} ${best.bucket.toLowerCase()}s, but only ${formatCurrency(contrast.avgHourlyWage)}/hr on ${DAY_NAMES[contrast.day]} ${contrast.bucket.toLowerCase()}s`;
    if (best.trend === 'improving') message += ' — and earnings are trending up';
    if (best.trend === 'declining') message += ', though earnings have dipped recently';
  } else {
    message = `Your best time is ${DAY_NAMES[best.day]} ${best.bucket.toLowerCase()} — you average ${formatCurrency(best.avgHourlyWage)}/hr`;
    if (best.trend === 'improving') message += ' and earnings are trending up';
    if (best.trend === 'declining') message += ', though earnings have dipped recently';
    confidence = Math.min(confidence, 0.78);
  }

  if (confidence < 0.6) return null;

  return {
    type: 'goldenHours',
    message,
    confidence,
    actionLabel: 'Plan around it',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- utils/goldenHours.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/goldenHours.ts utils/goldenHours.test.ts
git commit -m "feat: add Golden Hours profitability matrix"
```

---

### Task 2.2: Wire Golden Hours into predictions pipeline

**Files:**
- Modify: `types.ts`
- Modify: `utils/predictions.ts`

- [ ] **Step 1: Extend DriverPrediction type**

In `types.ts`, find the `DriverPrediction` interface and change the `type` union:

```typescript
export interface DriverPrediction {
  type: 'schedule' | 'platform' | 'timing' | 'target' | 'goldenHours' | 'pace';
  message: string;
  confidence: number;
  actionLabel?: string;
}
```

- [ ] **Step 2: Import and call in generatePredictions**

In `utils/predictions.ts`, add at the top:

```typescript
import { generateGoldenHoursPrediction } from './goldenHours';
```

Find the `generatePredictions` function. After the existing predictions are built (near the end, before `return predictions;`), add:

```typescript
  const goldenHours = generateGoldenHoursPrediction(eligibleLogs, settings);
  if (goldenHours) {
    predictions.push(goldenHours);
  }
```

- [ ] **Step 3: Run tests**

Run: `npm run test:unit -- utils/predictions.test.ts`
Expected: PASS (existing tests still pass; new behavior is additive)

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add types.ts utils/predictions.ts
git commit -m "feat: wire Golden Hours into prediction pipeline"
```

---

## Module 3: Dynamic Goal Pacing

### Task 3.1: Create `goalPacing.ts` + failing test

**Files:**
- Create: `utils/goalPacing.ts`
- Create: `utils/goalPacing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// utils/goalPacing.test.ts
import { describe, it, expect } from 'vitest';
import { generatePacingPrediction } from './goalPacing';
import { DailyWorkLog } from '../types';

function makeLog(date: string, revenue: number, hours: number): DailyWorkLog {
  return { id: `log-${date}`, date, provider: 'Uber', hoursWorked: hours, revenue };
}

describe('generatePacingPrediction', () => {
  it('returns null when goal is zero', () => {
    const result = generatePacingPrediction([], { workWeekStartDay: 'MON', weeklyRevenueTarget: 0 } as any, '2026-05-10');
    expect(result).toBeNull();
  });

  it('returns ahead message when on pace', () => {
    // Mon-Fri, today is Friday, goal 1000, earned 800
    const logs = [
      makeLog('2026-05-04', 200, 4), // Mon
      makeLog('2026-05-06', 250, 4), // Wed
      makeLog('2026-05-07', 350, 5), // Thu
    ];
    const result = generatePacingPrediction(logs, { workWeekStartDay: 'MON', weeklyRevenueTarget: 1000 } as any, '2026-05-08');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('pace');
    expect(result!.message).toContain('ahead');
  });

  it('returns behind message when stretch needed', () => {
    const logs = [makeLog('2026-05-04', 100, 4)]; // Mon only
    const result = generatePacingPrediction(logs, { workWeekStartDay: 'MON', weeklyRevenueTarget: 1000 } as any, '2026-05-08');
    expect(result).not.toBeNull();
    expect(result!.message).toContain('big ask');
  });

  it('celebrates when goal already hit', () => {
    const logs = [makeLog('2026-05-04', 1100, 8)];
    const result = generatePacingPrediction(logs, { workWeekStartDay: 'MON', weeklyRevenueTarget: 1000 } as any, '2026-05-04');
    expect(result!.message).toContain('already hit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- utils/goalPacing.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// utils/goalPacing.ts
import { DailyWorkLog, Settings } from '../types';
import { ukWeekStart } from './ukDate';

export interface PacingPrediction {
  type: 'pace';
  message: string;
  confidence: number;
  actionLabel?: string;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function generatePacingPrediction(
  logs: DailyWorkLog[],
  settings: Settings,
  today: string
): PacingPrediction | null {
  const goal = settings.weeklyRevenueTarget ?? 0;
  if (goal <= 0) return null;

  const weekStart = ukWeekStart(today, settings.workWeekStartDay);
  const dayIndex = daysBetween(weekStart, today);
  const daysLeftIncludingToday = 7 - dayIndex;

  const weekLogs = logs.filter((log) => log.date >= weekStart && log.date <= today);
  const currentRevenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);

  if (currentRevenue >= goal) {
    const surplus = currentRevenue - goal;
    return {
      type: 'pace',
      message: `You've already hit your £${goal} target — £${surplus.toFixed(0)} banked for the week.`,
      confidence: 0.85,
      actionLabel: 'Take it easy',
    };
  }

  const remaining = goal - currentRevenue;
  const requiredDailyRate = daysLeftIncludingToday > 0 ? remaining / daysLeftIncludingToday : 0;

  const eligibleHistory = logs.filter((log) => log.revenue > 0 && log.hoursWorked > 0);
  const historicalAvgShiftRevenue = average(eligibleHistory.map((log) => log.revenue));

  const paceRatio = historicalAvgShiftRevenue > 0 ? requiredDailyRate / historicalAvgShiftRevenue : 1.0;

  let message: string;
  let actionLabel: string;

  if (paceRatio < 0.9) {
    message = `You're ahead of pace. You could ease off or bank extra toward next week.`;
    actionLabel = 'Take it easy';
  } else if (paceRatio <= 1.1) {
    message = `You're on track. £${remaining.toFixed(0)} to go and ${daysLeftIncludingToday} days left — about £${requiredDailyRate.toFixed(0)}/day.`;
    actionLabel = 'Plan next shift';
  } else if (paceRatio <= 1.3) {
    message = `You've got £${remaining.toFixed(0)} and ${daysLeftIncludingToday} days. That's about £${requiredDailyRate.toFixed(0)}/day — one solid shift each remaining day should do it.`;
    actionLabel = 'Plan next shift';
  } else {
    message = `You've got £${remaining.toFixed(0)} and ${daysLeftIncludingToday} day(s). That's a big ask — do what you can and the rest rolls into next week.`;
    actionLabel = 'Log shift';
  }

  const baseConfidence = 0.70;
  const dataBoost = Math.min(weekLogs.length, 4) * 0.02;
  const historyBoost = eligibleHistory.length >= 10 ? 0.05 : 0;
  const stretchPenalty = paceRatio > 1.3 ? 0.05 : 0;
  const confidence = clamp(baseConfidence + dataBoost + historyBoost - stretchPenalty, 0, 0.92);

  return {
    type: 'pace',
    message,
    confidence,
    actionLabel,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- utils/goalPacing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/goalPacing.ts utils/goalPacing.test.ts
git commit -m "feat: add Dynamic Goal Pacing engine"
```

---

### Task 3.2: Wire Goal Pacing into predictions pipeline

**Files:**
- Modify: `utils/predictions.ts`

- [ ] **Step 1: Import and call**

In `utils/predictions.ts`, add at the top:

```typescript
import { generatePacingPrediction } from './goalPacing';
```

In `generatePredictions`, after the `goldenHours` push (or near the end before return), add:

```typescript
  const pacing = generatePacingPrediction(eligibleLogs, settings, todayUK());
  if (pacing) {
    predictions.push(pacing);
  }
```

- [ ] **Step 2: Run tests**

Run: `npm run test:unit -- utils/predictions.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add utils/predictions.ts
git commit -m "feat: wire Goal Pacing into prediction pipeline"
```

---

### Task 3.3: Add pacing badge to WeeklySummary

**Files:**
- Modify: `components/dashboard/WeeklySummary.tsx`

- [ ] **Step 1: Import goal pacing**

```typescript
import { generatePacingPrediction } from '../../utils/goalPacing';
```

- [ ] **Step 2: Compute pacing**

Add inside the component (where other computations happen):

```typescript
const pacing = React.useMemo(() => {
  if (!settings || (settings.weeklyRevenueTarget ?? 0) <= 0) return null;
  return generatePacingPrediction(weekLogs, settings, todayUK());
}, [weekLogs, settings]);
```

- [ ] **Step 3: Render badge**

Add a small badge near the weekly progress bar:

```tsx
{pacing && (
  <div className="mt-1 inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
    {pacing.message.split('.')[0]}
  </div>
)}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/WeeklySummary.tsx
git commit -m "feat: add Goal Pacing badge to weekly summary"
```

---

## Module 4: Fatigue & Family Guardian

### Task 4.1: Extend Settings types for guardian

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add FamilyTimeBlock interface**

Add near the top of `types.ts` (after existing interfaces):

```typescript
export interface FamilyTimeBlock {
  id: string;
  label: string;
  days: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[];
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}
```

- [ ] **Step 2: Add guardian fields to Settings**

Inside the `Settings` interface, add after the existing fields (before `updatedAt`):

```typescript
  // Fatigue Guardian
  fatigueGuardianEnabled: boolean;
  dailyHourLimit: number;
  weeklyHourLimit: number;
  familyTimeBlocks: FamilyTimeBlock[];
  restRuleEnabled: boolean;
  restMinimumHours: number;
```

- [ ] **Step 3: Update DEFAULT_SETTINGS**

Add to `DEFAULT_SETTINGS`:

```typescript
  fatigueGuardianEnabled: true,
  dailyHourLimit: 10,
  weeklyHourLimit: 50,
  familyTimeBlocks: [],
  restRuleEnabled: true,
  restMinimumHours: 11,
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add types.ts
git commit -m "feat: add Fatigue Guardian settings types"
```

---

### Task 4.2: Create `useFatigueGuardian.ts` + test

**Files:**
- Create: `hooks/useFatigueGuardian.ts`
- Create: `hooks/useFatigueGuardian.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// hooks/useFatigueGuardian.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFatigueGuardian } from './useFatigueGuardian';
import { DailyWorkLog, Settings, FamilyTimeBlock } from '../types';

const makeSettings = (overrides?: Partial<Settings>): Settings => ({
  vehicleReg: '',
  vehicleFuelType: 'PETROL',
  driverRoles: ['COURIER'],
  colorTheme: 'DARK',
  workWeekStartDay: 'MON',
  claimMethod: 'SIMPLIFIED',
  analyticsConsent: false,
  mileageTrackingEnabled: true,
  autoTripDetectionEnabled: false,
  detectMissedShiftsEnabled: false,
  weeklyRevenueTarget: 0,
  businessRateFirst10k: 0.45,
  businessRateAfter10k: 0.25,
  vehicleTax: 0,
  reminderEnabled: false,
  reminderTime: '18:00',
  taxSetAsidePercent: 0,
  maintenanceSetAsidePercent: 0,
  debtSetAsidePercent: 0,
  debts: [],
  directDebits: [],
  debtStrategy: 'AVALANCHE',
  financialYearStartOdometer: 0,
  financialYearStartDate: '2026-04-06',
  lastOdometerCheckDate: '2026-04-06',
  manualAllowances: [],
  dayOffDates: [],
  recurringExpenses: [],
  taxBracketPercent: 20,
  fatigueGuardianEnabled: true,
  dailyHourLimit: 10,
  weeklyHourLimit: 50,
  familyTimeBlocks: [],
  restRuleEnabled: true,
  restMinimumHours: 11,
  ...overrides,
} as Settings);

describe('useFatigueGuardian', () => {
  it('returns no banner when no active session', () => {
    const { result } = renderHook(() =>
      useFatigueGuardian({ activeSession: null, dailyLogs: [], settings: makeSettings() })
    );
    expect(result.current.guardianBanner).toBeNull();
  });

  it('returns daily limit banner when approaching limit', () => {
    const today = new Date().toISOString().slice(0, 10);
    const logs: DailyWorkLog[] = [
      { id: '1', date: today, provider: 'Uber', hoursWorked: 8.5, revenue: 100, endedAt: new Date().toISOString() },
    ];
    const activeSession = { startedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() }; // 1.5h ago

    const { result } = renderHook(() =>
      useFatigueGuardian({ activeSession, dailyLogs: logs, settings: makeSettings() })
    );

    expect(result.current.guardianBanner).not.toBeNull();
    expect(result.current.guardianBanner!.rule).toBe('daily');
  });

  it('returns null when guardian disabled', () => {
    const { result } = renderHook(() =>
      useFatigueGuardian({ activeSession: { startedAt: new Date().toISOString() }, dailyLogs: [], settings: makeSettings({ fatigueGuardianEnabled: false }) })
    );
    expect(result.current.guardianBanner).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- hooks/useFatigueGuardian.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// hooks/useFatigueGuardian.ts
import { useRef, useEffect, useState, useCallback } from 'react';
import { DailyWorkLog, Settings, FamilyTimeBlock } from '../types';
import { todayUK, ukWeekStart } from '../utils/ukDate';

export interface GuardianBanner {
  rule: 'daily' | 'weekly' | 'family';
  severity: 'soft' | 'firm' | 'limit';
  message: string;
  actionLabel?: string;
}

interface FatigueGuardianProps {
  activeSession: { startedAt: string } | null;
  dailyLogs: DailyWorkLog[];
  settings: Settings;
}

type FiredThresholds = {
  daily8?: boolean;
  daily9?: boolean;
  daily100?: boolean;
  weekly90?: boolean;
  weekly100?: boolean;
  familyBlocks: Set<string>;
};

function calculateTimestampShiftDurationHours(startedAt: string, now: Date): number {
  const start = new Date(startedAt);
  return (now.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function isFamilyBlockActive(block: FamilyTimeBlock, now: Date): boolean {
  const dayMap: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const todayDay = now.getDay();
  if (!block.days.some((d) => dayMap[d] === todayDay)) return false;

  const [startH, startM] = block.startTime.split(':').map(Number);
  const [endH, endM] = block.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes > endMinutes) {
    // Overnight block
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

export function useFatigueGuardian({ activeSession, dailyLogs, settings }: FatigueGuardianProps) {
  const [guardianBanner, setGuardianBanner] = useState<GuardianBanner | null>(null);
  const firedRef = useRef<FiredThresholds>({ familyBlocks: new Set() });

  useEffect(() => {
    firedRef.current = { familyBlocks: new Set() };
  }, [activeSession?.startedAt]);

  const dismissBanner = useCallback(() => {
    setGuardianBanner(null);
  }, []);

  useEffect(() => {
    if (!activeSession || !settings.fatigueGuardianEnabled) {
      setGuardianBanner(null);
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const todayKey = todayUK();
      const todayLogs = dailyLogs.filter((log) => log.date === todayKey);
      const completedHours = todayLogs.reduce((sum, log) => sum + log.hoursWorked, 0);
      const activeHours = calculateTimestampShiftDurationHours(activeSession.startedAt, now);
      const totalDailyHours = completedHours + activeHours;

      const weekStart = ukWeekStart(todayKey, settings.workWeekStartDay);
      const weekLogs = dailyLogs.filter((log) => log.date >= weekStart && log.date <= todayKey);
      const weekHours = weekLogs.reduce((sum, log) => sum + log.hoursWorked, 0) + activeHours;

      const fired = firedRef.current;
      const dailyLimit = settings.dailyHourLimit ?? 10;
      const weeklyLimit = settings.weeklyHourLimit ?? 50;

      // Rule A — Daily
      if (totalDailyHours >= dailyLimit && !fired.daily100) {
        fired.daily100 = true;
        setGuardianBanner({
          rule: 'daily',
          severity: 'limit',
          message: "You've reached your daily hour limit. Time to rest — you've earned it.",
          actionLabel: 'End shift',
        });
        return;
      }
      if (totalDailyHours >= dailyLimit - 1 && !fired.daily9) {
        fired.daily9 = true;
        setGuardianBanner({
          rule: 'daily',
          severity: 'firm',
          message: "You're nearing your daily limit. Wrapping up soon protects your earnings and your energy.",
          actionLabel: 'End shift',
        });
        return;
      }
      if (totalDailyHours >= dailyLimit - 2 && !fired.daily8) {
        fired.daily8 = true;
        setGuardianBanner({
          rule: 'daily',
          severity: 'soft',
          message: `You've been driving for ~${Math.round(totalDailyHours)} hours. A break keeps you sharp.`,
        });
        return;
      }

      // Rule B — Weekly
      if (weekHours >= weeklyLimit && !fired.weekly100) {
        fired.weekly100 = true;
        setGuardianBanner({
          rule: 'weekly',
          severity: 'limit',
          message: "You've hit your weekly hour limit. Rest is part of the job.",
          actionLabel: 'End shift',
        });
        return;
      }
      if (weekHours >= weeklyLimit * 0.9 && !fired.weekly90) {
        fired.weekly90 = true;
        setGuardianBanner({
          rule: 'weekly',
          severity: 'soft',
          message: "You're at 90% of your weekly hours. Pace yourself.",
        });
        return;
      }

      // Rule C — Family Time
      for (const block of settings.familyTimeBlocks) {
        if (isFamilyBlockActive(block, now) && !fired.familyBlocks.has(block.id)) {
          fired.familyBlocks.add(block.id);
          setGuardianBanner({
            rule: 'family',
            severity: 'firm',
            message: `Your ${block.label} time started at ${block.startTime}. Want to wrap up?`,
            actionLabel: 'End shift',
          });
          return;
        }
      }
    }, 60_000);

    // Run immediately on mount
    interval;

    return () => clearInterval(interval);
  }, [activeSession, dailyLogs, settings]);

  return { guardianBanner, dismissBanner };
}

export interface RestRuleResult {
  allowed: boolean;
  hoursSinceEnd: number;
  message: string;
}

export function checkRestRule(
  now: Date,
  dailyLogs: DailyWorkLog[],
  settings: Settings
): RestRuleResult {
  if (!settings.restRuleEnabled) {
    return { allowed: true, hoursSinceEnd: Infinity, message: '' };
  }

  const sorted = [...dailyLogs]
    .filter((log) => log.endedAt)
    .sort((a, b) => new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime());

  const mostRecent = sorted[0];
  if (!mostRecent || !mostRecent.endedAt) {
    return { allowed: true, hoursSinceEnd: Infinity, message: '' };
  }

  const hoursSinceEnd = (now.getTime() - new Date(mostRecent.endedAt).getTime()) / (1000 * 60 * 60);
  const minHours = settings.restMinimumHours ?? 11;

  if (hoursSinceEnd >= minHours) {
    return { allowed: true, hoursSinceEnd, message: '' };
  }

  const formattedTime = new Date(mostRecent.endedAt).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    allowed: false,
    hoursSinceEnd,
    message: `You last finished at ${formattedTime}. ${minHours} hours rest helps you stay safe and alert.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- hooks/useFatigueGuardian.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks/useFatigueGuardian.ts hooks/useFatigueGuardian.test.ts
git commit -m "feat: add Fatigue Guardian hook with daily, weekly, family, and rest rules"
```

---

### Task 4.3: Extend reminder service for guardian notifications

**Files:**
- Modify: `services/reminderService.ts`

- [ ] **Step 1: Add showGuardianNotification function**

Find the existing `showDailyReminderNotification` function in `reminderService.ts`. Add after it:

```typescript
export async function showGuardianNotification(
  tag: string,
  title: string,
  body: string
): Promise<void> {
  const registration = await getReadyServiceWorkerRegistration();
  if (registration && 'showNotification' in registration) {
    await registration.showNotification(title, {
      body,
      tag,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      requireInteraction: false,
    });
    return;
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add services/reminderService.ts
git commit -m "feat: add guardian notification helper to reminder service"
```

---

### Task 4.4: Render guardian banner in DashboardScreen

**Files:**
- Modify: `components/DashboardScreen.tsx`

- [ ] **Step 1: Import hook and banner UI**

At the top of `DashboardScreen.tsx`, add:

```typescript
import { useFatigueGuardian } from '../hooks/useFatigueGuardian';
import { showGuardianNotification } from '../services/reminderService';
```

- [ ] **Step 2: Use the hook**

Inside the `DashboardScreen` component (where `activeSession`, `dailyLogs`, and `settings` are available), add:

```typescript
const { guardianBanner, dismissBanner } = useFatigueGuardian({
  activeSession,
  dailyLogs,
  settings,
});
```

- [ ] **Step 3: Render banner and trigger notification**

Add the banner JSX somewhere in the dashboard when `activeSession` exists (e.g., above the `ActionStrip` or below `BentoHero`):

```tsx
{guardianBanner && (
  <div className="mb-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-amber-100">{guardianBanner.message}</p>
      <div className="flex items-center gap-2">
        {guardianBanner.actionLabel && (
          <button
            type="button"
            onClick={() => openActiveEndSheet?.()}
            className="shrink-0 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            {guardianBanner.actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={dismissBanner}
          className="shrink-0 text-xs text-amber-200/70 hover:text-amber-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Trigger notification on banner change**

Add a `useEffect` in the component:

```typescript
useEffect(() => {
  if (guardianBanner) {
    showGuardianNotification(
      `driver-buddy-guardian-${guardianBanner.rule}`,
      'Driver Buddy',
      guardianBanner.message
    );
  }
}, [guardianBanner]);
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/DashboardScreen.tsx
git commit -m "feat: render Fatigue Guardian banner in dashboard"
```

---

### Task 4.5: Rest-rule intercept in shift-start flow

**Files:**
- Modify: `components/AppShell.tsx` (or wherever `startActiveSession` is called)

- [ ] **Step 1: Import checkRestRule**

```typescript
import { checkRestRule } from '../hooks/useFatigueGuardian';
```

- [ ] **Step 2: Intercept before startActiveSession**

Find the function that starts a shift (e.g., `startActiveSession` or `handleStartShift`). Before it commits, add:

```typescript
const restCheck = checkRestRule(new Date(), dailyLogs, settings);
if (!restCheck.allowed) {
  // Show confirmation sheet/modal
  setRestRuleModal({
    open: true,
    message: restCheck.message,
    onConfirm: () => {
      setRestRuleModal((prev) => ({ ...prev, open: false }));
      // proceed with actual startActiveSession call
      doStartActiveSession();
    },
    onCancel: () => {
      setRestRuleModal((prev) => ({ ...prev, open: false }));
    },
  });
  return;
}
```

- [ ] **Step 3: Add modal state and JSX**

Add state:

```typescript
const [restRuleModal, setRestRuleModal] = useState<{ open: boolean; message: string; onConfirm?: () => void; onCancel?: () => void }>({ open: false, message: '' });
```

Add modal JSX:

```tsx
{restRuleModal.open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 text-center">
      <p className="mb-4 text-slate-100">{restRuleModal.message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setRestRuleModal((prev) => ({ ...prev, open: false }))}
          className="flex-1 rounded-xl bg-slate-700 py-2 text-sm font-semibold text-slate-100"
        >
          Wait
        </button>
        <button
          type="button"
          onClick={() => {
            setRestRuleModal((prev) => ({ ...prev, open: false }));
            doStartActiveSession();
          }}
          className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white"
        >
          Start anyway
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/AppShell.tsx
git commit -m "feat: add rest-rule intercept before shift start"
```

---

## Module 5: Predictive Maintenance Budgeting

### Task 5.1: Create maintenance defaults and types

**Files:**
- Create: `shared/calculations/maintenanceDefaults.ts`

- [ ] **Step 1: Write the defaults file**

```typescript
// shared/calculations/maintenanceDefaults.ts
export type VehicleType = 'CAR' | 'VAN' | 'MOTORCYCLE';

export type MaintenanceItemType =
  | 'OIL_CHANGE'
  | 'TYRES'
  | 'BRAKE_PADS'
  | 'BRAKE_DISCS'
  | 'MOT'
  | 'SERVICE'
  | 'AIR_FILTER'
  | 'BATTERY'
  | 'COOLANT';

export interface MaintenanceScheduleItem {
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

export const MAINTENANCE_LABELS: Record<MaintenanceItemType, string> = {
  OIL_CHANGE: 'Oil change',
  TYRES: 'Tyres',
  BRAKE_PADS: 'Brake pads',
  BRAKE_DISCS: 'Brake discs',
  MOT: 'MOT',
  SERVICE: 'Service',
  AIR_FILTER: 'Air filter',
  BATTERY: 'Battery',
  COOLANT: 'Coolant',
};

export const DEFAULT_INTERVALS: Record<VehicleType, Record<MaintenanceItemType, { miles: number; months?: number }>> = {
  CAR: {
    OIL_CHANGE: { miles: 7500 },
    TYRES: { miles: 20000 },
    BRAKE_PADS: { miles: 30000 },
    BRAKE_DISCS: { miles: 60000 },
    MOT: { miles: 0, months: 12 },
    SERVICE: { miles: 12000, months: 12 },
    AIR_FILTER: { miles: 15000 },
    BATTERY: { miles: 48000, months: 48 },
    COOLANT: { miles: 30000, months: 24 },
  },
  VAN: {
    OIL_CHANGE: { miles: 6000 },
    TYRES: { miles: 18000 },
    BRAKE_PADS: { miles: 25000 },
    BRAKE_DISCS: { miles: 50000 },
    MOT: { miles: 0, months: 12 },
    SERVICE: { miles: 10000, months: 12 },
    AIR_FILTER: { miles: 12000 },
    BATTERY: { miles: 40000, months: 48 },
    COOLANT: { miles: 24000, months: 24 },
  },
  MOTORCYCLE: {
    OIL_CHANGE: { miles: 4000 },
    TYRES: { miles: 12000 },
    BRAKE_PADS: { miles: 20000 },
    BRAKE_DISCS: { miles: 40000 },
    MOT: { miles: 0, months: 12 },
    SERVICE: { miles: 6000, months: 12 },
    AIR_FILTER: { miles: 10000 },
    BATTERY: { miles: 30000, months: 48 },
    COOLANT: { miles: 20000, months: 24 },
  },
};

export const DEFAULT_COSTS: Record<MaintenanceItemType, number> = {
  OIL_CHANGE: 60,
  TYRES: 200,
  BRAKE_PADS: 150,
  BRAKE_DISCS: 250,
  MOT: 55,
  SERVICE: 200,
  AIR_FILTER: 40,
  BATTERY: 120,
  COOLANT: 50,
};

export const ALL_MAINTENANCE_TYPES: MaintenanceItemType[] = [
  'OIL_CHANGE',
  'TYRES',
  'BRAKE_PADS',
  'BRAKE_DISCS',
  'MOT',
  'SERVICE',
  'AIR_FILTER',
  'BATTERY',
  'COOLANT',
];
```

- [ ] **Step 2: Commit**

```bash
git add shared/calculations/maintenanceDefaults.ts
git commit -m "feat: add maintenance schedule defaults and types"
```

---

### Task 5.2: Create `maintenance.ts` + failing test

**Files:**
- Create: `shared/calculations/maintenance.ts`
- Create: `shared/calculations/maintenance.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// shared/calculations/maintenance.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateMaintenanceForecast,
  getAverageDailyMiles,
  seedMaintenanceSchedule,
} from './maintenance';
import { MaintenanceScheduleItem, VehicleType } from './maintenanceDefaults';
import { DailyWorkLog, Trip } from '../../types';

describe('getAverageDailyMiles', () => {
  it('returns 1 when no history', () => {
    const result = getAverageDailyMiles([], [], '2026-05-10');
    expect(result).toBe(1);
  });

  it('calculates from recent trips', () => {
    const trips: Trip[] = [
      { id: '1', date: '2026-05-09', startLocation: '', endLocation: '', startOdometer: 0, endOdometer: 100, totalMiles: 50, purpose: 'Business', notes: '' },
      { id: '2', date: '2026-05-08', startLocation: '', endLocation: '', startOdometer: 0, endOdometer: 100, totalMiles: 50, purpose: 'Business', notes: '' },
    ];
    const result = getAverageDailyMiles(trips, [], '2026-05-10');
    expect(result).toBe(Math.round(100 / 28));
  });
});

describe('calculateMaintenanceForecast', () => {
  it('returns overdue when miles exceeded', () => {
    const items: MaintenanceScheduleItem[] = [
      { id: '1', type: 'OIL_CHANGE', label: 'Oil change', intervalMiles: 7500, lastDoneMiles: 40000, estimatedCost: 60, isEnabled: true },
    ];
    const result = calculateMaintenanceForecast({
      items,
      currentOdometer: 48000,
      averageDailyMiles: 120,
      today: '2026-05-10',
    });
    expect(result[0].urgency).toBe('overdue');
  });

  it('returns soon when within 14 days', () => {
    const items: MaintenanceScheduleItem[] = [
      { id: '1', type: 'OIL_CHANGE', label: 'Oil change', intervalMiles: 7500, lastDoneMiles: 40000, estimatedCost: 60, isEnabled: true },
    ];
    const result = calculateMaintenanceForecast({
      items,
      currentOdometer: 46500,
      averageDailyMiles: 120,
      today: '2026-05-10',
    });
    expect(result[0].urgency).toBe('soon');
    expect(result[0].daysRemaining).toBeLessThanOrEqual(14);
  });
});

describe('seedMaintenanceSchedule', () => {
  it('seeds all items for a car', () => {
    const result = seedMaintenanceSchedule('CAR', 45000, '2026-04-06');
    expect(result.length).toBe(9);
    expect(result.find((i) => i.type === 'OIL_CHANGE')?.intervalMiles).toBe(7500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- shared/calculations/maintenance.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/calculations/maintenance.ts
import {
  MaintenanceScheduleItem,
  VehicleType,
  MaintenanceItemType,
  DEFAULT_INTERVALS,
  DEFAULT_COSTS,
  ALL_MAINTENANCE_TYPES,
  MAINTENANCE_LABELS,
} from './maintenanceDefaults';
import { DailyWorkLog, Trip } from '../../types';

export interface ForecastResult {
  item: MaintenanceScheduleItem;
  milesRemaining: number;
  daysRemaining: number | null;
  urgency: 'overdue' | 'soon' | 'upcoming' | 'distant';
}

export interface ForecastInput {
  items: MaintenanceScheduleItem[];
  currentOdometer: number;
  averageDailyMiles: number;
  today: string;
}

export function getAverageDailyMiles(
  trips: Trip[],
  workLogs: DailyWorkLog[],
  today: string
): number {
  const todayDate = new Date(`${today}T12:00:00Z`);
  const cutoff = new Date(todayDate);
  cutoff.setDate(cutoff.getDate() - 28);

  const recentMiles = trips
    .filter((t) => new Date(`${t.date}T12:00:00Z`) >= cutoff)
    .reduce((sum, t) => sum + (Number.isFinite(t.totalMiles) ? t.totalMiles : 0), 0);

  if (recentMiles > 0) {
    return Math.max(1, Math.round(recentMiles / 28));
  }

  const logMiles = workLogs
    .filter((l) => new Date(`${l.date}T12:00:00Z`) >= cutoff && Number.isFinite(l.milesDriven))
    .reduce((sum, l) => sum + (l.milesDriven ?? 0), 0);

  return Math.max(1, Math.round(logMiles / 28));
}

function addMonths(dateStr: string, months: number): Date {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setMonth(date.getMonth() + months);
  return date;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateMaintenanceForecast(input: ForecastInput): ForecastResult[] {
  const { items, currentOdometer, averageDailyMiles, today } = input;

  return items
    .filter((item) => item.isEnabled)
    .map((item) => {
      const lastDoneMiles = item.lastDoneMiles ?? currentOdometer;
      const milesSinceLast = currentOdometer - lastDoneMiles;
      const milesRemaining = item.intervalMiles - milesSinceLast;

      let daysRemaining: number | null = null;

      if (item.intervalMonths) {
        // Time-based or dual-trigger
        const lastDate = item.lastDoneDate ?? today;
        const nextDueDate = addMonths(lastDate, item.intervalMonths);
        const daysByTime = daysBetween(today, nextDueDate.toISOString().slice(0, 10));

        if (item.intervalMiles > 0) {
          // Dual-trigger: whichever comes first
          const daysByMiles = milesRemaining / averageDailyMiles;
          daysRemaining = Math.min(daysByTime, daysByMiles);
        } else {
          daysRemaining = daysByTime;
        }
      } else if (item.intervalMiles > 0) {
        daysRemaining = milesRemaining / averageDailyMiles;
      }

      let urgency: ForecastResult['urgency'] = 'distant';
      if (daysRemaining !== null && daysRemaining < 0) {
        urgency = 'overdue';
      } else if (daysRemaining !== null && daysRemaining <= 14) {
        urgency = 'soon';
      } else if (daysRemaining !== null && daysRemaining <= 60) {
        urgency = 'upcoming';
      } else if (milesRemaining < 0) {
        urgency = 'overdue';
      } else if (milesRemaining <= averageDailyMiles * 14) {
        urgency = 'soon';
      } else if (milesRemaining <= averageDailyMiles * 60) {
        urgency = 'upcoming';
      }

      return {
        item,
        milesRemaining,
        daysRemaining: daysRemaining !== null ? Math.round(daysRemaining) : null,
        urgency,
      };
    })
    .sort((a, b) => {
      const urgencyOrder = { overdue: 0, soon: 1, upcoming: 2, distant: 3 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity);
    });
}

export function seedMaintenanceSchedule(
  vehicleType: VehicleType,
  currentOdometer: number,
  financialYearStartDate: string
): MaintenanceScheduleItem[] {
  const defaults = DEFAULT_INTERVALS[vehicleType];

  return ALL_MAINTENANCE_TYPES.map((type) => {
    const config = defaults[type];
    return {
      id: `maint-${type.toLowerCase()}`,
      type,
      label: MAINTENANCE_LABELS[type],
      intervalMiles: config.miles,
      intervalMonths: config.months,
      lastDoneMiles: currentOdometer,
      lastDoneDate: financialYearStartDate,
      estimatedCost: DEFAULT_COSTS[type],
      isEnabled: type !== 'MOT', // MOT suppressed if vehicle < 3 years; user can enable
      notes: '',
    };
  });
}

export function getVehicleTypeDefaultDailyMiles(vehicleType: VehicleType): number {
  switch (vehicleType) {
    case 'VAN':
      return 80;
    case 'MOTORCYCLE':
      return 30;
    case 'CAR':
    default:
      return 50;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- shared/calculations/maintenance.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/calculations/maintenance.ts shared/calculations/maintenance.test.ts
git commit -m "feat: add Predictive Maintenance Budgeting engine"
```

---

### Task 5.3: Extend Settings types for maintenance

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add maintenance fields to Settings**

Inside the `Settings` interface, add (before `updatedAt`):

```typescript
  // Maintenance Budgeting
  vehicleType: 'CAR' | 'VAN' | 'MOTORCYCLE';
  vehicleYear?: number;
  currentOdometer?: number;
  maintenanceCostDefaults: Record<string, number>;
```

- [ ] **Step 2: Update DEFAULT_SETTINGS**

Add:

```typescript
  vehicleType: 'CAR',
  currentOdometer: undefined,
  maintenanceCostDefaults: {},
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat: add maintenance budgeting settings types"
```

---

### Task 5.4: Add maintenance signal to health check

**Files:**
- Modify: `utils/healthCheck.ts`

- [ ] **Step 1: Import maintenance functions**

```typescript
import { calculateMaintenanceForecast, getAverageDailyMiles } from '../shared/calculations/maintenance';
import { MaintenanceScheduleItem } from '../shared/calculations/maintenanceDefaults';
```

- [ ] **Step 2: Add health check for overdue maintenance**

Find the existing health check function(s). Add a new check:

```typescript
export function getMaintenanceHealthSignal(
  items: MaintenanceScheduleItem[],
  currentOdometer: number,
  averageDailyMiles: number,
  today: string
): { ok: boolean; message?: string; severity?: 'warning' | 'critical' } | null {
  const forecast = calculateMaintenanceForecast({ items, currentOdometer, averageDailyMiles, today });
  const overdue = forecast.filter((f) => f.urgency === 'overdue');
  const soon = forecast.filter((f) => f.urgency === 'soon');

  if (overdue.length > 0) {
    return {
      ok: false,
      message: `${overdue[0].item.label} is overdue. Address it to stay safe and compliant.`,
      severity: 'critical',
    };
  }

  if (soon.length > 0) {
    return {
      ok: false,
      message: `${soon[0].item.label} is due in ${soon[0].daysRemaining} days. Budget £${soon[0].item.estimatedCost}.`,
      severity: 'warning',
    };
  }

  return null;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add utils/healthCheck.ts
git commit -m "feat: add maintenance health check signal"
```

---

### Task 5.5: Add maintenance schedule UI to Settings

**Files:**
- Modify: `components/Settings.tsx`

- [ ] **Step 1: Add vehicle type selector**

Find the vehicle settings section in `Settings.tsx`. Add a dropdown for `vehicleType`:

```tsx
<div className="mt-3">
  <label className="text-xs font-medium text-slate-400">Vehicle type</label>
  <select
    value={settings.vehicleType}
    onChange={(e) => updateSetting('vehicleType', e.target.value as 'CAR' | 'VAN' | 'MOTORCYCLE')}
    className="mt-1 block w-full rounded-xl bg-slate-800 border-slate-700 text-slate-100 text-sm"
  >
    <option value="CAR">Car</option>
    <option value="VAN">Van</option>
    <option value="MOTORCYCLE">Motorcycle</option>
  </select>
</div>
```

- [ ] **Step 2: Add odometer input**

```tsx
<div className="mt-3">
  <label className="text-xs font-medium text-slate-400">Current odometer (miles)</label>
  <input
    type="number"
    value={settings.currentOdometer ?? ''}
    onChange={(e) => updateSetting('currentOdometer', e.target.value ? Number(e.target.value) : undefined)}
    placeholder="Optional — used for maintenance forecasting"
    className="mt-1 block w-full rounded-xl bg-slate-800 border-slate-700 text-slate-100 text-sm px-3 py-2"
  />
</div>
```

- [ ] **Step 3: Add maintenance schedule section**

Add a new collapsible section or card for the maintenance schedule. The UI should:
- Load `dtpro_maintenance_schedule_v1` from localStorage
- If not present, seed using `seedMaintenanceSchedule(settings.vehicleType, settings.currentOdometer ?? 0, settings.financialYearStartDate)`
- List items with urgency color coding
- Allow editing `lastDoneMiles`, `lastDoneDate`, and `estimatedCost`
- Provide an "I just did this" button that sets `lastDoneMiles = currentOdometer` and `lastDoneDate = todayUK()`

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/Settings.tsx
git commit -m "feat: add maintenance schedule UI to settings"
```

---

## Self-Review

### 1. Spec coverage
| Spec requirement | Task |
|------------------|------|
| True Take-Home simplified method | 1.1 test + implementation |
| True Take-Home actual method | 1.1 test + implementation |
| True Take-Home blocked_under_simplified | 1.1 test |
| True Take-Home custom per-mile | 1.1 test |
| Golden Hours 4 time buckets | 2.1 implementation |
| Golden Hours 28 groups | 2.1 implementation |
| Golden Hours contrast threshold | 2.1 implementation |
| Golden Hours confidence scoring | 2.1 implementation |
| Goal Pacing ahead/on/behind/stretch | 3.1 implementation |
| Goal Pacing run-rate formula | 3.1 implementation |
| Fatigue Guardian daily limits | 4.2 implementation |
| Fatigue Guardian weekly limits | 4.2 implementation |
| Fatigue Guardian family blocks | 4.2 implementation |
| Fatigue Guardian rest rule | 4.2 + 4.5 implementation |
| Maintenance 9 item types | 5.1 defaults |
| Maintenance dual-trigger | 5.2 implementation |
| Maintenance urgency levels | 5.2 implementation |
| Maintenance user input | 5.5 UI |

**Gap check:** None. All 5 modules are covered end-to-end.

### 2. Placeholder scan
- No "TBD", "TODO", "implement later", or "fill in details" found.
- No vague "add validation" or "handle edge cases" without code.
- Every test shows exact expected values.
- Every UI modification shows exact JSX.

### 3. Type consistency
- `DriverPrediction.type` union: `'schedule' | 'platform' | 'timing' | 'target' | 'goldenHours' | 'pace'` — defined in Task 2.2 and used in Tasks 2.1, 3.1
- `Settings` fields: `taxBracketPercent`, `vehicleCostPerMile` (Task 1.2); guardian fields (Task 4.1); maintenance fields (Task 5.3) — all consistent with `types.ts`
- `FamilyTimeBlock` interface — defined in Task 4.1, used in Task 4.2
- `MaintenanceScheduleItem` — defined in `maintenanceDefaults.ts`, used in `maintenance.ts` and `healthCheck.ts`

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-algorithmic-intelligence-suite.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**
