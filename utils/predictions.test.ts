import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type DailyWorkLog, type Settings } from '../types';
import { generatePredictions } from './predictions';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  workWeekStartDay: 'MON',
  weeklyRevenueTarget: 600,
};

const makeLog = (id: string, overrides: Partial<DailyWorkLog>): DailyWorkLog => ({
  id,
  date: '2026-04-01',
  provider: 'Uber',
  hoursWorked: 5,
  revenue: 100,
  ...overrides,
});

describe('generatePredictions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show predictions before 3 eligible shifts', () => {
    const predictions = generatePredictions([
      makeLog('log-1', { date: '2026-04-10', revenue: 140 }),
      makeLog('log-2', { date: '2026-04-11', revenue: 160 }),
    ], settings);

    expect(predictions).toEqual([]);
  });

  it('shows early-sample coaching after 3 eligible shifts', () => {
    const predictions = generatePredictions([
      makeLog('log-1', { date: '2026-04-10', revenue: 210 }),
      makeLog('log-2', { date: '2026-04-14', revenue: 100 }),
      makeLog('log-3', { date: '2026-04-17', revenue: 220 }),
    ], settings);

    expect(predictions.length).toBeGreaterThan(0);
    expect(predictions[0]?.message).toContain('Based on your first 3 shifts');
  });

  it('shows the existing reminder time on target predictions when reminders are enabled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T12:00:00.000Z'));

    const predictions = generatePredictions([
      makeLog('log-1', { date: '2026-04-01', revenue: 100 }),
      makeLog('log-2', { date: '2026-04-02', revenue: 100 }),
      makeLog('log-3', { date: '2026-04-03', revenue: 100 }),
    ], {
      ...settings,
      reminderEnabled: true,
      reminderTime: '20:15',
    });

    expect(predictions.find((prediction) => prediction.type === 'target')?.actionLabel).toBe(
      'Reminder already set for 20:15'
    );
  });
});
