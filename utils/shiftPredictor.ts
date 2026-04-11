import { DailyWorkLog } from '../types';
import { daysBetween, todayUK, toUKDateString } from './ukDate';

export interface ShiftPrediction {
  provider: string;
  estimatedHours: number;
  estimatedRevenueMin: number;
  estimatedRevenueMax: number;
  estimatedRevenueAvg: number;
  fuelLikely: boolean;
  startOdometer: number | null;
  confidence: 'high' | 'medium' | 'low';
}

interface PredictNextShiftOptions {
  referenceDate?: Date | string;
  lastEndOdometer?: number | null;
}

const DEFAULT_PROVIDER = 'Work Day';

const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);

const toDate = (value?: Date | string) => {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (typeof value === 'string') {
    return parseDate(value);
  }

  return new Date(`${todayUK()}T12:00:00Z`);
};

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values: number[]) => {
  if (values.length < 2) return 0;

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
};

const getLastLogs = (logs: DailyWorkLog[], limit: number, cutoffDate: string) =>
  [...logs]
    .filter((log) => log.date < cutoffDate)
    .sort((left, right) => {
      const dateCompare = right.date.localeCompare(left.date);
      if (dateCompare !== 0) return dateCompare;
      return (right.endedAt ?? '').localeCompare(left.endedAt ?? '');
    })
    .slice(0, limit);

const getModeProvider = (logs: DailyWorkLog[]) => {
  if (logs.length === 0) return DEFAULT_PROVIDER;

  const counts = new Map<string, number>();

  for (const log of logs) {
    const provider = log.provider?.trim() || DEFAULT_PROVIDER;
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }

  let bestProvider = logs[0]?.provider?.trim() || DEFAULT_PROVIDER;
  let bestCount = counts.get(bestProvider) ?? 0;

  for (const log of logs) {
    const provider = log.provider?.trim() || DEFAULT_PROVIDER;
    const count = counts.get(provider) ?? 0;
    if (count > bestCount) {
      bestProvider = provider;
      bestCount = count;
    }
  }

  return bestProvider;
};

const roundToHalf = (value: number) => Math.round(value * 2) / 2;

export function predictNextShift(logs: DailyWorkLog[], options: PredictNextShiftOptions = {}): ShiftPrediction {
  const referenceDate = toDate(options.referenceDate);
  const referenceKey = toUKDateString(referenceDate);
  const referenceDay = parseDate(referenceKey).getUTCDay();

  const recentLogs = getLastLogs(logs, 10, referenceKey);
  const sameDayLogs = [...logs]
    .filter((log) => log.date < referenceKey && parseDate(log.date).getUTCDay() === referenceDay)
    .sort((left, right) => {
      const dateCompare = right.date.localeCompare(left.date);
      if (dateCompare !== 0) return dateCompare;
      return (right.endedAt ?? '').localeCompare(left.endedAt ?? '');
    })
    .slice(0, 8);

  const hoursValues = sameDayLogs
    .map((log) => log.hoursWorked)
    .filter((value) => Number.isFinite(value) && value > 0);
  const revenueValues = sameDayLogs
    .map((log) => log.revenue)
    .filter((value) => Number.isFinite(value) && value >= 0);

  const estimatedRevenueAvg = average(revenueValues);
  const revenueStdDev = standardDeviation(revenueValues);

  const mostRecentFuelLog = [...logs]
    .filter((log) => (log.fuelLiters ?? 0) > 0)
    .sort((left, right) => {
      const dateCompare = right.date.localeCompare(left.date);
      if (dateCompare !== 0) return dateCompare;
      return (right.endedAt ?? '').localeCompare(left.endedAt ?? '');
    })[0];

  const fuelLikely =
    !mostRecentFuelLog || daysBetween(referenceKey, mostRecentFuelLog.date) > 4;

  const sampleCount = sameDayLogs.length;
  const confidence: ShiftPrediction['confidence'] =
    sampleCount >= 5 ? 'high' : sampleCount >= 2 ? 'medium' : 'low';

  return {
    provider: getModeProvider(recentLogs),
    estimatedHours: roundToHalf(average(hoursValues)),
    estimatedRevenueMin: Math.max(0, estimatedRevenueAvg - revenueStdDev),
    estimatedRevenueMax: estimatedRevenueAvg + revenueStdDev,
    estimatedRevenueAvg,
    fuelLikely,
    startOdometer: options.lastEndOdometer ?? null,
    confidence,
  };
}
