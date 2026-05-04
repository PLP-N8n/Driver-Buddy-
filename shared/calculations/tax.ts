import type { Expense, TaxTreatment } from '../types/expense';
import { calcMileageAllowance } from './mileage';
import {
  calcExpenseTaxBasisAmount,
  getTaxDeductibleAmount,
  isTaxAllowableExpenseCategory,
  isVehicleRunningCostCategory,
} from './expenses';

export interface TaxSettings {
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  rateFirst10k: number;
  rateAfter10k: number;
  taxSetAsidePercent: number;
  isScottishTaxpayer?: boolean;
  personalAllowance?: number;
}

type TaxAnalysisExpense = Pick<Expense, 'category' | 'amount' | 'isVatClaimable'> & {
  businessUsePercent?: number;
  deductibleAmount?: number;
  taxTreatment?: TaxTreatment;
};

export interface VehicleTaxDeductions {
  otherBusinessExpenses: number;
  vehicleRunningCosts: number;
  simplifiedDeduction: number;
  actualDeduction: number;
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
 * Actual expenses deduction - sum of all deductible expense amounts.
 */
export function calcActualDeduction(expenses: Expense[]): number {
  return expenses.reduce((sum, expense) => sum + getTaxDeductibleAmount(expense), 0);
}

export function calcExpenseAmountNetOfVat(expense: TaxAnalysisExpense): number {
  return calcExpenseTaxBasisAmount(expense.amount, expense.isVatClaimable);
}

export function calcVehicleTaxDeductions({
  expenses,
  totalMileageAllowance,
  businessUsePercent,
  manualAllowances = 0,
}: {
  expenses: TaxAnalysisExpense[];
  totalMileageAllowance: number;
  businessUsePercent: number;
  manualAllowances?: number;
}): VehicleTaxDeductions {
  const otherBusinessExpenses = expenses
    .filter((expense) => !isVehicleRunningCostCategory(expense.category))
    .reduce((sum, expense) => {
      if (expense.taxTreatment !== undefined) {
        if (expense.taxTreatment === 'non_deductible' || expense.taxTreatment === 'blocked_under_simplified') return sum;
        return sum + getTaxDeductibleAmount(expense);
      }
      // Legacy: no stored classification — fall back to category filter
      if (!isTaxAllowableExpenseCategory(expense.category)) return sum;
      return sum + calcExpenseAmountNetOfVat(expense);
    }, 0);

  const vehicleRunningCosts = expenses
    .filter((expense) => isVehicleRunningCostCategory(expense.category))
    .reduce((sum, expense) => {
      // Exclude expenses explicitly marked non-deductible (e.g. personal-scope fuel)
      if (expense.taxTreatment === 'non_deductible') return sum;
      return sum + calcExpenseAmountNetOfVat(expense);
    }, 0);

  return {
    otherBusinessExpenses,
    vehicleRunningCosts,
    simplifiedDeduction: totalMileageAllowance + otherBusinessExpenses + manualAllowances,
    actualDeduction: vehicleRunningCosts * businessUsePercent + otherBusinessExpenses + manualAllowances,
  };
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
 * personalAllowance defaults to current UK standard (Â£12,570).
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
  const percent = Math.max(0, Math.min(100, taxSetAsidePercent));
  return (totalEarnings * percent) / 100;
}

/**
 * "Kept" - single canonical formula used on every screen.
 * Kept = totalEarnings - deductibleExpenses - taxBuffer
 */
export function calcKept(
  totalEarnings: number,
  deductibleExpenses: number,
  taxBuffer: number
): number {
  return totalEarnings - deductibleExpenses - taxBuffer;
}
