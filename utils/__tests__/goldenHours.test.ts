import { describe, it, expect } from 'vitest';
import { generateGoldenHoursPredictions } from '../goldenHours';
import type { DailyWorkLog } from '../../types';

function makeLog(overrides: Partial<DailyWorkLog> = {}): DailyWorkLog {
  return {
    id: 'log-1',
    date: '2026-05-10',
    provider: 'Uber',
    hoursWorked: 8,
    revenue: 120,
    startedAt: '2026-05-10T08:00:00Z',
    ...overrides,
  };
}

describe('generateGoldenHoursPredictions', () => {
  it('returns null when no logs have startedAt', () => {
    const logs = [makeLog({ startedAt: undefined })];
    expect(generateGoldenHoursPredictions(logs, false)).toBeNull();
  });

  it('returns null when no logs have revenue or hours', () => {
    const logs = [makeLog({ revenue: 0, hoursWorked: 0 })];
    expect(generateGoldenHoursPredictions(logs, false)).toBeNull();
  });

  it('returns null for empty log array', () => {
    expect(generateGoldenHoursPredictions([], false)).toBeNull();
  });

  it('returns a goldenHours prediction with best time message when single bucket', () => {
    const logs = [
      makeLog({ id: '1', date: '2026-05-04', startedAt: '2026-05-04T08:00:00Z', revenue: 150, hoursWorked: 6 }),
      makeLog({ id: '2', date: '2026-05-11', startedAt: '2026-05-11T08:30:00Z', revenue: 160, hoursWorked: 6 }),
    ];

    const result = generateGoldenHoursPredictions(logs, true);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('goldenHours');
    expect(result!.message).toContain('you average');
    expect(result!.confidence).toBeGreaterThan(0.5);
    expect(result!.confidence).toBeLessThanOrEqual(0.96);
  });

  it('returns contrast message when two different day+bucket groups exist with enough spread', () => {
    const logs = [
      // Morning shifts — high earners
      makeLog({ id: 'm1', date: '2026-05-04', startedAt: '2026-05-04T07:00:00Z', revenue: 200, hoursWorked: 4 }),
      makeLog({ id: 'm2', date: '2026-05-11', startedAt: '2026-05-11T07:00:00Z', revenue: 220, hoursWorked: 4 }),
      makeLog({ id: 'm3', date: '2026-05-18', startedAt: '2026-05-18T07:00:00Z', revenue: 210, hoursWorked: 4 }),
      // Night shifts — low earners
      makeLog({ id: 'n1', date: '2026-05-06', startedAt: '2026-05-06T23:00:00Z', revenue: 60, hoursWorked: 4 }),
      makeLog({ id: 'n2', date: '2026-05-13', startedAt: '2026-05-13T23:00:00Z', revenue: 55, hoursWorked: 4 }),
      makeLog({ id: 'n3', date: '2026-05-20', startedAt: '2026-05-20T23:00:00Z', revenue: 65, hoursWorked: 4 }),
    ];

    const result = generateGoldenHoursPredictions(logs, false);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('but only');
  });

  it('returns best-only message when no contrast group meets threshold', () => {
    const logs = [
      makeLog({ id: '1', date: '2026-05-04', startedAt: '2026-05-04T09:00:00Z', revenue: 100, hoursWorked: 4 }),
      makeLog({ id: '2', date: '2026-05-11', startedAt: '2026-05-11T10:00:00Z', revenue: 95, hoursWorked: 4 }),
    ];

    const result = generateGoldenHoursPredictions(logs, true);
    expect(result).not.toBeNull();
    expect(result!.message).not.toContain('but only');
  });

  it('correctly assigns shifts to time buckets', () => {
    const morning = makeLog({ id: 'am', date: '2026-05-04', startedAt: '2026-05-04T06:00:00Z', revenue: 100, hoursWorked: 4 });
    const afternoon = makeLog({ id: 'pm', date: '2026-05-05', startedAt: '2026-05-05T14:00:00Z', revenue: 120, hoursWorked: 4 });
    const evening = makeLog({ id: 'ev', date: '2026-05-06', startedAt: '2026-05-06T19:00:00Z', revenue: 80, hoursWorked: 4 });
    const night = makeLog({ id: 'nt', date: '2026-05-07', startedAt: '2026-05-07T23:00:00Z', revenue: 90, hoursWorked: 4 });

    const result = generateGoldenHoursPredictions([morning, afternoon, evening, night], true);
    expect(result).not.toBeNull();
    // Afternoon (120/4=30/hr) should be the best
    expect(result!.message).toContain('afternoon');
  });

  it('confidence is clamped at 0.96', () => {
    const logs = Array.from({ length: 30 }, (_, i) =>
      makeLog({
        id: `log-${i}`,
        date: `2026-05-${String(i + 1).padStart(2, '0')}`,
        startedAt: `2026-05-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
        revenue: 200,
        hoursWorked: 4,
      })
    );

    const result = generateGoldenHoursPredictions(logs, false);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThanOrEqual(0.96);
  });

  it('early sample mode allows single-shift buckets', () => {
    const logs = [
      makeLog({ id: '1', date: '2026-05-04', startedAt: '2026-05-04T08:00:00Z', revenue: 100, hoursWorked: 4 }),
    ];

    const result = generateGoldenHoursPredictions(logs, true);
    expect(result).not.toBeNull();
  });
});
