import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { evaluateGates } from '../../hooks/useMissedShiftInference';
import type { DailyWorkLog } from '../../types';

// ─── Mock environment ─────────────────────────────────────────────────────────
// Intl.DateTimeFormat doesn't respect Vitest fake timers, so we mock the module.
vi.mock('../../utils/ukDate', () => ({
  todayUK: () => '2026-05-09',
  toUKDateString: (d: Date) => d.toISOString().slice(0, 10),
  ukTaxYearStart: () => '2026-04-06',
  daysBetween: (a: string, b: string) =>
    Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000,
}));

// Must import AFTER vi.mock
import { useMissedShiftInference } from '../../hooks/useMissedShiftInference';

// ─── Constants ───────────────────────────────────────────────────────────────
// All tests freeze time at 2026-05-09 (Saturday), matching the mock.
const MOCK_DATE = new Date('2026-05-09T12:00:00Z');
const MOCK_TAX_YEAR = '2026-04-06';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeLog = (dateStr: string, hours = 8, revenue = 100): DailyWorkLog =>
  ({
    id: `log_${dateStr}`,
    date: dateStr,
    hoursWorked: hours,
    revenue,
    provider: 'Work Day',
  }) as unknown as DailyWorkLog;

// 5 Thursdays within 28 days of May 9: April 16, 23, 30, May 7, 14
const FIVE_THURSDAY_LOGS: DailyWorkLog[] = [
  makeLog('2026-05-14'),
  makeLog('2026-05-07'),
  makeLog('2026-04-30'),
  makeLog('2026-04-23'),
  makeLog('2026-04-16'),
];

const baseOpts = {
  enabled: true,
  dailyLogs: FIVE_THURSDAY_LOGS,
  settings: { detectMissedShiftsEnabled: true } as any,
  gpsMilesToday: 10,
};

const defaultState = () => ({
  lastPromptDate: null as string | null,
  weeklyPromptCount: 0,
  lastWeeklyReset: null as string | null,
  rejectionLog: [] as Array<{ date: string; kind: 'reject' | 'dismiss' | 'suppress' }>,
  lastTaxYearReset: MOCK_TAX_YEAR,
  taxYearRejections: 0,
  consecutiveNoShiftDays: 0,
  lastConsecutiveCheck: null as string | null,
  taxYearSuppression: false,
});

