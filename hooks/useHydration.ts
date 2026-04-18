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
import { migrateDailyWorkLog } from '../shared/migrations/migrateShift';
import { migrateLegacyExpenses } from '../shared/migrations/migrateExpense';

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
      const serializedSavedLogs = Array.isArray(savedLogs) ? JSON.stringify(savedLogs) : null;
      const serializedSavedExpenses = Array.isArray(savedExpenses) ? JSON.stringify(savedExpenses) : null;
      const tripsById = new Map((savedTrips ?? []).map((trip) => [trip.id, trip]));
      const migratedWorkLogs = Array.isArray(savedLogs)
        ? savedLogs.map((log) => ({
            ...log,
            ...migrateDailyWorkLog(log, log.linkedTripId ? tripsById.get(log.linkedTripId) : undefined),
          }))
        : null;
      const migratedExpenses = Array.isArray(savedExpenses)
        ? (migrateLegacyExpenses(savedExpenses, savedSettings?.claimMethod ?? 'SIMPLIFIED') as Expense[])
        : null;

      if (cancelled) return;

      if (Array.isArray(savedTrips)) setTrips(savedTrips);
      if (Array.isArray(migratedExpenses)) {
        const preparedExpenses = await prepareExpensesForLocalState(migratedExpenses);
        if (cancelled) return;

        setExpenses(preparedExpenses);
        const serializedPreparedExpenses = JSON.stringify(preparedExpenses);
        if (serializedPreparedExpenses !== serializedSavedExpenses) {
          localStorage.setItem('driver_expenses', serializedPreparedExpenses);
        }
      }
      if (Array.isArray(migratedWorkLogs)) {
        setDailyLogs(migratedWorkLogs);
        const serializedMigratedWorkLogs = JSON.stringify(migratedWorkLogs);
        if (serializedMigratedWorkLogs !== serializedSavedLogs) {
          localStorage.setItem('driver_daily_logs', serializedMigratedWorkLogs);
        }
      }
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
