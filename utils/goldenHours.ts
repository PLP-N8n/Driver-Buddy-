import type { DailyWorkLog } from '../types';
import type { DriverPrediction } from './predictions';

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';

interface GoldenHourGroup {
  dayOfWeek: DayOfWeek;
  bucket: TimeBucket;
  totalRevenue: number;
  totalHours: number;
  count: number;
  avgHourlyWage: number;
  trend: 'improving' | 'declining' | 'stable';
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BUCKET_LABELS: Record<TimeBucket, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
};

function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function generateGoldenHoursPredictions(
  logs: DailyWorkLog[],
  isEarlySample: boolean
): DriverPrediction | null {
  const eligible = logs.filter(
    (log) => log.revenue > 0 && log.hoursWorked > 0 && log.startedAt
  );
  if (eligible.length === 0) return null;

  const groups = new Map<string, GoldenHourGroup>();
  for (const log of eligible) {
    const startDate = new Date(log.startedAt!);
    const ukDay = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'short',
    }).format(startDate);
    const adjustedDay = (DAY_MAP[ukDay] ?? startDate.getUTCDay()) as DayOfWeek;

    const ukHour = parseInt(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: 'numeric',
        hour12: false,
      }).format(startDate),
      10
    );

    const bucket = getTimeBucket(ukHour);
    const key = `${adjustedDay}:${bucket}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalRevenue += log.revenue;
      existing.totalHours += log.hoursWorked;
      existing.count++;
      existing.avgHourlyWage = existing.totalRevenue / existing.totalHours;
    } else {
      groups.set(key, {
        dayOfWeek: adjustedDay,
        bucket,
        totalRevenue: log.revenue,
        totalHours: log.hoursWorked,
        count: 1,
        avgHourlyWage: log.revenue / log.hoursWorked,
        trend: 'stable',
      });
    }
  }

  if (groups.size === 0) return null;

  // Trend analysis: last 14 days vs prior 14 days
  const sortedLogs = [...eligible].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sortedLogs[sortedLogs.length - 1]?.date;
  if (latestDate) {
    const latest = new Date(`${latestDate}T12:00:00Z`);
    const recentCutoff = new Date(latest);
    recentCutoff.setUTCDate(recentCutoff.getUTCDate() - 14);
    const priorCutoff = new Date(recentCutoff);
    priorCutoff.setUTCDate(priorCutoff.getUTCDate() - 14);

    const recentLogs = eligible.filter(
      (l) => l.date >= recentCutoff.toISOString().slice(0, 10) && l.date <= latestDate
    );
    const priorLogs = eligible.filter(
      (l) =>
        l.date >= priorCutoff.toISOString().slice(0, 10) &&
        l.date < recentCutoff.toISOString().slice(0, 10)
    );

    for (const [, group] of groups) {
      const recentForGroup = recentLogs.filter((l) => {
        const d = new Date(l.startedAt!);
        const h = parseInt(
          new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(d),
          10
        );
        const ukDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(d);
        return (DAY_MAP[ukDay] ?? d.getUTCDay()) === group.dayOfWeek && getTimeBucket(h) === group.bucket;
      });
      const priorForGroup = priorLogs.filter((l) => {
        const d = new Date(l.startedAt!);
        const h = parseInt(
          new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(d),
          10
        );
        const ukDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(d);
        return (DAY_MAP[ukDay] ?? d.getUTCDay()) === group.dayOfWeek && getTimeBucket(h) === group.bucket;
      });

      if (recentForGroup.length >= 1 && priorForGroup.length >= 1) {
        const recentAvg =
          recentForGroup.reduce((s, l) => s + l.revenue / l.hoursWorked, 0) / recentForGroup.length;
        const priorAvg =
          priorForGroup.reduce((s, l) => s + l.revenue / l.hoursWorked, 0) / priorForGroup.length;
        if (recentAvg > priorAvg * 1.05) group.trend = 'improving';
        else if (recentAvg < priorAvg * 0.95) group.trend = 'declining';
      }
    }
  }

  const bestGroup = [...groups.values()]
    .filter((g) => g.count >= (isEarlySample ? 1 : 2))
    .sort((a, b) => b.avgHourlyWage - a.avgHourlyWage)[0];

  if (!bestGroup) return null;

  const confidence = Math.min(
    0.55 + bestGroup.count * 0.04 + Math.min(1, bestGroup.totalHours / 20) * 0.10,
    0.96
  );

  const validGroups = [...groups.values()].filter(
    (g) => g.count >= (isEarlySample ? 1 : 2) && g !== bestGroup
  );

  const contrastThreshold = isEarlySample ? 1.05 : 1.15;
  const contrastGroup = validGroups
    .filter((g) => bestGroup.avgHourlyWage > g.avgHourlyWage * contrastThreshold)
    .sort((a, b) => a.avgHourlyWage - b.avgHourlyWage)[0];

  const formatWage = (val: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(val);

  const trendPhrase =
    bestGroup.trend === 'improving' ? ' and rising' : bestGroup.trend === 'declining' ? ' but slipping' : '';

  let message: string;
  if (contrastGroup) {
    message = `You average ${formatWage(bestGroup.avgHourlyWage)}/hr on ${DAY_NAMES[bestGroup.dayOfWeek]} ${BUCKET_LABELS[bestGroup.bucket]}s, but only ${formatWage(contrastGroup.avgHourlyWage)}/hr on ${DAY_NAMES[contrastGroup.dayOfWeek]} ${BUCKET_LABELS[contrastGroup.bucket]}s`;
  } else {
    message = `Your best time is ${DAY_NAMES[bestGroup.dayOfWeek]} ${BUCKET_LABELS[bestGroup.bucket]} — you average ${formatWage(bestGroup.avgHourlyWage)}/hr${trendPhrase}`;
  }

  return {
    type: 'goldenHours',
    message,
    confidence,
    actionLabel: 'Plan around it',
  };
}
