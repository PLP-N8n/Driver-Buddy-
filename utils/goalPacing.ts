import type { DailyWorkLog } from '../types';
import type { DriverPrediction } from './predictions';
import { todayUK, ukWeekStart } from './ukDate';

type PaceStatus = 'ahead' | 'onTrack' | 'behind' | 'stretch';

export interface GoalPacingResult {
  status: PaceStatus;
  currentRevenue: number;
  remaining: number;
  daysLeft: number;
  requiredDailyRate: number;
  message: string;
  confidence: number;
}

export function calcGoalPacing(
  goal: number,
  today: string,
  workWeekStartDay: 'MON' | 'SUN',
  weekLogs: DailyWorkLog[],
  eligibleHistory: DailyWorkLog[]
): GoalPacingResult | null {
  if (!goal || goal <= 0) return null;

  const weekStart = ukWeekStart(today, workWeekStartDay);
  const currentRevenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);
  const remaining = Math.max(0, goal - currentRevenue);

  const weekStartDate = new Date(`${weekStart}T12:00:00Z`);
  const todayDate = new Date(`${today}T12:00:00Z`);
  const dayIndex = Math.floor((todayDate.getTime() - weekStartDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(1, 7 - dayIndex);

  const requiredDailyRate = remaining / daysLeft;

  const historicalAvgShiftRevenue =
    eligibleHistory.length > 0
      ? eligibleHistory.reduce((sum, log) => sum + log.revenue, 0) / eligibleHistory.length
      : null;

  const formatCurr = (val: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(val);

  let status: PaceStatus;
  let message: string;

  if (currentRevenue >= goal) {
    status = 'ahead';
    const surplus = currentRevenue - goal;
    message = `You've hit your ${formatCurr(goal)} weekly target with ${formatCurr(surplus)} surplus! Everything extra is bonus.`;
  } else if (historicalAvgShiftRevenue) {
    const paceRatio = requiredDailyRate / historicalAvgShiftRevenue;

    if (paceRatio < 0.9) {
      status = 'ahead';
      message = `You're ahead of pace. You could ease off or bank extra toward next week.`;
    } else if (paceRatio <= 1.1) {
      status = 'onTrack';
      message = `You're on track. ${formatCurr(remaining)} to go and ${daysLeft} day${daysLeft > 1 ? 's' : ''} left — about ${formatCurr(requiredDailyRate)}/day.`;
    } else if (paceRatio <= 1.3) {
      status = 'behind';
      message = `You've got ${formatCurr(remaining)} and ${daysLeft} day${daysLeft > 1 ? 's' : ''} left. That's about ${formatCurr(requiredDailyRate)}/day — one solid shift each remaining day should do it.`;
    } else {
      status = 'stretch';
      message = `You've got ${formatCurr(remaining)} and ${daysLeft} day${daysLeft > 1 ? 's' : ''} left. That's a big ask — do what you can and the rest rolls into next week.`;
    }
  } else {
    if (daysLeft <= 1) {
      status = currentRevenue >= goal * 0.5 ? 'onTrack' : 'behind';
      message = `${formatCurr(remaining)} to go on the last day. Do what feels right.`;
    } else {
      const dailyNeeded = remaining / daysLeft;
      status = dailyNeeded <= 50 ? 'onTrack' : 'behind';
      message = `${formatCurr(remaining)} to go, ${daysLeft} day${daysLeft > 1 ? 's' : ''} left. About ${formatCurr(dailyNeeded)}/day needed.`;
    }
  }

  let confidence = 0.70;
  confidence += Math.min(weekLogs.length, 4) * 0.02;
  if (eligibleHistory.length >= 10) confidence += 0.05;
  if (status === 'stretch') confidence -= 0.05;
  confidence = Math.min(confidence, 0.92);

  return {
    status,
    currentRevenue,
    remaining,
    daysLeft,
    requiredDailyRate,
    message,
    confidence,
  };
}

export function generateGoalPacingPrediction(
  logs: DailyWorkLog[],
  settings: { weeklyRevenueTarget: number; workWeekStartDay: 'MON' | 'SUN' }
): DriverPrediction | null {
  const today = todayUK();
  const { weeklyRevenueTarget: goal, workWeekStartDay } = settings;

  if (!goal || goal <= 0) return null;

  const weekStart = ukWeekStart(today, workWeekStartDay);
  const weekLogs = logs.filter((log) => log.date >= weekStart && log.date <= today);

  const eligibleHistory = [...logs]
    .filter((log) => log.revenue > 0 && log.hoursWorked > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const result = calcGoalPacing(goal, today, workWeekStartDay, weekLogs, eligibleHistory);
  if (!result) return null;

  return {
    type: 'pace',
    message: result.message,
    confidence: result.confidence,
    actionLabel: result.status === 'stretch' ? 'Adjust target' : 'Keep going',
  };
}