// ─── Fake timers ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCK_DATE);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('evaluateGates', () => {
  // ── Gate 2 ────────────────────────────────────────────────────────────────
  it('Gate 2: fails with fewer than 5 same-weekday shifts in 28 days', () => {
    const logs: DailyWorkLog[] = [
      makeLog('2026-05-07'),
      makeLog('2026-04-30'),
      makeLog('2026-04-23'),
      makeLog('2026-04-16'),
    ];
    const result = evaluateGates({ ...baseOpts, dailyLogs: logs }, defaultState(), MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('pattern_not_confirmed');
  });

  it('Gate 2: passes with 5 same-weekday shifts in 28 days', () => {
    const result = evaluateGates(baseOpts, defaultState(), MOCK_DATE);
    expect(result.pass).toBe(true);
  });

  // ── Gate 3 ───────────────────────────────────────────────────────────────
  it('Gate 3: fails with 3 consecutive no-shift days (break mode)', () => {
    // 5 Wednesdays pass Gate 2. Last shift is May 6 → backwards from May 9:
    // May 9(no,1), May 8(no,2), May 7(no,3) → 3 consecutive → break_mode.
    const logs: DailyWorkLog[] = [
      makeLog('2026-05-13'), makeLog('2026-05-06'),
      makeLog('2026-04-29'), makeLog('2026-04-22'), makeLog('2026-04-15'),
    ];
    const result = evaluateGates({ ...baseOpts, dailyLogs: logs }, defaultState(), MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('break_mode');
  });

  it('Gate 3: passes with only 2 consecutive no-shift days', () => {
    // 5 Wednesdays pass Gate 2. Extra shift on May 8 breaks the chain:
    // May 9(no,1), May 8(HAS SHIFT) → 1 consecutive → pass.
    const logs: DailyWorkLog[] = [
      makeLog('2026-05-13'), makeLog('2026-05-08'), makeLog('2026-05-06'),
      makeLog('2026-04-29'), makeLog('2026-04-22'), makeLog('2026-04-15'),
    ];
    const result = evaluateGates({ ...baseOpts, dailyLogs: logs }, defaultState(), MOCK_DATE);
    expect(result.pass).toBe(true);
  });

  // ── Gate 4 ───────────────────────────────────────────────────────────────
  it('Gate 4: fails if a prompt already fired today', () => {
    const state = { ...defaultState(), lastPromptDate: '2026-05-09' };
    const result = evaluateGates(baseOpts, state, MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('already_prompted_today');
  });

  // ── Gate 5 ───────────────────────────────────────────────────────────────
  it('Gate 5: fails after 2 prompts fired this week', () => {
    const state = { ...defaultState(), weeklyPromptCount: 2 };
    const result = evaluateGates(baseOpts, state, MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('weekly_cap_reached');
  });

  // ── Gate 6 ───────────────────────────────────────────────────────────────
  it('Gate 6: fails with 2 rejections in past 7 days', () => {
    const state = {
      ...defaultState(),
      rejectionLog: [
        { date: '2026-05-08', kind: 'reject' as const },
        { date: '2026-05-08', kind: 'dismiss' as const },
      ],
    };
    const result = evaluateGates(baseOpts, state, MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('weekly_dampen');
  });

  // ── Gate 7 ───────────────────────────────────────────────────────────────
  it('Gate 7: fails after 4 rejections in tax year', () => {
    const state = {
      ...defaultState(),
      taxYearRejections: 4,
      rejectionLog: [
        { date: '2026-04-07', kind: 'reject' as const },
        { date: '2026-04-14', kind: 'reject' as const },
        { date: '2026-04-21', kind: 'reject' as const },
        { date: '2026-04-28', kind: 'reject' as const },
      ],
    };
    const result = evaluateGates(baseOpts, state, MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('tax_year_suppressed');
  });

  it('Gate 7: fails when taxYearSuppression flag is set', () => {
    const state = { ...defaultState(), taxYearSuppression: true };
    const result = evaluateGates(baseOpts, state, MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('tax_year_suppressed');
  });

  // ── Gate 9 ───────────────────────────────────────────────────────────────
  it('Gate 9: fails with GPS below 5-mile threshold', () => {
    const result = evaluateGates({ ...baseOpts, gpsMilesToday: 4.9 }, defaultState(), MOCK_DATE);
    expect(result.pass).toBe(false);
    expect(result.reason).toBe('gps_below_threshold');
  });

  it('Gate 9: passes with GPS above 5-mile threshold', () => {
    const result = evaluateGates({ ...baseOpts, gpsMilesToday: 5.1 }, defaultState(), MOCK_DATE);
    expect(result.pass).toBe(true);
  });

  // ── All gates pass ───────────────────────────────────────────────────────
  it('passes when all gates clear', () => {
    const result = evaluateGates(baseOpts, defaultState(), MOCK_DATE);
    expect(result.pass).toBe(true);
  });
});

describe('useMissedShiftInference hook — integration', () => {
  // These tests use the full hook with fake timers controlling the date.

  it('stays idle when enabled=false', () => {
    const { result } = renderHook(() =>
      useMissedShiftInference({
        enabled: false,
        dailyLogs: [],
        settings: { detectMissedShiftsEnabled: false } as any,
        gpsMilesToday: 10,
      })
    );
    expect(result.current.phase).toBe('idle');
  });

  it('proceeds to prompting when all gates pass and GPS >= 5 miles', () => {
    const { result } = renderHook(() =>
      useMissedShiftInference({
        enabled: true,
        dailyLogs: FIVE_THURSDAY_LOGS,
        settings: { detectMissedShiftsEnabled: true } as any,
        gpsMilesToday: 10,
      })
    );
    expect(result.current.phase).toBe('prompting');
    expect(result.current.inferredShift).not.toBeNull();
  });

  it('stays idle when GPS below threshold', () => {
    const { result } = renderHook(() =>
      useMissedShiftInference({
        enabled: true,
        dailyLogs: FIVE_THURSDAY_LOGS,
        settings: { detectMissedShiftsEnabled: true } as any,
        gpsMilesToday: 4.9,
      })
    );
    expect(result.current.phase).toBe('waiting_for_gps');
  });
});
