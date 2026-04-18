# Implementation Plan: Entity Model Refactor

> **For Codex:** Execute tasks in strict order. Mark each sub-task `[x]` as you complete it. Do not start the next task until the current one passes its verification step. Commit after every numbered task. Never modify `design.md`, `requirements.md`, or this file's structure — only update checkbox state.

## Overview

This plan migrates Driver Buddy from three overlapping shift types (`DailyWorkLog`, `ActiveWorkSession`, `Trip`) to a single `Shift` entity, enriches `Expense` with HMRC classification fields, and extracts all business logic into `shared/calculations/`. The Worker stays a thin sync API — no logic moves server-side.

Tasks are ordered to avoid breaking the live app: new types and calculations are added first (no changes to existing code), then components are migrated one at a time, then storage and sync are updated last.

---

## Phase 1: Foundation — New Types and Calculations

### Task 1: Create shared/types/ with canonical type definitions

**Files to create:**
- `shared/types/shift.ts`
- `shared/types/expense.ts`
- `shared/types/index.ts`

- [x] 1.1 Create `shared/types/shift.ts` with the following content exactly:

```typescript
export type ShiftStatus = 'active' | 'completed';
export type MileageSource = 'odo' | 'gps' | 'manual';
export type Platform = 'uber' | 'deliveroo' | 'just_eat' | 'amazon_flex' | 'bolt' | 'other';

export interface ShiftEarning {
  id: string;
  shiftId: string;
  platform: Platform;
  amount: number;
  jobCount?: number;
}

export interface Shift {
  id: string;
  date: string;
  status: ShiftStatus;
  primaryPlatform?: string;
  hoursWorked?: number;
  totalEarnings: number;
  earnings: ShiftEarning[];
  startedAt?: string;
  endedAt?: string;
  startOdometer?: number;
  endOdometer?: number;
  businessMiles?: number;
  personalGapMiles?: number;
  gpsMiles?: number;
  mileageSource?: MileageSource;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  fuelLiters?: number;
  expensesTotal?: number;
  jobCount?: number;
  notes?: string;
}

export interface ShiftExpenseDraft {
  id: string;
  category: string;
  amount: number;
  liters?: number;
  description: string;
}

export interface ActiveShift {
  id: string;
  date: string;
  startedAt: string;
  primaryPlatform?: string;
  startOdometer?: number;
  totalEarnings?: number;
  businessMiles?: number;
  earnings: ShiftEarning[];
  expenseDrafts: ShiftExpenseDraft[];
}

export interface ShiftSummary {
  id: string;
  date: string;
  startedAt: string;
  endedAt: string;
  hoursWorked?: number;
  totalEarnings: number;
  taxToSetAside: number;
  mileageClaim: number;
  expensesTotal: number;
  realProfit: number;
  businessMiles: number;
  fuelLiters: number;
  insights: string[];
  weekEarnings: number;
  weekTaxToSetAside: number;
  weekKept: number;
  workDayCount: number;
}
```

- [x] 1.2 Create `shared/types/expense.ts` with the following content exactly:

```typescript
export type ExpenseScope = 'business' | 'personal' | 'mixed';
export type VehicleExpenseType =
  | 'running_cost'
  | 'separately_allowable'
  | 'non_vehicle'
  | 'personal_only';
export type TaxTreatment =
  | 'deductible'
  | 'partially_deductible'
  | 'blocked_under_simplified'
  | 'non_deductible';
export type ExpenseSourceType = 'manual' | 'bank_import';
export type ExpenseReviewStatus = 'pending' | 'confirmed' | 'edited' | 'ignored';

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  receiptId?: string;
  receiptUrl?: string;
  hasReceiptImage?: boolean;
  isVatClaimable?: boolean;
  liters?: number;
  // HMRC classification
  scope: ExpenseScope;
  businessUsePercent: number;
  deductibleAmount: number;
  nonDeductibleAmount: number;
  vehicleExpenseType: VehicleExpenseType;
  taxTreatment: TaxTreatment;
  linkedShiftId?: string | null;
  sourceType: ExpenseSourceType;
  reviewStatus: ExpenseReviewStatus;
}
```

- [x] 1.3 Create `shared/types/index.ts`:

```typescript
export * from './shift';
export * from './expense';
```

- [x] 1.4 Verify TypeScript compiles with no errors:
```bash
npx tsc --noEmit
```
Expected: zero errors relating to the new files (other pre-existing errors are acceptable at this stage).

- [x] 1.5 Commit:
```bash
git add shared/types/
git commit -m "feat: add canonical Shift and Expense types in shared/types/"
```

---

### Task 2: Create shared/calculations/mileage.ts with tests

**Files to create:**
- `shared/calculations/mileage.ts`
- `shared/calculations/__tests__/mileage.test.ts`

- [x] 2.1 Create `shared/calculations/mileage.ts`:

```typescript
/**
 * Business miles driven during a shift (end odo minus start odo).
 * Returns 0 if either value is missing.
 */
export function calcBusinessMilesFromOdo(startOdo: number, endOdo: number): number {
  return Math.max(0, endOdo - startOdo);
}

/**
 * Personal gap miles between two shifts (next start minus previous end).
 * Returns 0 if result would be negative.
 */
export function calcPersonalGapMiles(prevEndOdo: number, nextStartOdo: number): number {
  return Math.max(0, nextStartOdo - prevEndOdo);
}

/**
 * HMRC simplified mileage allowance.
 * 45p per mile for first 10,000 business miles in tax year, 25p thereafter.
 * Rates can be overridden via settings for future-proofing.
 */
export function calcMileageAllowance(
  businessMiles: number,
  rateFirst10k = 0.45,
  rateAfter10k = 0.25
): number {
  if (businessMiles <= 10000) {
    return businessMiles * rateFirst10k;
  }
  return 10000 * rateFirst10k + (businessMiles - 10000) * rateAfter10k;
}

/**
 * Validate that odometer readings are in correct sequence.
 */
export function validateOdoSequence(
  startOdo: number,
  endOdo: number
): { valid: boolean; error?: string } {
  if (endOdo < startOdo) {
    return { valid: false, error: 'End odometer must be greater than or equal to start odometer' };
  }
  return { valid: true };
}
```

