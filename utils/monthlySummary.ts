import type { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { calcMileageAllowance } from '../shared/calculations/mileage';
import { calcKept, calcTaxBuffer } from '../shared/calculations/tax';
import { UK_TZ, ukTaxYearEnd, ukTaxYearStart } from './ukDate';

export interface MonthSummary {
  yearMonth: string;
  label: string;
  earnings: number;
  expenses: number;
  mileageClaimValue: number;
  estimatedTax: number;
  kept: number;
  shiftCount: number;
}

type MonthBucket = {
  yearMonth: string;
  earnings: number;
  expenses: number;
  businessMiles: number;
  shiftCount: number;
};

const isInRange = (date: string, start: string, end: string) => date >= start && date <= end;

const getYearMonth = (date: string) => date.slice(0, 7);

const getMonthLabel = (yearMonth: string) =>
  new Date(`${yearMonth}-01T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: UK_TZ,
    month: 'long',
    year: 'numeric',
  });

const getOrCreateBucket = (buckets: Map<string, MonthBucket>, yearMonth: string): MonthBucket => {
  const existing = buckets.get(yearMonth);
  if (existing) return existing;

  const bucket = {
    yearMonth,
    earnings: 0,
    expenses: 0,
    businessMiles: 0,
    shiftCount: 0,
  };
  buckets.set(yearMonth, bucket);
  return bucket;
};

export function buildMonthlySummaries(
  logs: DailyWorkLog[],
  trips: Trip[],
  expenses: Expense[],
  settings: Settings,
  taxYear: number
): MonthSummary[] {
  const taxYearStart = ukTaxYearStart(taxYear);
  const taxYearEnd = ukTaxYearEnd(taxYear);
  const buckets = new Map<string, MonthBucket>();

  for (const log of logs) {
    if (!isInRange(log.date, taxYearStart, taxYearEnd)) continue;

    const bucket = getOrCreateBucket(buckets, getYearMonth(log.date));
    bucket.earnings += Number.isFinite(log.revenue) ? log.revenue : 0;
    bucket.shiftCount += 1;
  }

  for (const expense of expenses) {
    if (!isInRange(expense.date, taxYearStart, taxYearEnd)) continue;

    const bucket = buckets.get(getYearMonth(expense.date));
    if (!bucket) continue;

    bucket.expenses += Number.isFinite(expense.amount) ? expense.amount : 0;
  }

  for (const trip of trips) {
    if (trip.purpose !== 'Business' || !isInRange(trip.date, taxYearStart, taxYearEnd)) continue;

    const bucket = buckets.get(getYearMonth(trip.date));
    if (!bucket) continue;

    bucket.businessMiles += Number.isFinite(trip.totalMiles) ? trip.totalMiles : 0;
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.shiftCount > 0)
    .sort((left, right) => left.yearMonth.localeCompare(right.yearMonth))
    .map((bucket) => {
      const mileageClaimValue = calcMileageAllowance(
        bucket.businessMiles,
        settings.businessRateFirst10k,
        settings.businessRateAfter10k
      );
      const estimatedTax = calcTaxBuffer(bucket.earnings, settings.taxSetAsidePercent);

      return {
        yearMonth: bucket.yearMonth,
        label: getMonthLabel(bucket.yearMonth),
        earnings: bucket.earnings,
        expenses: bucket.expenses,
        mileageClaimValue,
        estimatedTax,
        kept: calcKept(bucket.earnings, bucket.expenses, estimatedTax),
        shiftCount: bucket.shiftCount,
      };
    });
}
