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
 * Classify a new expense - returns vehicleExpenseType and taxTreatment.
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
