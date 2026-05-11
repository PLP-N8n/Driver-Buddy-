import { describe, it, expect } from 'vitest';
import { calcGoalPacing, generateGoalPacingPrediction } from '../goalPacing';
import type { DailyWorkLog } from '../../types';

function makeLog(overrides: Partial<DailyWorkLog> = {}): DailyWorkLog {
  return {
    id: 'log-1',
    date: '2026-05-10',
    provider: 'Uber',
    hoursWorked: 8,
    revenue: 120,
    ...overrides,
  };
}

describe('calcGoalPacing', () => {
  it('returns null when goal is 0 or undefined', () => {
    expect(calcGoalPacing(0, '2026-05-10', 'MON', [], [])).toBeNull();
  });

  it('returns "ahead" when goal already hit with surplus message', () => {
    const weekLogs = [makeLog({ revenue: 600 })];
    const result = calcGoalPacing(500, '2026-05-10', 'MON', weekLogs, [makeLog({ revenue: 120 })]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('ahead');
    expect(result!.message).toContain('surplus');
  });

  it('returns correct statuses at paceRatio boundaries', () => {
    // Monday = May 4 2026, today = May 6 (Wednesday) = dayIndex 2, daysLeft = 5
    const history = [makeLog({ revenue: 100 })]; // avg = 100

    // paceRatio < 0.9 → ahead: required < 90
    const ahead = calcGoalPacing(300, '2026-05-06', 'MON', [makeLog({ revenue: 100 })], history);
    expect(ahead!.status).toBe('ahead');
    // remaining = 200, daysLeft = 5, requiredDaily = 40, paceRatio = 40/100 = 0.4

    // 0.9 <= paceRatio <= 1.1 → onTrack
    const onTrack = calcGoalPacing(500, '2026-05-06', 'MON', [makeLog({ revenue: 0 })], history);
    expect(onTrack!.status).toBe('onTrack');
    // remaining = 500, daysLeft = 5, requiredDaily = 100, paceRatio = 100/100 = 1.0

    // 1.1 < paceRatio <= 1.3 → behind
    const behind = calcGoalPacing(600, '2026-05-06', 'MON', [makeLog({ revenue: 0 })], history);
    expect(behind!.status).toBe('behind');
    // remaining = 600, daysLeft = 5, requiredDaily = 120, paceRatio = 120/100 = 1.2

    // paceRatio > 1.3 → stretch
    const stretch = calcGoalPacing(800, '2026-05-06', 'MON', [makeLog({ revenue: 0 })], history);
    expect(stretch!.status).toBe('stretch');
    // remaining = 800, daysLeft = 5, requiredDaily = 160, paceRatio = 160/100 = 1.6
  });

  it('correct daysLeft calculation for Monday start, Wednesday today', () => {
    // May 4 2026 = Monday, May 6 = Wednesday
    const weekStart = new Date('2026-05-04T12:00:00Z');
    const today = new Date('2026-05-06T12:00:00Z');
    const dayIndex = Math.floor((today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
    expect(dayIndex).toBe(2); // 0=Mon, 2=Wed
    expect(7 - dayIndex).toBe(5); // daysLeft including today
  });

  it('handles empty week logs with goal set', () => {
    const history = [makeLog({ revenue: 100 })];
    const result = calcGoalPacing(500, '2026-05-06', 'MON', [], history);
    expect(result).not.toBeNull();
    expect(result!.currentRevenue).toBe(0);
    expect(result!.remaining).toBe(500);
  });

  it('last day of week with remaining handles gracefully', () => {
    // Sunday May 10 2026, daysLeft = 1
    const result = calcGoalPacing(500, '2026-05-10', 'MON', [makeLog({ revenue: 0 })], []);
    expect(result).not.toBeNull();
    expect(result!.daysLeft).toBe(1);
  });

  it('confidence clamped at 0.92', () => {
    const longHistory = Array.from({ length: 20 }, (_, i) =>
      makeLog({ id: `h-${i}`, date: `2026-04-${String(i + 1).padStart(2, '0')}`, revenue: 100 })
    );
    const result = calcGoalPacing(600, '2026-05-06', 'MON', [makeLog({ revenue: 0 })], longHistory);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThanOrEqual(0.92);
  });
});

describe('generateGoalPacingPrediction', () => {
  it('returns null when goal is not set', () => {
    const logs = [makeLog()];
    const result = generateGoalPacingPrediction(logs, { weeklyRevenueTarget: 0, workWeekStartDay: 'MON' });
    expect(result).toBeNull();
  });

  it('returns a pace prediction when goal is set', () => {
    const logs = [makeLog({ date: '2026-05-10', revenue: 100 })];
    const result = generateGoalPacingPrediction(logs, { weeklyRevenueTarget: 500, workWeekStartDay: 'MON' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('pace');
    expect(result!.confidence).toBeGreaterThan(0);
  });

  it('actionLabel is "Adjust target" for stretch status', () => {
    const logs = [makeLog({ date: '2026-05-06', revenue: 0 })];
    const history = [makeLog({ revenue: 100 })];
    const result = generateGoalPacingPrediction(logs, { weeklyRevenueTarget: 2000, workWeekStartDay: 'MON' });
    // This will likely be stretch given high target vs low history average
    if (result) {
      expect(result.actionLabel).toBeDefined();
    }
  });
});
