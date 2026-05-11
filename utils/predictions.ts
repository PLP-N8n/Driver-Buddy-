import { DailyWorkLog, Settings } from '../types';
import { todayUK, ukWeekStart } from './ukDate';
import { generateGoldenHoursPredictions } from './goldenHours';
import { generateGoalPacingPrediction } from './goalPacing';

export interface DriverPrediction {
  type: 'schedule' | 'platform' | 'timing' | 'target' | 'goldenHours' | 'pace';
  message: string;
  confidence: number;
  actionLabel?: string;
}

type DayStats = {
  day: number;
  count: number;
  revenue: number;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_ELIGIBLE_LOGS_FOR_PREDICTIONS = 3;
const ESTABLISHED_SAMPLE_LOG_COUNT = 10;

const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatCurrency = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);

const formatHoursLabel = (bucket: ShiftBucket) => {
  switch (bucket) {
    case 'lt4':
      return 'under 4';
    case '4to6':
      return '4-6';
    case '6to8':
      return '6-8';
    case '8plus':
      return '8+';
  }
};

const getReminderActionLabel = (settings: Settings) =>
  settings.reminderEnabled
    ? `Reminder already set for ${settings.reminderTime || '18:00'}`
    : 'Set reminder';

type ShiftBucket = 'lt4' | '4to6' | '6to8' | '8plus';

const getBucket = (hours: number): ShiftBucket => {
  if (hours < 4) return 'lt4';
  if (hours < 6) return '4to6';
  if (hours < 8) return '6to8';
  return '8plus';
};

const getWeekRange = (baseDate: string, startDay: Settings['workWeekStartDay']) => {
  const start = ukWeekStart(baseDate, startDay);
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);

  return { start, end: end.toISOString().slice(0, 10) };
};

const compareByDate = (left: DailyWorkLog, right: DailyWorkLog) => {
  const dateCompare = left.date.localeCompare(right.date);
  if (dateCompare !== 0) return dateCompare;
  return (left.endedAt ?? '').localeCompare(right.endedAt ?? '');
};

