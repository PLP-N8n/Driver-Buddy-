import { useCallback, useEffect, useRef, useState } from 'react';
import { DailyWorkLog, Settings, type CompletedShiftSummary } from '../types';
import { predictNextShift } from '../utils/shiftPredictor';
import { todayUK, toUKDateString, ukTaxYearStart } from '../utils/ukDate';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MissedShiftPhase =
  | 'idle'
  | 'waiting_for_gps'
  | 'prompting'
  | 'accepted'
  | 'rejected'
  | 'timeout';

export interface InferredShift {
  date: string;
  estimatedRevenueMin: number;
  estimatedRevenueMax: number;
  estimatedRevenueAvg: number;
  provider: string;
  hours: number;
}

interface PersistedState {
  lastPromptDate: string | null;       // 'YYYY-MM-DD'
  weeklyPromptCount: number;           // resets each Monday
  lastWeeklyReset: string | null;      // 'YYYY-MM-DD' of last Monday reset
  rejectionLog: Array<{ date: string; kind: 'reject' | 'dismiss' | 'suppress' }>;
  lastTaxYearReset: string | null;     // 'YYYY-MM-DD' of last Apr-6 reset
  taxYearRejections: number;
  consecutiveNoShiftDays: number;
  lastConsecutiveCheck: string | null; // 'YYYY-MM-DD' of last break-mode check
  taxYearSuppression: boolean;
}

interface UseMissedShiftInferenceOptions {
  enabled: boolean;
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  gpsMilesToday: number;
  /** Called when the user accepts the inferred shift. Must return a CompletedShiftSummary. */
  onAcceptShift?: (shift: InferredShift) => CompletedShiftSummary;
}

interface UseMissedShiftInferenceResult {
  phase: MissedShiftPhase;
  inferredShift: InferredShift | null;
  onAccept: () => void;
  onReject: () => void;
  onDismissTimeout: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'driver_buddy_msi';
const MIN_PATTERN_SHIFTS = 5;          // Gate 2
const MIN_GPS_MILES = 5;               // Gate 9
const MAX_PROMPTS_PER_DAY = 1;          // Gate 4
const MAX_PROMPTS_PER_WEEK = 2;         // Gate 5
const BREAK_MODE_THRESHOLD = 3;         // Gate 3 — consecutive no-shift days
const DISMISS_DAMPEN_WEEK = 2;          // Gate 6 — rejections in 7 days triggers week suppress
const DISMISS_DAMPEN_YEAR = 4;          // Gate 7 — rejections in tax year triggers hard suppress
const AUTO_DISMISS_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── Persistence ─────────────────────────────────────────────────────────────

const defaultState = (): PersistedState => ({
  lastPromptDate: null,
  weeklyPromptCount: 0,
  lastWeeklyReset: null,
  rejectionLog: [],
  lastTaxYearReset: null,
  taxYearRejections: 0,
  consecutiveNoShiftDays: 0,
  lastConsecutiveCheck: null,
  taxYearSuppression: false,
});

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...(JSON.parse(raw) as Partial<PersistedState>) };
  } catch {
    return defaultState();
  }
}

function saveState(s: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage full or unavailable — degrade gracefully
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // go back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return toUKDateString(d);
}

function getTaxYearStart(): string {
  return ukTaxYearStart();
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / msPerDay;
}

// ─── Gate evaluation ─────────────────────────────────────────────────────────

// ─── Gate evaluation (exported for unit testing) ────────────────────────────

export interface GateResult {
  pass: boolean;
  reason?: string;
}

