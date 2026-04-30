import type { DailyWorkLog, Expense, Settings, Trip } from '../types';

export type HealthStatus = 'good' | 'attention' | 'warning';

export interface HealthCheck {
  status: HealthStatus;
  taxSignal: HealthStatus;
  expenseSignal: HealthStatus;
  mileageSignal: HealthStatus;
  summary: string;
  details: string[];
}

const statusRank: Record<HealthStatus, number> = {
  good: 0,
  attention: 1,
  warning: 2,
};

const getDateDaysAgo = (today: string, daysAgo: number) => {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

const isInDateWindow = (date: string, start: string, end: string) => date >= start && date <= end;

const getWorstStatus = (...statuses: HealthStatus[]): HealthStatus =>
  statuses.reduce((worst, current) => (statusRank[current] > statusRank[worst] ? current : worst), 'good');

const getTaxSignal = (
  logs: DailyWorkLog[],
  expenses: Expense[],
  settings: Settings,
  today: string
): HealthStatus => {
  const start = getDateDaysAgo(today, 14);
  const recentEarnings = logs
    .filter((log) => isInDateWindow(log.date, start, today))
    .reduce((sum, log) => sum + (Number.isFinite(log.revenue) ? log.revenue : 0), 0);

  if (recentEarnings <= 0) {
    return 'good';
  }

  const actualSetAsideEstimate = recentEarnings * (settings.taxSetAsidePercent / 100);
  const hasRecentExpense = expenses.some((expense) => isInDateWindow(expense.date, start, today));
  return hasRecentExpense || actualSetAsideEstimate > 0 ? 'good' : 'attention';
};

const getExpenseSignal = (
  shifts: DailyWorkLog[],
  expenses: Expense[],
  today: string
): HealthStatus => {
  if (shifts.length === 0) {
    return 'good';
  }

  const start = getDateDaysAgo(today, 7);
  return expenses.some((expense) => isInDateWindow(expense.date, start, today)) ? 'good' : 'attention';
};

const getMileageSignal = (shifts: DailyWorkLog[]): HealthStatus => {
  if (shifts.length === 0) {
    return 'good';
  }

  const linkedShiftCount = shifts.filter((shift) => Boolean(shift.linkedTripId)).length;
  const missingShiftCount = shifts.length - linkedShiftCount;

  if (missingShiftCount === 0) {
    return 'good';
  }

  return missingShiftCount > shifts.length / 2 ? 'warning' : 'attention';
};

const getSummary = (status: HealthStatus) => {
  switch (status) {
    case 'warning':
      return 'A few things need attention.';
    case 'attention':
      return 'A couple of things to check.';
    case 'good':
    default:
      return 'You are on track this week.';
  }
};

export function buildHealthCheck(
  logs: DailyWorkLog[],
  trips: Trip[],
  expenses: Expense[],
  settings: Settings,
  today: string
): HealthCheck {
  // Product rule treats a set linkedTripId as the mileage coverage signal.
  void trips;

  const sevenDaysAgo = getDateDaysAgo(today, 7);
  const recentShifts = logs.filter((log) => isInDateWindow(log.date, sevenDaysAgo, today));
  const taxSignal = getTaxSignal(logs, expenses, settings, today);
  const expenseSignal = getExpenseSignal(recentShifts, expenses, today);
  const mileageSignal = getMileageSignal(recentShifts);
  const status = getWorstStatus(taxSignal, expenseSignal, mileageSignal);
  const details = [
    expenseSignal !== 'good' ? 'No expenses logged this week -- did you have fuel or parking costs?' : null,
    mileageSignal !== 'good' ? 'Some shifts are missing mileage -- tap a shift to add it.' : null,
    taxSignal !== 'good' ? `Make sure you are setting aside ${settings.taxSetAsidePercent}% of earnings for tax.` : null,
  ].filter((detail): detail is string => Boolean(detail)).slice(0, 3);

  return {
    status,
    taxSignal,
    expenseSignal,
    mileageSignal,
    summary: getSummary(status),
    details,
  };
}