- [x] 2.2 Create `shared/calculations/__tests__/mileage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  calcBusinessMilesFromOdo,
  calcPersonalGapMiles,
  calcMileageAllowance,
  validateOdoSequence,
} from '../mileage';

describe('calcBusinessMilesFromOdo', () => {
  it('returns difference between end and start', () => {
    expect(calcBusinessMilesFromOdo(1000, 1050)).toBe(50);
  });
  it('returns 0 when end equals start', () => {
    expect(calcBusinessMilesFromOdo(1000, 1000)).toBe(0);
  });
  it('returns 0 when end is less than start (bad data)', () => {
    expect(calcBusinessMilesFromOdo(1050, 1000)).toBe(0);
  });
});

describe('calcPersonalGapMiles', () => {
  it('returns gap between shifts', () => {
    expect(calcPersonalGapMiles(1050, 1060)).toBe(10);
  });
  it('returns 0 when next start equals prev end', () => {
    expect(calcPersonalGapMiles(1050, 1050)).toBe(0);
  });
  it('returns 0 for negative gap (bad data)', () => {
    expect(calcPersonalGapMiles(1060, 1050)).toBe(0);
  });
});

describe('calcMileageAllowance', () => {
  it('uses 45p rate for first 10000 miles', () => {
    expect(calcMileageAllowance(100)).toBeCloseTo(45);
  });
  it('uses split rate for miles over 10000', () => {
    // 10000 * 0.45 + 1000 * 0.25 = 4500 + 250 = 4750
    expect(calcMileageAllowance(11000)).toBeCloseTo(4750);
  });
  it('exact boundary: 10000 miles = £4500', () => {
    expect(calcMileageAllowance(10000)).toBeCloseTo(4500);
  });
  it('respects custom rates', () => {
    expect(calcMileageAllowance(100, 0.50, 0.25)).toBeCloseTo(50);
  });
});

describe('validateOdoSequence', () => {
  it('valid when end > start', () => {
    expect(validateOdoSequence(1000, 1050)).toEqual({ valid: true });
  });
  it('valid when end equals start', () => {
    expect(validateOdoSequence(1000, 1000)).toEqual({ valid: true });
  });
  it('invalid when end < start', () => {
    const result = validateOdoSequence(1050, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

- [x] 2.3 Run tests and confirm they pass:
```bash
npx vitest run shared/calculations/__tests__/mileage.test.ts
```
Expected: 8 tests pass, 0 fail.

- [ ] 2.4 Commit:
```bash
git add shared/calculations/
git commit -m "feat: add mileage calculation functions with tests"
```

---

### Task 3: Create shared/calculations/earnings.ts with tests

**Files to create:**
- `shared/calculations/earnings.ts`
- `shared/calculations/__tests__/earnings.test.ts`

- [ ] 3.1 Create `shared/calculations/earnings.ts`:

```typescript
import type { ShiftEarning } from '../types/shift';

/**
 * Hourly rate for a shift. Returns 0 if hours is 0 or missing.
 */
export function calcHourlyRate(totalEarnings: number, hoursWorked: number): number {
  if (!hoursWorked || hoursWorked <= 0) return 0;
  return totalEarnings / hoursWorked;
}

/**
 * Earnings per business mile. Returns 0 if miles is 0 or missing.
 */
export function calcEarningsPerMile(totalEarnings: number, businessMiles: number): number {
  if (!businessMiles || businessMiles <= 0) return 0;
  return totalEarnings / businessMiles;
}

/**
 * Platform breakdown with percentage share.
 */
export function calcPlatformShares(
  earnings: ShiftEarning[]
): Array<{ platform: string; amount: number; percent: number }> {
  const total = earnings.reduce((sum, e) => sum + e.amount, 0);
  if (total === 0) return earnings.map((e) => ({ platform: e.platform, amount: 0, percent: 0 }));
  return earnings.map((e) => ({
    platform: e.platform,
    amount: e.amount,
    percent: (e.amount / total) * 100,
  }));
}
```

- [ ] 3.2 Create `shared/calculations/__tests__/earnings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calcHourlyRate, calcEarningsPerMile, calcPlatformShares } from '../earnings';
import type { ShiftEarning } from '../../types/shift';

describe('calcHourlyRate', () => {
  it('divides earnings by hours', () => {
    expect(calcHourlyRate(120, 8)).toBeCloseTo(15);
  });
  it('returns 0 for 0 hours', () => {
    expect(calcHourlyRate(120, 0)).toBe(0);
  });
  it('returns 0 for negative hours', () => {
    expect(calcHourlyRate(120, -1)).toBe(0);
  });
});

describe('calcEarningsPerMile', () => {
  it('divides earnings by miles', () => {
    expect(calcEarningsPerMile(100, 50)).toBeCloseTo(2);
  });
  it('returns 0 for 0 miles', () => {
    expect(calcEarningsPerMile(100, 0)).toBe(0);
  });
});

