import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ActiveWorkSession,
  CompletedShiftSummary,
  DailyWorkLog,
  Expense,
  PlayerStats,
  Settings,
  Trip,
} from '../types';
import * as Sentry from '../src/sentry';
import { getBackupCode } from '../services/deviceId';
import { initOPFS } from '../services/opfsStore';
import { normalizeSettings, type StoredSettings } from '../services/settingsService';
import { prepareExpensesForLocalState } from '../services/syncTransforms';

const parseStoredJson = <T,>(key: string): T | null => {
  const value = localStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    Sentry.captureException(error);
    console.error(`Failed to parse localStorage key "${key}"`, error);
    return null;
  }
};

type UseHydrationParams = {
  setTrips: Dispatch<SetStateAction<Trip[]>>;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  setDailyLogs: Dispatch<SetStateAction<DailyWorkLog[]>>;
  setActiveSession: Dispatch<SetStateAction<ActiveWorkSession | null>>;
  setCompletedShiftSummary: Dispatch<SetStateAction<CompletedShiftSummary | null>>;
  setSettings: Dispatch<SetStateAction<Settings>>;
  setPlayerStats: Dispatch<SetStateAction<PlayerStats>>;
  setHasHydrated: Dispatch<SetStateAction<boolean>>;
  setBackupCode: Dispatch<SetStateAction<string>>;
};

export function useHydration({
  setTrips,
  setExpenses,
  setDailyLogs,
  setActiveSession,
  setCompletedShiftSummary,
  setSettings,
  setPlayerStats,
  setHasHydrated,
  setBackupCode,
}: UseHydrationParams) {
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const savedTrips = parseStoredJson<Trip[]>('driver_trips');
      const savedExpenses = parseStoredJson<Expense[]>('driver_expenses');
      const savedLogs = parseStoredJson<DailyWorkLog[]>('driver_daily_logs');
      const savedActiveSession = parseStoredJson<ActiveWorkSession>('driver_active_session');
      const savedCompletedShiftSummary = parseStoredJson<CompletedShiftSummary>('driver_completed_shift_summary');
      const savedSettings = parseStoredJson<StoredSettings>('driver_settings');
      const savedStats = parseStoredJson<PlayerStats>('driver_player_stats');
      const nextBackupCode = getBackupCode();

      if (cancelled) return;

      if (Array.isArray(savedTrips)) setTrips(savedTrips);
      if (Array.isArray(savedExpenses)) {
        const preparedExpenses = await prepareExpensesForLocalState(savedExpenses);
        if (!cancelled) setExpenses(preparedExpenses);
      }
      if (Array.isArray(savedLogs)) setDailyLogs(savedLogs);
      if (savedActiveSession) setActiveSession(savedActiveSession);
      if (savedCompletedShiftSummary) setCompletedShiftSummary(savedCompletedShiftSummary);
      if (savedSettings) setSettings(normalizeSettings(savedSettings));
      if (savedStats) setPlayerStats(savedStats);

      if (!cancelled) {
        setBackupCode(nextBackupCode);
        setHasHydrated(true);
      }
    };

    void initOPFS();
    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [
    setActiveSession,
    setBackupCode,
    setCompletedShiftSummary,
    setDailyLogs,
    setExpenses,
    setHasHydrated,
    setPlayerStats,
    setSettings,
    setTrips,
  ]);
}
