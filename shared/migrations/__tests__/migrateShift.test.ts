import { describe, it, expect } from 'vitest';
import { migrateDailyWorkLog, migrateActiveWorkSession } from '../migrateShift';
import type { DailyWorkLog, ActiveWorkSession } from '../../../types';

const legacyLog: DailyWorkLog = {
  id: 'log-1',
  date: '2026-04-01',
  provider: 'Deliveroo',
  hoursWorked: 6,
  revenue: 90,
  milesDriven: 50,
  startedAt: '2026-04-01T10:00:00Z',
  endedAt: '2026-04-01T16:00:00Z',
  providerSplits: [
    { provider: 'Deliveroo', revenue: 60 },
    { provider: 'Uber Eats', revenue: 30 },
  ],
};

describe('migrateDailyWorkLog', () => {
  it('sets status to completed', () => {
    expect(migrateDailyWorkLog(legacyLog).status).toBe('completed');
  });
  it('maps revenue to totalEarnings', () => {
    expect(migrateDailyWorkLog(legacyLog).totalEarnings).toBe(90);
  });
  it('maps provider to primaryPlatform', () => {
    expect(migrateDailyWorkLog(legacyLog).primaryPlatform).toBe('Deliveroo');
  });
  it('converts providerSplits to earnings array', () => {
    const result = migrateDailyWorkLog(legacyLog);
    expect(result.earnings).toHaveLength(2);
    expect(result.earnings[0]!.platform).toBe('deliveroo');
    expect(result.earnings[0]!.amount).toBe(60);
  });
  it('merges linked trip odometer if provided', () => {
    const trip = {
      id: 't1',
      date: '2026-04-01',
      startOdometer: 1000,
      endOdometer: 1050,
      totalMiles: 50,
    } as any;
    const result = migrateDailyWorkLog(legacyLog, trip);
    expect(result.startOdometer).toBe(1000);
    expect(result.endOdometer).toBe(1050);
  });
  it('is idempotent - already migrated record returns as-is', () => {
    const migrated = migrateDailyWorkLog(legacyLog);
    const twice = migrateDailyWorkLog(migrated as any);
    expect(twice).toBe(migrated);
  });
});

describe('migrateActiveWorkSession', () => {
  const session: ActiveWorkSession = {
    id: 'sess-1',
    date: '2026-04-01',
    startedAt: '2026-04-01T10:00:00Z',
    provider: 'Uber',
    revenue: 45,
    expenses: [],
  };
  it('maps provider to primaryPlatform', () => {
    expect(migrateActiveWorkSession(session).primaryPlatform).toBe('Uber');
  });
  it('initialises expenseDrafts array', () => {
    expect(migrateActiveWorkSession(session).expenseDrafts).toEqual([]);
  });
});