describe('calcPlatformShares', () => {
  const earnings: ShiftEarning[] = [
    { id: '1', shiftId: 's1', platform: 'uber', amount: 60 },
    { id: '2', shiftId: 's1', platform: 'deliveroo', amount: 40 },
  ];
  it('computes correct percentages', () => {
    const result = calcPlatformShares(earnings);
    expect(result[0].percent).toBeCloseTo(60);
    expect(result[1].percent).toBeCloseTo(40);
  });
  it('amounts pass through unchanged', () => {
    const result = calcPlatformShares(earnings);
    expect(result[0].amount).toBe(60);
  });
  it('returns 0 percent for all when total is 0', () => {
    const zero: ShiftEarning[] = [
      { id: '1', shiftId: 's1', platform: 'uber', amount: 0 },
    ];
    expect(calcPlatformShares(zero)[0].percent).toBe(0);
  });
});
```

- [ ] 3.3 Run tests:
```bash
npx vitest run shared/calculations/__tests__/earnings.test.ts
```
Expected: 7 tests pass.

- [ ] 3.4 Commit:
```bash
git add shared/calculations/earnings.ts shared/calculations/__tests__/earnings.test.ts
git commit -m "feat: add earnings calculation functions with tests"
```

---

### Task 4: Create shared/calculations/expenses.ts with tests

**Files to create:**
- `shared/calculations/expenses.ts`
- `shared/calculations/__tests__/expenses.test.ts`

- [ ] 4.1 Create `shared/calculations/expenses.ts`:

```typescript
import type {
  Expense,
  ExpenseScope,
  VehicleExpenseType,
  TaxTreatment,
} from '../types/expense';

// Categories that are vehicle running costs (blocked under simplified mileage)
const RUNNING_COST_CATEGORIES = new Set([
  'Fuel',
  'Repairs & Maintenance',
  'Insurance',
  'Vehicle Tax',
  'MOT',
  'Cleaning',
]);

// Categories that are separately allowable even under simplified mileage
const SEPARATELY_ALLOWABLE_CATEGORIES = new Set(['Parking/Tolls']);

/**
 * Derive HMRC vehicle expense type from category string.
 */
export function getVehicleExpenseType(category: string): VehicleExpenseType {
  if (RUNNING_COST_CATEGORIES.has(category)) return 'running_cost';
  if (SEPARATELY_ALLOWABLE_CATEGORIES.has(category)) return 'separately_allowable';
  return 'non_vehicle';
}

/**
 * Derive HMRC tax treatment given vehicle type, scope, and claim method.
 */
export function getTaxTreatment(
  vehicleExpenseType: VehicleExpenseType,
  scope: ExpenseScope,
  claimMethod: 'SIMPLIFIED' | 'ACTUAL'
): TaxTreatment {
  if (scope === 'personal') return 'non_deductible';
  if (vehicleExpenseType === 'running_cost' && claimMethod === 'SIMPLIFIED') {
    return 'blocked_under_simplified';
  }
  if (scope === 'mixed') return 'partially_deductible';
  return 'deductible';
}

/**
 * Classify a new expense — returns vehicleExpenseType and taxTreatment.
 */
export function classifyExpense(
  category: string,
  scope: ExpenseScope,
  claimMethod: 'SIMPLIFIED' | 'ACTUAL'
): { vehicleExpenseType: VehicleExpenseType; taxTreatment: TaxTreatment } {
  const vehicleExpenseType = getVehicleExpenseType(category);
  const taxTreatment = getTaxTreatment(vehicleExpenseType, scope, claimMethod);
  return { vehicleExpenseType, taxTreatment };
}

/**
 * Compute deductible and non-deductible split for an expense.
 */
export function calcDeductibleAmount(
  amount: number,
  taxTreatment: TaxTreatment,
  businessUsePercent: number
): { deductibleAmount: number; nonDeductibleAmount: number } {
  if (taxTreatment === 'non_deductible' || taxTreatment === 'blocked_under_simplified') {
    return { deductibleAmount: 0, nonDeductibleAmount: amount };
  }
  if (taxTreatment === 'partially_deductible') {
    const deductible = (amount * businessUsePercent) / 100;
    return { deductibleAmount: deductible, nonDeductibleAmount: amount - deductible };
  }
  return { deductibleAmount: amount, nonDeductibleAmount: 0 };
}

/**
 * Sum total deductible amount across a list of expenses.
 */
export function sumDeductibleExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.deductibleAmount, 0);
}
```

- [ ] 4.2 Create `shared/calculations/__tests__/expenses.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getVehicleExpenseType,
  getTaxTreatment,
  classifyExpense,
  calcDeductibleAmount,
  sumDeductibleExpenses,
} from '../expenses';
import type { Expense } from '../../types/expense';

describe('getVehicleExpenseType', () => {
  it('classifies fuel as running_cost', () => {
    expect(getVehicleExpenseType('Fuel')).toBe('running_cost');
  });
  it('classifies parking as separately_allowable', () => {
    expect(getVehicleExpenseType('Parking/Tolls')).toBe('separately_allowable');
  });
  it('classifies phone as non_vehicle', () => {
    expect(getVehicleExpenseType('Phone')).toBe('non_vehicle');
  });
  it('classifies unknown category as non_vehicle', () => {
    expect(getVehicleExpenseType('Stationery')).toBe('non_vehicle');
  });
});

describe('getTaxTreatment', () => {
  it('personal scope is always non_deductible', () => {
    expect(getTaxTreatment('non_vehicle', 'personal', 'ACTUAL')).toBe('non_deductible');
    expect(getTaxTreatment('running_cost', 'personal', 'ACTUAL')).toBe('non_deductible');
  });
  it('running cost is blocked_under_simplified when using simplified', () => {
    expect(getTaxTreatment('running_cost', 'business', 'SIMPLIFIED')).toBe('blocked_under_simplified');
  });
  it('running cost is deductible when using actual', () => {
    expect(getTaxTreatment('running_cost', 'business', 'ACTUAL')).toBe('deductible');
  });
  it('separately_allowable is deductible even under simplified', () => {
    expect(getTaxTreatment('separately_allowable', 'business', 'SIMPLIFIED')).toBe('deductible');
  });
  it('mixed scope is partially_deductible', () => {
    expect(getTaxTreatment('non_vehicle', 'mixed', 'ACTUAL')).toBe('partially_deductible');
  });
});

