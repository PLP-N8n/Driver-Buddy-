import { describe, expect, it } from 'vitest';
import type { DailyWorkLog } from '../../types';
import { calcPlatformSummaries } from '../platformInsights';

const makeLog = (id: string, overrides: Partial<DailyWorkLog>): DailyWorkLog => ({
  id,
  date: '2026-04-20',
  provider: 'Uber',
  hoursWorked: 4,
  revenue: 100,
  ...overrides,
});

describe('calcPlatformSummaries', () => {
  it('returns a single provider summary with the correct hourly rate', () => {
    const summaries = calcPlatformSummaries([
      makeLog('log-1', {
        provider: 'Uber',
        hoursWorked: 4,
        revenue: 120,
      }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      provider: 'Uber',
      totalEarnings: 120,
      totalHours: 4,
      hourlyRate: 30,
      shiftCount: 1,
      earningsShare: 100,
    });
  });

  it('attributes multi-provider shift hours proportionally by providerSplits revenue', () => {
    const summaries = calcPlatformSummaries([
      makeLog('log-1', {
        provider: 'Uber + Bolt',
        hoursWorked: 5,
        revenue: 100,
        providerSplits: [
          { provider: 'Uber', revenue: 60 },
          { provider: 'Bolt', revenue: 40 },
        ],
      }),
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      provider: 'Uber',
      totalEarnings: 60,
      shiftCount: 1,
    });
    expect(summaries[0]?.totalHours).toBeCloseTo(3);
    expect(summaries[0]?.hourlyRate).toBeCloseTo(20);
    expect(summaries[0]?.earningsShare).toBeCloseTo(60);
    expect(summaries[1]).toMatchObject({
      provider: 'Bolt',
      totalEarnings: 40,
      shiftCount: 1,
    });
    expect(summaries[1]?.totalHours).toBeCloseTo(2);
    expect(summaries[1]?.hourlyRate).toBeCloseTo(20);
    expect(summaries[1]?.earningsShare).toBeCloseTo(40);
  });

  it('aggregates mixed split and non-split logs case-insensitively', () => {
    const summaries = calcPlatformSummaries([
      makeLog('log-1', {
        provider: 'Uber + Bolt',
        hoursWorked: 5,
        revenue: 100,
        providerSplits: [
          { provider: 'Uber', revenue: 60 },
          { provider: 'Bolt', revenue: 40 },
        ],
      }),
      makeLog('log-2', {
        provider: 'uber',
        hoursWorked: 2,
        revenue: 40,
      }),
    ]);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      provider: 'Uber',
      totalEarnings: 100,
      shiftCount: 2,
    });
    expect(summaries[0]?.totalHours).toBeCloseTo(5);
    expect(summaries[0]?.hourlyRate).toBeCloseTo(20);
    expect(summaries[0]?.earningsShare).toBeCloseTo(100 / 140 * 100);
    expect(summaries[1]).toMatchObject({
      provider: 'Bolt',
      totalEarnings: 40,
      totalHours: 2,
      hourlyRate: 20,
      shiftCount: 1,
    });
  });

  it('keeps a single provider result so the component can decide whether to hide it', () => {
    const summaries = calcPlatformSummaries([
      makeLog('log-1', { provider: 'Uber', revenue: 80 }),
      makeLog('log-2', { provider: 'uber', revenue: 120 }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      provider: 'Uber',
      totalEarnings: 200,
      shiftCount: 2,
    });
  });

  it('uses an hourly rate of 0 for zero-hour logs instead of NaN', () => {
    const summaries = calcPlatformSummaries([
      makeLog('log-1', {
        provider: 'Deliveroo',
        hoursWorked: 0,
        revenue: 50,
      }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.hourlyRate).toBe(0);
    expect(Number.isNaN(summaries[0]?.hourlyRate)).toBe(false);
  });
});