export function evaluateGates(
  opts: UseMissedShiftInferenceOptions,
  state: PersistedState,
  referenceDate: Date
): GateResult {
  // Gate 1: feature toggle — handled at call site

  const today = referenceDate.toISOString().slice(0, 10);

  // Gate 2: pattern confirmed (≥5 shifts on the same weekday in past 28 days).
  // Reference weekday = the most recent day-of-week that actually has logged shifts.
  // This ensures non-work days (e.g. Saturday when driver works Fridays) don't
  // cause the gate to miss a confirmed pattern.
  const cutoffDate = new Date(referenceDate.getTime() - 28 * 24 * 60 * 60 * 1000);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const recentLogs = opts.dailyLogs.filter((log) => log.date >= cutoff);
  const dayOfWeekCounts = new Map<number, number>();
  for (const log of recentLogs) {
    const dow = new Date(`${log.date}T12:00:00Z`).getUTCDay();
    dayOfWeekCounts.set(dow, (dayOfWeekCounts.get(dow) ?? 0) + 1);
  }
  const bestDow = Array.from(dayOfWeekCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (!bestDow || bestDow[1] < MIN_PATTERN_SHIFTS) {
    return { pass: false, reason: `pattern_not_confirmed` };
  }

  // Gate 3: break mode (consecutive no-shift days)
  const consecutiveNoShift = computeConsecutiveNoShiftDays(opts.dailyLogs, today, state);
  if (consecutiveNoShift >= BREAK_MODE_THRESHOLD) {
    return { pass: false, reason: `break_mode` };
  }

  // Gate 4: daily frequency cap
  if (state.lastPromptDate === today) {
    return { pass: false, reason: `already_prompted_today` };
  }

  // Gate 5: weekly frequency cap
  const thisMonday = getMonday(new Date());
  const weeklyReset = state.lastWeeklyReset ?? thisMonday;
  const currentWeeklyCount = weeklyReset === thisMonday ? state.weeklyPromptCount : 0;
  if (currentWeeklyCount >= MAX_PROMPTS_PER_WEEK) {
    return { pass: false, reason: `weekly_cap_reached` };
  }

  // Gate 6: weekly rejection dampening
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const weekRejections = state.rejectionLog.filter((r) => r.date >= sevenDaysAgo).length;
  if (weekRejections >= DISMISS_DAMPEN_WEEK) {
    return { pass: false, reason: `weekly_dampen` };
  }

  // Gate 7 + 8: tax year suppression
  const taxYearStart = getTaxYearStart();
  const taxYearReset = state.lastTaxYearReset ?? taxYearStart;
  const currentYearRejections = taxYearReset === taxYearStart ? state.taxYearRejections : 0;
  if (state.taxYearSuppression || currentYearRejections >= DISMISS_DAMPEN_YEAR) {
    return { pass: false, reason: `tax_year_suppressed` };
  }

  // Gate 9: GPS route signature (distance threshold)
  if (opts.gpsMilesToday < MIN_GPS_MILES) {
    return { pass: false, reason: `gps_below_threshold` };
  }

  return { pass: true };
}

function computeConsecutiveNoShiftDays(
  logs: DailyWorkLog[],
  today: string,
  state: PersistedState
): number {
  // Work backwards from today — count days with no logged shift
  // Use the persisted count as a cache, resetting when a shift is found
  const lastCheck = state.lastConsecutiveCheck;
  if (lastCheck === today) return state.consecutiveNoShiftDays;

  let count = 0;
  const checkDate = new Date(`${today}T12:00:00Z`);

  while (count < BREAK_MODE_THRESHOLD + 1) {
    const dateStr = toUKDateString(checkDate);
    const hasShift = logs.some((log) => log.date === dateStr);
    if (hasShift) break;
    count++;
    checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  }

  return count;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMissedShiftInference(
  opts: UseMissedShiftInferenceOptions
): UseMissedShiftInferenceResult {
  const { enabled, dailyLogs, settings, gpsMilesToday } = opts;

  const [phase, setPhase] = useState<MissedShiftPhase>('idle');
  const [inferredShift, setInferredShift] = useState<InferredShift | null>(null);
  const inferredShiftRef = useRef<InferredShift | null>(null);
  inferredShiftRef.current = inferredShift;

  const stateRef = useRef<PersistedState>(loadState());
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayRef = useRef(todayUK());

  // Keep today fresh
  useEffect(() => {
    todayRef.current = todayUK();
  });

  const computeShift = useCallback((): InferredShift => {
    const today = todayRef.current;
    const prediction = predictNextShift(dailyLogs, { referenceDate: today });
    return {
      date: today,
      estimatedRevenueMin: Math.round(prediction.estimatedRevenueMin * 100) / 100,
      estimatedRevenueMax: Math.round(prediction.estimatedRevenueMax * 100) / 100,
      estimatedRevenueAvg: Math.round(prediction.estimatedRevenueAvg * 100) / 100,
      provider: prediction.provider,
      hours: prediction.estimatedHours,
    };
  }, [dailyLogs]);

  const persistState = useCallback(() => {
    saveState(stateRef.current);
  }, []);

  const resetForNextWindow = useCallback(() => {
    // Cancel any pending auto-dismiss
    if (autoDismissTimerRef.current !== null) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    setInferredShift(null);
    setPhase('idle');
  }, []);

  // ── Gate evaluation when phase is idle ──────────────────────────────────────
  // Runs whenever any dependency changes. Using functional setState ensures each
  // call reads the current phase at execution time (not the stale closure value),
  // which is critical when phase transitions happen within the same effect chain.
  useEffect(() => {
    if (!enabled) {
      if (phase !== 'idle') resetForNextWindow();
      return;
    }
    if (phase !== 'idle') return;

    const today = todayRef.current;
    const state = stateRef.current;

    // Periodic reset checks (week boundary, tax year boundary)
    let dirty = false;
    const thisMonday = getMonday(new Date());
    if (state.lastWeeklyReset !== thisMonday) {
      stateRef.current = { ...stateRef.current, lastWeeklyReset: thisMonday, weeklyPromptCount: 0 };
      dirty = true;
    }
    const taxYearStart = getTaxYearStart();
    if (state.lastTaxYearReset !== taxYearStart) {
      stateRef.current = {
        ...stateRef.current,
        lastTaxYearReset: taxYearStart,
        taxYearRejections: 0,
        taxYearSuppression: false,
        consecutiveNoShiftDays: 0,
      };
      dirty = true;
    }
    if (dirty) persistState();

    // Check GPS before evaluateGates so we transition to waiting_for_gps
    // instead of silently staying idle (evaluateGates treats GPS as a hard gate).
    if (gpsMilesToday < MIN_GPS_MILES) {
      setPhase('waiting_for_gps');
      return;
    }

    const gates = evaluateGates(opts, stateRef.current, new Date(`${today}T12:00:00Z`));
    if (!gates.pass) return;

    const shift = computeShift();
    setInferredShift(shift);
    stateRef.current.lastPromptDate = today;
    stateRef.current.weeklyPromptCount += 1;
    persistState();
    setPhase('prompting');
  }, [enabled, phase, dailyLogs, settings, gpsMilesToday, resetForNextWindow, computeShift, opts, persistState]);

  // ── When GPS threshold met while in waiting state ────────────────────────────
  useEffect(() => {
    if (gpsMilesToday >= MIN_GPS_MILES) {
      // Use functional update so we read the CURRENT phase, not the stale closure.
      // This avoids the React batching issue where the first effect's setPhase
      // is not yet visible to the second effect in the same render.
      setPhase((prev) => {
        if (prev !== 'waiting_for_gps') return prev;
        const today = todayRef.current;
        const state = stateRef.current;
        if (state.lastPromptDate === today) return 'idle';
        const thisMonday = getMonday(new Date());
        const weeklyReset = state.lastWeeklyReset ?? thisMonday;
        const currentWeeklyCount = weeklyReset === thisMonday ? state.weeklyPromptCount : 0;
        if (currentWeeklyCount >= MAX_PROMPTS_PER_WEEK) return 'idle';
        const shift = computeShift();
        setInferredShift(shift);
        stateRef.current.lastPromptDate = today;
        stateRef.current.weeklyPromptCount += 1;
        persistState();
        return 'prompting';
      });
    }
  }, [gpsMilesToday, phase, computeShift, persistState]); // phase intentionally included

  // ── Auto-dismiss timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'prompting') return;

    autoDismissTimerRef.current = setTimeout(() => {
      // Treat as dismiss for dampening purposes
      const today = todayRef.current;
      stateRef.current.rejectionLog.push({ date: today, kind: 'dismiss' });
      stateRef.current.consecutiveNoShiftDays += 1;
      stateRef.current.lastConsecutiveCheck = today;
      persistState();
      setPhase('timeout');
    }, AUTO_DISMISS_MS);

    return () => {
      if (autoDismissTimerRef.current !== null) {
        clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
    };
  }, [phase, persistState]);

  // ── Accept ──────────────────────────────────────────────────────────────────
  // onAccept is called with no args — the hook resolves the shift from closure
  const onAccept = useCallback(() => {
    if (phase !== 'prompting') return;
    if (autoDismissTimerRef.current !== null) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
    const shift = inferredShiftRef.current;
    if (!shift) return;
    setPhase('accepted');
    if (opts.onAcceptShift) {
      try {
        opts.onAcceptShift(shift);
      } catch (e) {
        console.warn('[MissedShiftInference] onAcceptShift failed:', e);
      }
    }
  }, [phase, opts]); // inferredShift read from ref inside

  // ── Reject ──────────────────────────────────────────────────────────────────
  const onReject = useCallback(() => {
    if (phase !== 'prompting') return;
    if (autoDismissTimerRef.current !== null) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }

    const today = todayRef.current;
    stateRef.current.rejectionLog.push({ date: today, kind: 'reject' });
    stateRef.current.consecutiveNoShiftDays += 1;
    stateRef.current.lastConsecutiveCheck = today;

    // Check dampening thresholds
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const weekRejections = stateRef.current.rejectionLog.filter((r) => r.date >= sevenDaysAgo).length;

    const taxYearStart = getTaxYearStart();
    const taxYearReset = stateRef.current.lastTaxYearReset ?? taxYearStart;
    const currentYearRejections =
      taxYearReset === taxYearStart ? stateRef.current.taxYearRejections : 0;

    const newYearRejections = currentYearRejections + 1;

    if (weekRejections >= DISMISS_DAMPEN_WEEK) {
      // Suppress for the rest of this week
      const endOfWeek = new Date();
      endOfWeek.setUTCDate(endOfWeek.getUTCDate() + (7 - endOfWeek.getUTCDay()));
      stateRef.current.rejectionLog.push({ date: toUKDateString(endOfWeek), kind: 'suppress' });
    }

    if (newYearRejections >= DISMISS_DAMPEN_YEAR) {
      stateRef.current.taxYearSuppression = true;
      stateRef.current.taxYearRejections = newYearRejections;
    } else if (taxYearReset === taxYearStart) {
      stateRef.current.taxYearRejections = newYearRejections;
    }

    persistState();
    setInferredShift(null);
    setPhase('rejected');
  }, [phase, persistState]);

  // ── Dismiss timeout ──────────────────────────────────────────────────────────
  const onDismissTimeout = useCallback(() => {
    resetForNextWindow();
  }, [resetForNextWindow]);

  return { phase, inferredShift, onAccept, onReject, onDismissTimeout };
}

// ─── Reset helper for parent ──────────────────────────────────────────────────
// Called by AppShell after it processes onAccept

export function resetMissedShiftState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