describe('calcDeductibleAmount', () => {
  it('fully deductible expense returns full amount', () => {
    const result = calcDeductibleAmount(100, 'deductible', 100);
    expect(result).toEqual({ deductibleAmount: 100, nonDeductibleAmount: 0 });
  });
  it('blocked expense returns 0 deductible', () => {
    const result = calcDeductibleAmount(100, 'blocked_under_simplified', 100);
    expect(result).toEqual({ deductibleAmount: 0, nonDeductibleAmount: 100 });
  });
  it('non_deductible returns 0 deductible', () => {
    const result = calcDeductibleAmount(100, 'non_deductible', 100);
    expect(result).toEqual({ deductibleAmount: 0, nonDeductibleAmount: 100 });
  });
  it('partially_deductible uses businessUsePercent', () => {
    const result = calcDeductibleAmount(100, 'partially_deductible', 60);
    expect(result).toEqual({ deductibleAmount: 60, nonDeductibleAmount: 40 });
  });
});

describe('sumDeductibleExpenses', () => {
  it('sums deductibleAmount across all expenses', () => {
    const expenses = [
      { deductibleAmount: 50 },
      { deductibleAmount: 30 },
      { deductibleAmount: 20 },
    ] as Expense[];
    expect(sumDeductibleExpenses(expenses)).toBe(100);
  });
  it('returns 0 for empty array', () => {
    expect(sumDeductibleExpenses([])).toBe(0);
  });
});
```

- [ ] 4.3 Run tests:
```bash
npx vitest run shared/calculations/__tests__/expenses.test.ts
```
Expected: 13 tests pass.

- [ ] 4.4 Commit:
```bash
git add shared/calculations/expenses.ts shared/calculations/__tests__/expenses.test.ts
git commit -m "feat: add expense classification and deductible calculation functions with tests"
```

---

### Task 5: Create shared/calculations/tax.ts with tests

**Files to create:**
- `shared/calculations/tax.ts`
- `shared/calculations/__tests__/tax.test.ts`

- [ ] 5.1 Create `shared/calculations/tax.ts`:

```typescript
import type { Expense } from '../types/expense';
import { calcMileageAllowance } from './mileage';
import { sumDeductibleExpenses } from './expenses';

export interface TaxSettings {
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  rateFirst10k: number;
  rateAfter10k: number;
  taxSetAsidePercent: number;
  isScottishTaxpayer?: boolean;
  personalAllowance?: number;
}

/**
 * Simplified mileage deduction for tax year.
 */
export function calcSimplifiedDeduction(
  businessMiles: number,
  rateFirst10k = 0.45,
  rateAfter10k = 0.25
): number {
  return calcMileageAllowance(businessMiles, rateFirst10k, rateAfter10k);
}

/**
 * Actual expenses deduction — sum of all deductible expense amounts.
 */
export function calcActualDeduction(expenses: Expense[]): number {
  return sumDeductibleExpenses(expenses);
}

/**
 * Compare simplified vs actual methods.
 * Returns both values and which one is larger (i.e. recommended).
 */
export function compareTaxMethods(
  businessMiles: number,
  expenses: Expense[],
  settings: Pick<TaxSettings, 'rateFirst10k' | 'rateAfter10k'>
): { simplified: number; actual: number; recommended: 'simplified' | 'actual'; saving: number } {
  const simplified = calcSimplifiedDeduction(businessMiles, settings.rateFirst10k, settings.rateAfter10k);
  const actual = calcActualDeduction(expenses);
  const recommended = simplified >= actual ? 'simplified' : 'actual';
  const saving = Math.abs(simplified - actual);
  return { simplified, actual, recommended, saving };
}

/**
 * Taxable profit after deductions and personal allowance.
 * personalAllowance defaults to current UK standard (£12,570).
 */
export function calcTaxableProfit(
  totalEarnings: number,
  deduction: number,
  personalAllowance = 12570
): number {
  return Math.max(0, totalEarnings - deduction - personalAllowance);
}

/**
 * Tax buffer amount to set aside (running estimate, not final tax bill).
 */
export function calcTaxBuffer(totalEarnings: number, taxSetAsidePercent: number): number {
  return (totalEarnings * taxSetAsidePercent) / 100;
}

/**
 * "Kept" — single canonical formula used on every screen.
 * Kept = totalEarnings - deductibleExpenses - taxBuffer
 */
export function calcKept(
  totalEarnings: number,
  deductibleExpenses: number,
  taxBuffer: number
): number {
  return totalEarnings - deductibleExpenses - taxBuffer;
}
```

- [ ] 5.2 Create `shared/calculations/__tests__/tax.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  calcSimplifiedDeduction,
  calcActualDeduction,
  compareTaxMethods,
  calcTaxableProfit,
  calcTaxBuffer,
  calcKept,
} from '../tax';
import type { Expense } from '../../types/expense';

const makeExpense = (deductible: number): Expense =>
  ({
    id: '1',
    date: '2026-04-01',
    category: 'Phone',
    amount: deductible,
    description: '',
    scope: 'business',
    businessUsePercent: 100,
    deductibleAmount: deductible,
    nonDeductibleAmount: 0,
    vehicleExpenseType: 'non_vehicle',
    taxTreatment: 'deductible',
    sourceType: 'manual',
    reviewStatus: 'confirmed',
  } as Expense);

describe('calcSimplifiedDeduction', () => {
  it('returns 45p per mile for <=10000 miles', () => {
    expect(calcSimplifiedDeduction(100)).toBeCloseTo(45);
  });
  it('uses split rate above 10000', () => {
    expect(calcSimplifiedDeduction(11000)).toBeCloseTo(4750);
  });
});

describe('calcActualDeduction', () => {
  it('sums deductible amounts', () => {
    expect(calcActualDeduction([makeExpense(200), makeExpense(100)])).toBe(300);
  });
  it('returns 0 for empty array', () => {
    expect(calcActualDeduction([])).toBe(0);
  });
});