export function generatePredictions(logs: DailyWorkLog[], settings: Settings): DriverPrediction[] {
  const eligibleLogs = [...logs]
    .filter((log) => log.revenue > 0 && log.hoursWorked > 0)
    .sort(compareByDate);

  if (eligibleLogs.length < MIN_ELIGIBLE_LOGS_FOR_PREDICTIONS) {
    return [];
  }

  const predictions: DriverPrediction[] = [];
  const isEarlySample = eligibleLogs.length < ESTABLISHED_SAMPLE_LOG_COUNT;
  const earlySamplePrefix = isEarlySample ? `Based on your first ${eligibleLogs.length} shifts, ` : '';
  const overallAverageRevenue = average(eligibleLogs.map((log) => log.revenue));
  const overallRevenuePerHour = average(eligibleLogs.map((log) => log.revenue / log.hoursWorked));

  const dayMap = new Map<number, DayStats>();
  for (const log of eligibleLogs) {
    const day = parseDate(log.date).getUTCDay();
    const current = dayMap.get(day) ?? { day, count: 0, revenue: 0 };
    dayMap.set(day, {
      day,
      count: current.count + 1,
      revenue: current.revenue + log.revenue,
    });
  }

  const bestDay = [...dayMap.values()]
    .filter((entry) => entry.count >= (isEarlySample ? 1 : 2))
    .map((entry) => ({
      ...entry,
      averageRevenue: entry.revenue / entry.count,
    }))
    .sort((left, right) => right.averageRevenue - left.averageRevenue)[0];

  const minimumDayUplift = isEarlySample ? 1.05 : 1.15;
  if (bestDay && overallAverageRevenue > 0 && bestDay.averageRevenue > overallAverageRevenue * minimumDayUplift) {
    const uplift = bestDay.averageRevenue - overallAverageRevenue;
    predictions.push({
      type: 'schedule',
      message: isEarlySample
        ? `${earlySamplePrefix}${DAY_NAMES[bestDay.day]} looks strongest so far - ${bestDay.count === 1 ? 'you earned' : 'you earn'} ${formatCurrency(uplift)} more ${bestDay.count === 1 ? 'than your current average' : 'on average'}.`
        : `Your best day is ${DAY_NAMES[bestDay.day]} - you earn ${formatCurrency(uplift)} more on average.`,
      confidence: clamp(0.62 + bestDay.count * 0.04 + uplift / Math.max(overallAverageRevenue, 1) * 0.2, 0, 0.95),
      actionLabel: 'Plan around it',
    });
  }

  const providerDayStats = new Map<string, { count: number; revenue: number; hours: number }>();
  for (const log of eligibleLogs) {
    const day = parseDate(log.date).getUTCDay();
    const key = `${log.provider || 'Other'}::${day}`;
    const current = providerDayStats.get(key) ?? { count: 0, revenue: 0, hours: 0 };
    providerDayStats.set(key, {
      count: current.count + 1,
      revenue: current.revenue + log.revenue,
      hours: current.hours + log.hoursWorked,
    });
  }

  const topProviderDay = [...providerDayStats.entries()]
    .map(([key, values]) => {
      const [provider, dayString] = key.split('::');
      return {
        provider,
        day: Number(dayString),
        count: values.count,
        revenuePerHour: values.hours > 0 ? values.revenue / values.hours : 0,
      };
    })
    .filter((entry) => entry.count >= (isEarlySample ? 2 : 3) && entry.revenuePerHour > 0)
    .sort((left, right) => right.revenuePerHour - left.revenuePerHour)[0];

  if (topProviderDay && overallRevenuePerHour > 0 && topProviderDay.revenuePerHour > overallRevenuePerHour * 1.2) {
    const hourlyLift = topProviderDay.revenuePerHour - overallRevenuePerHour;
    predictions.push({
      type: 'platform',
      message: isEarlySample
        ? `${earlySamplePrefix}${topProviderDay.provider} on ${DAY_NAMES[topProviderDay.day]}s is ahead by ${formatCurrency(hourlyLift)}/hr so far.`
        : `${topProviderDay.provider} on ${DAY_NAMES[topProviderDay.day]}s earns you ${formatCurrency(hourlyLift)}/hr more - worth prioritising.`,
      confidence: clamp(0.62 + topProviderDay.count * 0.04 + hourlyLift / Math.max(overallRevenuePerHour, 1) * 0.18, 0, 0.96),
      actionLabel: 'Prioritise it',
    });
  }

  const bucketStats = new Map<ShiftBucket, { count: number; revenue: number; hours: number }>();
  for (const log of eligibleLogs) {
    const bucket = getBucket(log.hoursWorked);
    const current = bucketStats.get(bucket) ?? { count: 0, revenue: 0, hours: 0 };
    bucketStats.set(bucket, {
      count: current.count + 1,
      revenue: current.revenue + log.revenue,
      hours: current.hours + log.hoursWorked,
    });
  }

  const topBucket = [...bucketStats.entries()]
    .map(([bucket, values]) => ({
      bucket,
      count: values.count,
      revenuePerHour: values.hours > 0 ? values.revenue / values.hours : 0,
    }))
    .filter((entry) => entry.count >= (isEarlySample ? 2 : 3) && entry.revenuePerHour > 0)
    .sort((left, right) => right.revenuePerHour - left.revenuePerHour)[0];

  if (topBucket && overallRevenuePerHour > 0 && topBucket.revenuePerHour > overallRevenuePerHour * 1.15) {
    predictions.push({
      type: 'timing',
      message: isEarlySample
        ? `${earlySamplePrefix}${formatHoursLabel(topBucket.bucket)} hour shifts look strongest per hour so far.`
        : `Your sweet spot is ${formatHoursLabel(topBucket.bucket)} hour shifts - that's when you earn the most per hour.`,
      confidence: clamp(0.61 + topBucket.count * 0.04 + (topBucket.revenuePerHour / overallRevenuePerHour - 1) * 0.25, 0, 0.94),
      actionLabel: 'Shape your next shift',
    });
  }

  const todayKey = todayUK();
  const todayDay = parseDate(todayKey).getUTCDay();
  if (todayDay === 3 || todayDay === 4) {
    const { start, end } = getWeekRange(todayKey, settings.workWeekStartDay);
    const weeklyLogs = eligibleLogs.filter((log) => log.date >= start && log.date <= end);
    const weeklyRevenue = weeklyLogs.reduce((sum, log) => sum + log.revenue, 0);
    const target = settings.weeklyRevenueTarget;

    if (target > 0 && weeklyRevenue < target * 0.5) {
      const remaining = Math.max(0, target - weeklyRevenue);
      const averagePerShift = average(eligibleLogs.map((log) => log.revenue));
      const shiftsNeeded = averagePerShift > 0 ? Math.ceil(remaining / averagePerShift) : 0;
      predictions.push({
        type: 'target',
        message: `You need ${formatCurrency(remaining)} more this week to hit your target - ${Math.max(1, shiftsNeeded)} more shifts at your average should do it.`,
        confidence: clamp(0.64 + Math.min(weeklyLogs.length, 4) * 0.03, 0, 0.88),
        actionLabel: getReminderActionLabel(settings),
      });
    }
  }

  // Golden Hours
  const goldenHoursPrediction = generateGoldenHoursPredictions(eligibleLogs, isEarlySample);
  if (goldenHoursPrediction) {
    predictions.push(goldenHoursPrediction);
  }

  // Goal Pacing
  const pacingPrediction = generateGoalPacingPrediction(eligibleLogs, {
    weeklyRevenueTarget: settings.weeklyRevenueTarget,
    workWeekStartDay: settings.workWeekStartDay,
  });
  if (pacingPrediction) {
    predictions.push(pacingPrediction);
  }

  if (eligibleLogs.length >= 14) {
    const latestLog = eligibleLogs[eligibleLogs.length - 1];
    if (!latestLog) {
      return predictions
        .filter((prediction) => prediction.confidence > 0.6)
        .sort((left, right) => right.confidence - left.confidence);
    }

    const latestDate = parseDate(latestLog.date);
    const recentStart = new Date(latestDate.getTime());
    recentStart.setUTCDate(recentStart.getUTCDate() - 13);
    const previousStart = new Date(recentStart.getTime());
    previousStart.setUTCDate(previousStart.getUTCDate() - 14);
    const previousEnd = new Date(recentStart.getTime());
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

    const recentLogs = eligibleLogs.filter((log) => {
      const logDate = parseDate(log.date);
      return logDate >= recentStart && logDate <= latestDate;
    });
    const previousLogs = eligibleLogs.filter((log) => {
      const logDate = parseDate(log.date);
      return logDate >= previousStart && logDate <= previousEnd;
    });

    const recentHours = recentLogs.reduce((sum, log) => sum + log.hoursWorked, 0);
    const previousHours = previousLogs.reduce((sum, log) => sum + log.hoursWorked, 0);
    const recentRate = recentHours > 0 ? recentLogs.reduce((sum, log) => sum + log.revenue, 0) / recentHours : 0;
    const previousRate = previousHours > 0 ? previousLogs.reduce((sum, log) => sum + log.revenue, 0) / previousHours : 0;

    if (previousRate > 0 && recentRate < previousRate * 0.9) {
      const dropPercent = ((previousRate - recentRate) / previousRate) * 100;
      predictions.push({
        type: 'platform',
        message: `Your hourly rate has dropped ${Math.round(dropPercent)}% over the past 2 weeks - check if costs are rising.`,
        confidence: clamp(0.62 + Math.min(recentLogs.length + previousLogs.length, 14) * 0.015 + dropPercent / 100 * 0.2, 0, 0.92),
        actionLabel: 'Review costs',
      });
    }
  }

  const visiblePredictions = predictions
    .filter((prediction) => prediction.confidence > 0.6)
    .sort((left, right) => right.confidence - left.confidence);

  if (visiblePredictions.length === 0 && isEarlySample && overallAverageRevenue > 0 && settings.weeklyRevenueTarget > 0) {
    const shiftsNeeded = Math.max(1, Math.ceil(settings.weeklyRevenueTarget / overallAverageRevenue));
    visiblePredictions.push({
      type: 'target',
      message: `${earlySamplePrefix}${shiftsNeeded} shifts at your current average would hit your ${formatCurrency(settings.weeklyRevenueTarget)} weekly target.`,
      confidence: 0.61,
      actionLabel: getReminderActionLabel(settings),
    });
  }

  return visiblePredictions;
}
