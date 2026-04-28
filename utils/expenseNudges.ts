import { CompletedShiftSummary, Expense, ExpenseCategory } from '../types';

export type ShiftNudge = 'fuel' | 'parking';

const FUEL_CATEGORIES = new Set<ExpenseCategory>([
  ExpenseCategory.FUEL,
  ExpenseCategory.PUBLIC_CHARGING,
  ExpenseCategory.HOME_CHARGING,
]);

export function getNudgesForShift(
  summary: CompletedShiftSummary,
  expenses: Expense[]
): ShiftNudge[] {
  const shiftId = summary.shiftId ?? summary.id;
  const shiftExpenses = expenses.filter(
    (e) => e.date === summary.date || (e as { linkedShiftId?: string }).linkedShiftId === shiftId
  );

  const nudges: ShiftNudge[] = [];

  if (summary.miles > 20) {
    const hasFuel = shiftExpenses.some((e) => FUEL_CATEGORIES.has(e.category));
    if (!hasFuel) nudges.push('fuel');
  }

  if (summary.miles > 0) {
    const hasParking = shiftExpenses.some((e) => e.category === ExpenseCategory.PARKING);
    if (!hasParking) nudges.push('parking');
  }

  return nudges;
}