describe('compareTaxMethods', () => {
  it('recommends simplified when it is higher', () => {
    const result = compareTaxMethods(10000, [], { rateFirst10k: 0.45, rateAfter10k: 0.25 });
    expect(result.simplified).toBeCloseTo(4500);
    expect(result.actual).toBe(0);
    expect(result.recommended).toBe('simplified');
  });
  it('recommends actual when it is higher', () => {
    const expenses = [makeExpense(5000)];
    const result = compareTaxMethods(1000, expenses, { rateFirst10k: 0.45, rateAfter10k: 0.25 });
    expect(result.actual).toBe(5000);
    expect(result.recommended).toBe('actual');
  });
  it('saving is the absolute difference', () => {
    const result = compareTaxMethods(1000, [makeExpense(0)], { rateFirst10k: 0.45, rateAfter10k: 0.25 });
    expect(result.saving).toBeCloseTo(450);
  });
});

describe('calcTaxableProfit', () => {
  it('subtracts deduction and personal allowance', () => {
    expect(calcTaxableProfit(20000, 4500, 12570)).toBeCloseTo(2930);
  });
  it('never returns negative', () => {
    expect(calcTaxableProfit(5000, 4500, 12570)).toBe(0);
  });
});

describe('calcTaxBuffer', () => {
  it('returns correct percentage', () => {
    expect(calcTaxBuffer(10000, 20)).toBe(2000);
  });
});

describe('calcKept', () => {
  it('applies canonical formula', () => {
    // 1000 earnings - 200 expenses - 200 tax buffer = 600
    expect(calcKept(1000, 200, 200)).toBe(600);
  });
  it('can return negative if costs exceed earnings', () => {
    expect(calcKept(100, 200, 50)).toBe(-150);
  });
});
```

- [ ] 5.3 Run tests:
```bash
npx vitest run shared/calculations/__tests__/tax.test.ts
```
Expected: 12 tests pass.

- [ ] 5.4 Commit:
```bash
git add shared/calculations/tax.ts shared/calculations/__tests__/tax.test.ts
git commit -m "feat: add tax calculation functions including canonical calcKept formula"
```

---

### Task 6: Create shared/migrations/ utilities with tests

**Files to create:**
- `shared/migrations/migrateShift.ts`
- `shared/migrations/migrateExpense.ts`
- `shared/migrations/__tests__/migrateShift.test.ts`
- `shared/migrations/__tests__/migrateExpense.test.ts`

- [ ] 6.1 Create `shared/migrations/migrateShift.ts`:

```typescript
import type { Shift, ActiveShift, ShiftEarning } from '../types/shift';
import type { DailyWorkLog, ActiveWorkSession, Trip } from '../../types';

/**
 * Convert a legacy DailyWorkLog to the canonical Shift type.
 * Optionally merges in an associated Trip for odometer fields.
 * Safe to call on already-migrated data — if the record has a `status` field it is returned as-is.
 */
export function migrateDailyWorkLog(log: DailyWorkLog, linkedTrip?: Trip): Shift {
  // Already migrated
  if ('status' in log && 'earnings' in log) return log as unknown as Shift;

  const earnings: ShiftEarning[] = (log.providerSplits ?? []).map((ps, i) => ({
    id: `${log.id}-earning-${i}`,
    shiftId: log.id,
    platform: normalisePlatform(ps.provider),
    amount: ps.revenue,
    jobCount: ps.jobCount,
  }));

  return {
    id: log.id,
    date: log.date,
    status: 'completed',
    primaryPlatform: log.provider,
    hoursWorked: log.hoursWorked,
    totalEarnings: log.revenue,
    earnings,
    startedAt: log.startedAt,
    endedAt: log.endedAt,
    startOdometer: linkedTrip?.startOdometer,
    endOdometer: linkedTrip?.endOdometer,
    businessMiles: log.milesDriven ?? linkedTrip?.totalMiles,
    fuelLiters: log.fuelLiters,
    expensesTotal: log.expensesTotal,
    jobCount: log.jobCount,
    notes: log.notes,
  };
}

/**
 * Convert a legacy ActiveWorkSession to the canonical ActiveShift type.
 */
export function migrateActiveWorkSession(session: ActiveWorkSession): ActiveShift {
  if ('expenseDrafts' in session) return session as unknown as ActiveShift;

  const earnings: ShiftEarning[] = (session.providerSplits ?? []).map((ps, i) => ({
    id: `${session.id}-earning-${i}`,
    shiftId: session.id,
    platform: normalisePlatform(ps.provider),
    amount: ps.revenue,
  }));

  return {
    id: session.id,
    date: session.date,
    startedAt: session.startedAt,
    primaryPlatform: session.provider,
    startOdometer: session.startOdometer,
    totalEarnings: session.revenue,
    businessMiles: session.miles,
    earnings,
    expenseDrafts: (session.expenses ?? []).map((e) => ({
      id: e.id,
      category: e.category,
      amount: e.amount,
      liters: e.liters,
      description: e.description,
    })),
  };
}

function normalisePlatform(provider: string): import('../types/shift').Platform {
  const map: Record<string, import('../types/shift').Platform> = {
    uber: 'uber',
    'uber eats': 'uber',
    deliveroo: 'deliveroo',
    'just eat': 'just_eat',
    'amazon flex': 'amazon_flex',
    bolt: 'bolt',
  };
  return map[provider?.toLowerCase()] ?? 'other';
}
```

- [ ] 6.2 Create `shared/migrations/migrateExpense.ts`:

```typescript
import type { Expense } from '../types/expense';
import { classifyExpense, calcDeductibleAmount } from '../calculations/expenses';

interface LegacyExpense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  receiptId?: string;
  receiptUrl?: string;
  hasReceiptImage?: boolean;
  isVatClaimable?: boolean;
  liters?: number;
}

/**
 * Upgrade a legacy Expense to the enhanced Expense type.
 * Defaults to business scope with 100% business use.
 * Tax treatment is derived from category + claimMethod.
 */
