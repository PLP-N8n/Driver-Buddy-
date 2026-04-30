import type { Expense } from '../types/expense';
import { calculateExpenseTaxClassification } from '../calculations/expenses';

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

  const taxClassification = calculateExpenseTaxClassification({
    amount: legacy.amount,
    category: legacy.category,
    claimMethod,
    isVatClaimable: legacy.isVatClaimable,
    scope: 'business',
  });

  return {
    ...legacy,
    ...taxClassification,
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
