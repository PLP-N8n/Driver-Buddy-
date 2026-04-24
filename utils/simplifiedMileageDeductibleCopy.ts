import { isVehicleRunningCostCategory } from '../shared/calculations/expenses';
import type { ExpenseScope, TaxTreatment } from '../shared/types/expense';

type SimplifiedMileageCopySettings = {
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  mileageTrackingEnabled: boolean;
};

export type DeductibleSummaryExpense = {
  category: string;
  deductibleAmount: number;
  scope?: ExpenseScope;
  taxTreatment?: TaxTreatment;
};

const ZERO_CURRENCY_TOLERANCE = 0.005;
const GENERIC_SIMPLIFIED_MILEAGE_COPY =
  'These vehicle costs are covered by your mileage rate - no separate deduction needed';

const SIMPLIFIED_MILEAGE_COPY_BY_CATEGORY: Record<string, string> = {
  Fuel: 'Fuel is covered by your mileage rate - no separate deduction needed',
  'Public Charging': 'Charging is covered by your mileage rate - no separate deduction needed',
  'Home Charging': 'Charging is covered by your mileage rate - no separate deduction needed',
  'Repairs & Maintenance': 'Repairs are covered by your mileage rate - no separate deduction needed',
  Insurance: 'Insurance is covered by your mileage rate - no separate deduction needed',
  'Vehicle Tax': 'Vehicle tax is covered by your mileage rate - no separate deduction needed',
  MOT: 'MOT is covered by your mileage rate - no separate deduction needed',
  Cleaning: 'Cleaning is covered by your mileage rate - no separate deduction needed',
};

const isZeroCurrency = (amount: number) => Math.abs(amount) < ZERO_CURRENCY_TOLERANCE;

const isSimplifiedMileageMode = (settings: SimplifiedMileageCopySettings) =>
  settings.claimMethod === 'SIMPLIFIED' || settings.mileageTrackingEnabled;

export function isCoveredBySimplifiedMileage(
  expense: DeductibleSummaryExpense,
  settings: SimplifiedMileageCopySettings
): boolean {
  if (!isSimplifiedMileageMode(settings)) return false;
  if (!isZeroCurrency(expense.deductibleAmount)) return false;
  if (!isVehicleRunningCostCategory(expense.category)) return false;
  if (expense.scope === 'personal') return false;

  if (expense.taxTreatment) {
    return expense.taxTreatment === 'blocked_under_simplified';
  }

  return true;
}

export function getSimplifiedMileageDeductibleExplanation(
  expenses: DeductibleSummaryExpense[],
  settings: SimplifiedMileageCopySettings
): string | null {
  const totalDeductible = expenses.reduce((sum, expense) => sum + expense.deductibleAmount, 0);
  if (!isZeroCurrency(totalDeductible)) return null;

  const coveredExpenses = expenses.filter((expense) => isCoveredBySimplifiedMileage(expense, settings));
  if (coveredExpenses.length === 0) return null;

  const categoryMessages = new Set(
    coveredExpenses.map((expense) => SIMPLIFIED_MILEAGE_COPY_BY_CATEGORY[expense.category] ?? GENERIC_SIMPLIFIED_MILEAGE_COPY)
  );

  return categoryMessages.size === 1
    ? [...categoryMessages][0] ?? GENERIC_SIMPLIFIED_MILEAGE_COPY
    : GENERIC_SIMPLIFIED_MILEAGE_COPY;
}