export function migrateLegacyExpense(
  legacy: LegacyExpense,
  claimMethod: 'SIMPLIFIED' | 'ACTUAL'
): Expense {
  // Already migrated
  if ('scope' in legacy && 'taxTreatment' in legacy) return legacy as Expense;

  const { vehicleExpenseType, taxTreatment } = classifyExpense(legacy.category, 'business', claimMethod);
  const { deductibleAmount, nonDeductibleAmount } = calcDeductibleAmount(
    legacy.amount,
    taxTreatment,
    100
  );

  return {
    ...legacy,
    scope: 'business',
    businessUsePercent: 100,
    deductibleAmount,
    nonDeductibleAmount,
    vehicleExpenseType,
    taxTreatment,
    linkedShiftId: null,
    sourceType: 'manual',
    reviewStatus: 'confirmed',
  };
}

/**
 * Migrate an array of legacy expenses.
 */
export function migrateLegacyExpenses(
  expenses: LegacyExpense[],
  claimMethod: 'SIMPLIFIED' | 'ACTUAL'
): Expense[] {
  return expenses.map((e) => migrateLegacyExpense(e, claimMethod));
}
```

- [ ] 6.3 Create `shared/migrations/__tests__/migrateShift.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { migrateDailyWorkLog, migrateActiveWorkSession } from '../migrateShift';
import type { DailyWorkLog, ActiveWorkSession } from '../../../types';

const legacyLog: DailyWorkLog = {
  id: 'log-1',
  date: '2026-04-01',
  provider: 'Deliveroo',
  hoursWorked: 6,
  revenue: 90,
  milesDriven: 50,
  startedAt: '2026-04-01T10:00:00Z',
  endedAt: '2026-04-01T16:00:00Z',
  providerSplits: [
    { provider: 'Deliveroo', revenue: 60 },
    { provider: 'Uber Eats', revenue: 30 },
  ],
};

describe('migrateDailyWorkLog', () => {
  it('sets status to completed', () => {
    expect(migrateDailyWorkLog(legacyLog).status).toBe('completed');
  });
  it('maps revenue to totalEarnings', () => {
    expect(migrateDailyWorkLog(legacyLog).totalEarnings).toBe(90);
  });
  it('maps provider to primaryPlatform', () => {
    expect(migrateDailyWorkLog(legacyLog).primaryPlatform).toBe('Deliveroo');
  });
  it('converts providerSplits to earnings array', () => {
    const result = migrateDailyWorkLog(legacyLog);
    expect(result.earnings).toHaveLength(2);
    expect(result.earnings[0].platform).toBe('deliveroo');
    expect(result.earnings[0].amount).toBe(60);
  });
  it('merges linked trip odometer if provided', () => {
    const trip = { id: 't1', date: '2026-04-01', startOdometer: 1000, endOdometer: 1050, totalMiles: 50 } as any;
    const result = migrateDailyWorkLog(legacyLog, trip);
    expect(result.startOdometer).toBe(1000);
    expect(result.endOdometer).toBe(1050);
  });
  it('is idempotent — already migrated record returns as-is', () => {
    const migrated = migrateDailyWorkLog(legacyLog);
    const twice = migrateDailyWorkLog(migrated as any);
    expect(twice).toBe(migrated);
  });
});

describe('migrateActiveWorkSession', () => {
  const session: ActiveWorkSession = {
    id: 'sess-1',
    date: '2026-04-01',
    startedAt: '2026-04-01T10:00:00Z',
    provider: 'Uber',
    revenue: 45,
    expenses: [],
  };
  it('maps provider to primaryPlatform', () => {
    expect(migrateActiveWorkSession(session).primaryPlatform).toBe('Uber');
  });
  it('initialises expenseDrafts array', () => {
    expect(migrateActiveWorkSession(session).expenseDrafts).toEqual([]);
  });
});
```

- [ ] 6.4 Create `shared/migrations/__tests__/migrateExpense.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { migrateLegacyExpense, migrateLegacyExpenses } from '../migrateExpense';

const legacyFuel = {
  id: 'exp-1',
  date: '2026-04-01',
  category: 'Fuel',
  amount: 80,
  description: 'Fill up',
};

const legacyPhone = {
  id: 'exp-2',
  date: '2026-04-01',
  category: 'Phone',
  amount: 30,
  description: 'Data plan',
};

describe('migrateLegacyExpense — SIMPLIFIED method', () => {
  it('sets scope to business', () => {
    expect(migrateLegacyExpense(legacyFuel, 'SIMPLIFIED').scope).toBe('business');
  });
  it('blocks fuel deduction under simplified', () => {
    const result = migrateLegacyExpense(legacyFuel, 'SIMPLIFIED');
    expect(result.taxTreatment).toBe('blocked_under_simplified');
    expect(result.deductibleAmount).toBe(0);
    expect(result.nonDeductibleAmount).toBe(80);
  });
  it('allows phone deduction under simplified', () => {
    const result = migrateLegacyExpense(legacyPhone, 'SIMPLIFIED');
    expect(result.taxTreatment).toBe('deductible');
    expect(result.deductibleAmount).toBe(30);
  });
  it('sets sourceType to manual', () => {
    expect(migrateLegacyExpense(legacyFuel, 'SIMPLIFIED').sourceType).toBe('manual');
  });
  it('sets reviewStatus to confirmed', () => {
    expect(migrateLegacyExpense(legacyFuel, 'SIMPLIFIED').reviewStatus).toBe('confirmed');
  });
  it('is idempotent', () => {
    const first = migrateLegacyExpense(legacyFuel, 'SIMPLIFIED');
    const second = migrateLegacyExpense(first as any, 'SIMPLIFIED');
    expect(second).toBe(first);
  });
});

describe('migrateLegacyExpense — ACTUAL method', () => {
  it('allows fuel deduction under actual', () => {
    const result = migrateLegacyExpense(legacyFuel, 'ACTUAL');
    expect(result.taxTreatment).toBe('deductible');
    expect(result.deductibleAmount).toBe(80);
  });
});

