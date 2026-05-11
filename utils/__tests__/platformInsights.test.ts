import { describe, it, expect } from 'vitest';
import { calcPlatformSummaries, filterSubsumedLogs } from '../platformInsights';
import type { DailyWorkLog } from '../../types';

const makeLog = (overrides: Partial<DailyWorkLog> & { id: string }): DailyWorkLog => ({
  date: '2026-04-01',
  provider: 'Uber',
  hoursWorked: 4,
  revenue: 40,
  ...overrides,
});

describe('calcPlatformSummaries', () => {
  it('sorts two platforms descending by total earnings', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Bolt', hoursWorked: 3, revenue: 30 }),
      makeLog({ id: 'b', provider: 'Uber', hoursWorked: 4, revenue: 80 }),
    ];

    const [first, second] = calcPlatformSummaries(logs);

    expect(first?.provider).toBe('Uber');
    expect(first?.totalEarnings).toBe(80);
    expect(second?.provider).toBe('Bolt');
    expect(second?.totalEarnings).toBe(30);
  });

  it('computes hourlyRate correctly', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', hoursWorked: 5, revenue: 50 }),
    ];

    const [summary] = calcPlatformSummaries(logs);

    expect(summary?.hourlyRate).toBeCloseTo(10);
  });

  it('returns a single platform without error', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', hoursWorked: 2, revenue: 24 }),
      makeLog({ id: 'b', provider: 'Uber', hoursWorked: 3, revenue: 30 }),
    ];

    const result = calcPlatformSummaries(logs);
    const [only] = result;

    expect(result).toHaveLength(1);
    expect(only?.provider).toBe('Uber');
    expect(only?.shiftCount).toBe(2);
    expect(only?.totalEarnings).toBe(54);
    expect(only?.totalHours).toBe(5);
  });

  it('excludes shifts with zero earnings', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', hoursWorked: 4, revenue: 0 }),
      makeLog({ id: 'b', provider: 'Bolt', hoursWorked: 2, revenue: 20 }),
    ];

    const result = calcPlatformSummaries(logs);
    const [only] = result;

    expect(result).toHaveLength(1);
    expect(only?.provider).toBe('Bolt');
  });

  it('returns empty array when all shifts have zero earnings', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', hoursWorked: 3, revenue: 0 }),
    ];

    expect(calcPlatformSummaries(logs)).toHaveLength(0);
  });

  it('distributes earnings and hours across providers for a multi-provider split shift', () => {
    const logs: DailyWorkLog[] = [
      makeLog({
        id: 'a',
        provider: 'Uber',
        hoursWorked: 6,
        revenue: 60,
        providerSplits: [
          { provider: 'Uber', revenue: 40 },
          { provider: 'Bolt', revenue: 20 },
        ],
      }),
    ];

    const result = calcPlatformSummaries(logs);
    const uber = result.find((s) => s.provider === 'Uber');
    const bolt = result.find((s) => s.provider === 'Bolt');

    expect(result).toHaveLength(2);
    expect(uber?.totalEarnings).toBe(40);
    expect(bolt?.totalEarnings).toBe(20);
    expect(uber?.totalHours).toBeCloseTo(4);
    expect(bolt?.totalHours).toBeCloseTo(2);
  });

  it('computes earningsShare as percentage of combined earnings', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', hoursWorked: 4, revenue: 75 }),
      makeLog({ id: 'b', provider: 'Bolt', hoursWorked: 2, revenue: 25 }),
    ];

    const result = calcPlatformSummaries(logs);
    const uber = result.find((s) => s.provider === 'Uber');
    const bolt = result.find((s) => s.provider === 'Bolt');

    expect(uber?.earningsShare).toBeCloseTo(75);
    expect(bolt?.earningsShare).toBeCloseTo(25);
  });
});

describe('filterSubsumedLogs', () => {
  it('keeps logs that have providerSplits', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', revenue: 50, providerSplits: [{ provider: 'Uber', revenue: 50 }] }),
    ];

    expect(filterSubsumedLogs(logs)).toHaveLength(1);
  });

  it('removes a single-provider log that is covered by a split log on the same date', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', revenue: 50 }),
      makeLog({ id: 'b', provider: 'Multi', revenue: 60, providerSplits: [{ provider: 'Uber', revenue: 50 }] }),
    ];

    const result = filterSubsumedLogs(logs);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('b');
  });

  it('keeps a single-provider log when no split covers its (date, provider) pair', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', revenue: 50 }),
      makeLog({ id: 'b', provider: 'Uber', revenue: 60, providerSplits: [{ provider: 'Bolt', revenue: 60 }] }),
    ];

    const result = filterSubsumedLogs(logs);
    expect(result).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(filterSubsumedLogs([])).toHaveLength(0);
  });

  it('keeps all logs when none have providerSplits', () => {
    const logs: DailyWorkLog[] = [
      makeLog({ id: 'a', provider: 'Uber', revenue: 50 }),
      makeLog({ id: 'b', provider: 'Bolt', revenue: 30 }),
    ];

    expect(filterSubsumedLogs(logs)).toHaveLength(2);
  });
});
