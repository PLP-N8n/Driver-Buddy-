import type { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { toUKDateString } from './ukDate';
import { getMileageCoverage, type MileageCoverage } from './mileageLinkage';

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
  return toUKDateString(date);
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

  const savedByRule = recentEarnings * (settings.taxSetAsidePercent / 100);
  const hasRecentExpense = expenses.some((expense) => isInDateWindow(expense.date, start, today));
  return hasRecentExpense || savedByRule > 0 ? 'good' : 'attention';
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

const getMileageCoverageCounts = (shifts: DailyWorkLog[], trips: Trip[]) =>
  shifts.reduce(
    (counts, shift) => {
      const coverage = getMileageCoverage(shift, trips);
      counts[coverage] += 1;
      return counts;
    },
    { linked: 0, unlinked: 0, missing: 0 } satisfies Record<MileageCoverage, number>
  );

const getMileageSignal = (shifts: DailyWorkLog[], trips: Trip[]): HealthStatus => {
  if (shifts.length === 0) {
    return 'good';
  }

  const { missing: missingShiftCount } = getMileageCoverageCounts(shifts, trips);

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
  const sevenDaysAgo = getDateDaysAgo(today, 7);
  const recentShifts = logs.filter((log) => isInDateWindow(log.date, sevenDaysAgo, today));
  const taxSignal = getTaxSignal(logs, expenses, settings, today);
  const expenseSignal = getExpenseSignal(recentShifts, expenses, today);
  const mileageSignal = getMileageSignal(recentShifts, trips);
  const mileageCoverageCounts = getMileageCoverageCounts(recentShifts, trips);
  const status = getWorstStatus(taxSignal, expenseSignal, mileageSignal);
  const details = [
    expenseSignal !== 'good' ? 'No expenses logged this week -- did you have fuel or parking costs?' : null,
    mileageSignal !== 'good' ? 'Some shifts are missing mileage -- tap a shift to add it.' : null,
    mileageCoverageCounts.unlinked > 0
      ? 'Mileage is logged on the same date for a shift -- confirm the shift link when you can.'
      : null,
    taxSignal !== 'good' ? `Check your ${settings.taxSetAsidePercent}% set-aside rule against the Tax tab estimate.` : null,
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