describe('migrateLegacyExpenses', () => {
  it('migrates all expenses in array', () => {
    const result = migrateLegacyExpenses([legacyFuel, legacyPhone], 'SIMPLIFIED');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('exp-1');
    expect(result[1].id).toBe('exp-2');
  });
});
```

- [ ] 6.5 Run all migration tests:
```bash
npx vitest run shared/migrations/__tests__/
```
Expected: all tests pass.

- [ ] 6.6 Commit:
```bash
git add shared/migrations/
git commit -m "feat: add migration utilities for DailyWorkLog and legacy Expense with tests"
```

---

## Phase 2: Persistence Layer Migration

### Task 7: Update usePersistence to run migrations on load

**Files to modify:**
- `hooks/usePersistence.ts`

Read `hooks/usePersistence.ts` fully before editing. The goal is to add a one-time migration pass that runs `migrateDailyWorkLog` and `migrateLegacyExpenses` on loaded data, then writes back the migrated data so the migration only runs once.

- [ ] 7.1 Read `hooks/usePersistence.ts` to understand the current load/save flow.

- [ ] 7.2 At the top of the file, add imports:
```typescript
import { migrateDailyWorkLog } from '../shared/migrations/migrateShift';
import { migrateLegacyExpenses } from '../shared/migrations/migrateExpense';
```

- [ ] 7.3 Find the point in `usePersistence` where work logs and expenses are loaded from storage. After loading, add a migration pass:

The migration logic to add (adapt to the actual variable names found in the file):
```typescript
// One-time migration: convert legacy types to canonical types
// The migration functions are idempotent — safe to call on already-migrated data
const migratedWorkLogs = loadedWorkLogs.map((log: any) =>
  migrateDailyWorkLog(log)
);
const migratedExpenses = migrateLegacyExpenses(
  loadedExpenses,
  loadedSettings?.claimMethod ?? 'SIMPLIFIED'
);
```

- [ ] 7.4 Ensure the migrated arrays are written back to storage so migration only runs once. Use the existing save mechanism — write `migratedWorkLogs` back under the same storage key.

- [ ] 7.5 Run the full test suite to confirm nothing regresses:
```bash
npx vitest run
```
Expected: all existing tests still pass.

- [ ] 7.6 Run Playwright end-to-end tests:
```bash
npx playwright test
```
Expected: all tests pass.

- [ ] 7.7 Commit:
```bash
git add hooks/usePersistence.ts
git commit -m "feat: run entity migration on data load in usePersistence"
```

---

## Phase 3: Component Updates

### Task 8: Update TaxLogic.tsx to use Calculations_Layer

**Files to modify:** `components/TaxLogic.tsx`

Read the file first. Replace any inline tax calculations with calls to functions from `shared/calculations/tax.ts`. The `calcKept` formula is the most critical — find every place "Kept" is computed and replace it.

- [ ] 8.1 Read `components/TaxLogic.tsx` in full.

- [ ] 8.2 Add imports at the top:
```typescript
import { calcSimplifiedDeduction, calcActualDeduction, compareTaxMethods, calcTaxableProfit, calcTaxBuffer, calcKept } from '../shared/calculations/tax';
```

- [ ] 8.3 Replace each inline calculation with the corresponding imported function. Do not change any JSX structure or displayed text — only replace the computation.

- [ ] 8.4 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```

- [ ] 8.5 Run vitest:
```bash
npx vitest run
```

- [ ] 8.6 Commit:
```bash
git add components/TaxLogic.tsx
git commit -m "refactor: replace inline tax calculations in TaxLogic with shared/calculations/tax"
```

---

### Task 9: Update TaxEstimateCard.tsx to use calcKept

**Files to modify:** `components/dashboard/TaxEstimateCard.tsx`

- [ ] 9.1 Read `components/dashboard/TaxEstimateCard.tsx` in full.

- [ ] 9.2 Import and use `calcKept`, `calcTaxBuffer` from `shared/calculations/tax`:
```typescript
import { calcKept, calcTaxBuffer } from '../../shared/calculations/tax';
```

- [ ] 9.3 Replace any inline "Kept" or tax buffer calculation with the imported functions. Do not change JSX structure.

- [ ] 9.4 Compile and test:
```bash
npx tsc --noEmit && npx vitest run
```

- [ ] 9.5 Commit:
```bash
git add components/dashboard/TaxEstimateCard.tsx
git commit -m "refactor: use calcKept and calcTaxBuffer from shared/calculations in TaxEstimateCard"
```

---

### Task 10: Update WeeklySummary.tsx to use calcKept

**Files to modify:** `components/dashboard/WeeklySummary.tsx`

- [ ] 10.1 Read `components/dashboard/WeeklySummary.tsx` in full.

- [ ] 10.2 Import and use `calcKept` from `shared/calculations/tax`:
```typescript
import { calcKept } from '../../shared/calculations/tax';
```

- [ ] 10.3 Replace any inline "Kept" calculation with `calcKept`. If the formula differs from `totalEarnings - deductibleExpenses - taxBuffer`, document the discrepancy as a comment and bring it in line with the canonical formula.

- [ ] 10.4 Compile and test:
```bash
npx tsc --noEmit && npx vitest run
```

- [ ] 10.5 Commit:
```bash
git add components/dashboard/WeeklySummary.tsx
git commit -m "refactor: standardise calcKept in WeeklySummary"
```

---

### Task 11: Update EarningsSummary.tsx to use calcPlatformShares

**Files to modify:** `components/dashboard/EarningsSummary.tsx`

- [ ] 11.1 Read `components/dashboard/EarningsSummary.tsx` in full.

- [ ] 11.2 Import and use `calcPlatformShares` from `shared/calculations/earnings`:
```typescript
import { calcPlatformShares } from '../../shared/calculations/earnings';
```

- [ ] 11.3 Replace any inline platform percentage calculation with `calcPlatformShares`.

- [ ] 11.4 Compile and test:
```bash
npx tsc --noEmit && npx vitest run
```

- [ ] 11.5 Commit:
```bash
git add components/dashboard/EarningsSummary.tsx
git commit -m "refactor: use calcPlatformShares in EarningsSummary"
```

---

### Task 12: Update ExpenseLog.tsx to use enhanced Expense type

**Files to modify:** `components/ExpenseLog.tsx`

