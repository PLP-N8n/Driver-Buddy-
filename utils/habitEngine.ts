import { DailyWorkLog, Settings } from '../types';
import { daysBetween, todayUK, toUKDateString, ukWeekStart } from './ukDate';

export interface HabitState {
  currentStreak: number;
  longestStreak: number;
  weeklyProgress: number;
  weeklyRevenue: number;
  weeklyTarget: number;
  reengagementMessage: string | null;
  milestone: Milestone | null;
}

export interface Milestone {
  id: string;
  message: string;
  detail: string;
}

const parseDate = (value: string) => new Date(`${value}T12:00:00Z`);
const toDateKey = (value: Date) => toUKDateString(value);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const getYesterday = () => {
  const value = new Date(`${todayUK()}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value;
};

const getCurrentWeekRange = (startDay: Settings['workWeekStartDay']) => {
  const start = ukWeekStart(todayUK(), startDay);
  const end = new Date(`${start}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end: toDateKey(end) };
};

const buildStreaks = (dates: string[]) => {
  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const uniqueDates = Array.from(new Set(dates)).sort((left, right) => left.localeCompare(right));
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate: Date | null = null;

  for (const date of uniqueDates) {
    const currentDate = parseDate(date);
    if (!previousDate) {
      runningStreak = 1;
    } else {
      const diffDays = Math.round((currentDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24));
      runningStreak = diffDays === 1 ? runningStreak + 1 : 1;
    }

    longestStreak = Math.max(longestStreak, runningStreak);
    previousDate = currentDate;
  }

  const yesterdayKey = toDateKey(getYesterday());
  let currentStreak = 0;
  let cursor = parseDate(yesterdayKey);
  const dateSet = new Set(uniqueDates);

  while (dateSet.has(toDateKey(cursor))) {
    currentStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return { currentStreak, longestStreak };
};

const getMostRecentLog = (logs: DailyWorkLog[]) =>
  [...logs].sort((left, right) => {
    const dateCompare = right.date.localeCompare(left.date);
    if (dateCompare !== 0) return dateCompare;
    return (right.endedAt ?? '').localeCompare(left.endedAt ?? '');
  })[0] ?? null;

const getReengagementMessage = (logs: DailyWorkLog[]) => {
  const mostRecentLog = getMostRecentLog(logs);
  if (!mostRecentLog) return null;

  const daysSinceLastLog = daysBetween(mostRecentLog.date, todayUK());

  if (daysSinceLastLog <= 2) return null;
  if (daysSinceLastLog <= 3) {
    return `Good to see you back. You last logged ${daysSinceLastLog} days ago.`;
  }
  if (daysSinceLastLog <= 7) {
    return `Welcome back - ${daysSinceLastLog} days since your last log. Quick catch-up?`;
  }
  return `Been a while! Let's get you back on track. Your last earnings were ${formatCurrency(mostRecentLog.revenue)}.`;
};

const getMilestone = (logs: DailyWorkLog[], currentStreak: number, totalRevenue: number): Milestone | null => {
  const sortedLogs = [...logs].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date);
    if (dateCompare !== 0) return dateCompare;
    return (left.endedAt ?? '').localeCompare(right.endedAt ?? '');
  });

  if (sortedLogs.length === 1) {
    return { id: 'first_log', message: 'First shift logged', detail: 'Your journey starts here' };
  }
  if (currentStreak === 30) {
    return { id: 'streak_30', message: '30-day streak', detail: '30 days of data - your insights are getting sharp' };
  }
  if (currentStreak === 7) {
    return { id: 'streak_7', message: '7-day streak', detail: 'A week of consistent tracking' };
  }
  if (sortedLogs.length === 10) {
    return { id: 'logs_10', message: '10 shifts logged', detail: "You're building a real picture of your earnings" };
  }
  if (sortedLogs.length === 50) {
    return { id: 'logs_50', message: '50 shifts logged', detail: "50 shifts. That's serious commitment." };
  }

  const lastRevenue = sortedLogs[sortedLogs.length - 1]?.revenue ?? 0;
  const previousRevenueTotal = totalRevenue - lastRevenue;
  if (totalRevenue >= 10000 && previousRevenueTotal < 10000) {
    return { id: 'revenue_10000', message: '10,000 tracked', detail: '10k tracked. You know your numbers.' };
  }
  if (totalRevenue >= 1000 && previousRevenueTotal < 1000) {
    return { id: 'revenue_1000', message: '1,000 tracked', detail: 'Your first thousand. Many more to come.' };
  }

  return null;
};

export function getHabitState(logs: DailyWorkLog[], settings: Settings): HabitState {
  const totalRevenue = logs.reduce((sum, log) => sum + log.revenue, 0);
  const { currentStreak, longestStreak } = buildStreaks(logs.map((log) => log.date));
  const { start, end } = getCurrentWeekRange(settings.workWeekStartDay);
  const weeklyRevenue = logs
    .filter((log) => log.date >= start && log.date <= end)
    .reduce((sum, log) => sum + log.revenue, 0);
  const weeklyTarget = settings.weeklyRevenueTarget;
  const weeklyProgress = weeklyTarget > 0 ? Math.min(1, weeklyRevenue / weeklyTarget) : 0;

  return {
    currentStreak,
    longestStreak,
    weeklyProgress,
    weeklyRevenue,
    weeklyTarget,
    reengagementMessage: getReengagementMessage(logs),
    milestone: getMilestone(logs, currentStreak, totalRevenue),
  };
}