- [ ] 12.1 Read `components/ExpenseLog.tsx` in full.

- [ ] 12.2 Import `classifyExpense` and `calcDeductibleAmount` from `shared/calculations/expenses`:
```typescript
import { classifyExpense, calcDeductibleAmount } from '../shared/calculations/expenses';
import type { Expense } from '../shared/types/expense';
```

- [ ] 12.3 When creating a new expense, derive and set all HMRC fields using `classifyExpense` and `calcDeductibleAmount`. The `claimMethod` value comes from the app settings (already available in the component's context).

- [ ] 12.4 Where expenses are displayed, use `deductibleAmount` (already on the record) rather than recomputing.

- [ ] 12.5 Compile and test:
```bash
npx tsc --noEmit && npx vitest run
```

- [ ] 12.6 Commit:
```bash
git add components/ExpenseLog.tsx
git commit -m "feat: add HMRC expense classification on create in ExpenseLog"
```

---

## Phase 4: Sync and Worker

### Task 13: Update syncTransforms.ts for new Shift payload

**Files to modify:**
- `services/syncTransforms.ts`
- `services/syncTransforms.test.ts`

- [ ] 13.1 Read `services/syncTransforms.ts` and `services/syncTransforms.test.ts` in full.

- [ ] 13.2 Add serialisation/deserialisation for `Shift` records. The sync payload format for shifts:
```typescript
// Push payload (client → Worker)
type ShiftPushItem = {
  id: string;
  date: string;
  status: string;
  primary_platform?: string;
  hours_worked?: number;
  total_earnings: number;
  started_at?: string;
  ended_at?: string;
  start_odometer?: number;
  end_odometer?: number;
  business_miles?: number;
  fuel_liters?: number;
  job_count?: number;
  notes?: string;
};
```

- [ ] 13.3 Keep existing `work_logs` and `mileage_logs` pull handling intact — these are needed during the transition period to hydrate data for users who haven't pushed new shifts yet.

- [ ] 13.4 Update tests in `syncTransforms.test.ts` to cover new Shift serialisation round-trip.

- [ ] 13.5 Run tests:
```bash
npx vitest run services/syncTransforms.test.ts
```
Expected: all tests pass.

- [ ] 13.6 Commit:
```bash
git add services/syncTransforms.ts services/syncTransforms.test.ts
git commit -m "feat: add Shift payload serialisation to syncTransforms"
```

---

### Task 14: Add Worker D1 migration for new schema

**Files to create:**
- `workers/sync-api/migrations/0004_entity_model_refactor.sql`

**Files to modify:**
- `workers/sync-api/src/routes/sync.ts`

- [ ] 14.1 Create `workers/sync-api/migrations/0004_entity_model_refactor.sql`:

```sql
-- Task 14: Entity model refactor schema
-- Adds shifts and shift_earnings tables.
-- Adds HMRC classification columns to expenses.
-- Does NOT drop work_logs or mileage_logs (kept for rollback).

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  primary_platform TEXT,
  hours_worked REAL,
  total_earnings REAL NOT NULL DEFAULT 0,
  started_at TEXT,
  ended_at TEXT,
  start_odometer REAL,
  end_odometer REAL,
  business_miles REAL,
  personal_gap_miles REAL,
  gps_miles REAL,
  mileage_source TEXT,
  start_lat REAL,
  start_lng REAL,
  end_lat REAL,
  end_lng REAL,
  fuel_liters REAL,
  job_count INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shift_earnings (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  amount REAL NOT NULL,
  job_count INTEGER,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'business';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_use_percent REAL NOT NULL DEFAULT 100;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS deductible_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS non_deductible_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vehicle_expense_type TEXT NOT NULL DEFAULT 'non_vehicle';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tax_treatment TEXT NOT NULL DEFAULT 'deductible';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS linked_shift_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'confirmed';
```

- [ ] 14.2 Apply migration to production D1:
```bash
cd workers/sync-api
npx wrangler d1 migrations apply drivertax-sync --remote
```
Expected: migration applied successfully.

- [ ] 14.3 Read `workers/sync-api/src/routes/sync.ts` in full.

- [ ] 14.4 Add handling in the push route for `shifts` and `shift_earnings` arrays in the push payload. Insert/upsert records into the new tables. Keep existing `work_logs`/`mileage_logs`/`expenses` handling intact.

- [ ] 14.5 Add handling in the pull route to return `shifts` and `shift_earnings` from the new tables. Keep returning `work_logs`/`mileage_logs` for backward compat.

- [ ] 14.6 Deploy updated Worker:
```bash
cd workers/sync-api
npx wrangler deploy
```
Expected: deploy succeeds.

- [ ] 14.7 Commit:
```bash
git add workers/sync-api/migrations/0004_entity_model_refactor.sql workers/sync-api/src/routes/sync.ts
git commit -m "feat: add shifts/shift_earnings D1 tables and HMRC expense columns, update sync routes"
```

---

## Phase 5: Final Verification

### Task 15: Full regression check and build

- [ ] 15.1 Run full unit test suite:
```bash
npx vitest run
```
Expected: all tests pass, 0 failures.

- [ ] 15.2 Run TypeScript compile check:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] 15.3 Run Playwright end-to-end tests:
```bash
npx playwright test
```
Expected: all tests pass.

- [ ] 15.4 Run production build:
```bash
npm run build
```
Expected: build succeeds, no errors.

- [ ] 15.5 Deploy to Cloudflare Pages:
```bash
npx wrangler pages deploy dist --project-name drivertax --commit-dirty=true
```

- [ ] 15.6 Smoke test the live app at `https://drivertax.rudradigital.uk`:
  - Open app — should load without errors
  - Start a shift — should work
  - Add an expense — should classify correctly
  - End shift — should save and show summary
  - Check Sentry for any new errors

- [ ] 15.7 Final commit:
```bash
git commit -m "chore: entity model refactor complete — Shift type, enhanced Expense, shared/calculations"
```
