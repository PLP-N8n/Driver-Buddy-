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
import { migrateLegacyExpenses } from '../shared/migrations/migrateExpense';
import { filterSubsumedLogs } from '../utils/platformInsights';

const DATA_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = 'driver_schema_version';

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

    const reportHydrationWarning = (message: string, error: unknown) => {
      Sentry.captureException(error);
      console.warn(message, error);
      return message;
    };

    const hydrateStoredData = async (): Promise<string[]> => {
      const warnings: string[] = [];
      const savedTrips = parseStoredJson<Trip[]>('driver_trips');
      const savedExpenses = parseStoredJson<Expense[]>('driver_expenses');
      const savedLogs = parseStoredJson<DailyWorkLog[]>('driver_daily_logs');
      const savedActiveSession = parseStoredJson<ActiveWorkSession>('driver_active_session');
      const savedCompletedShiftSummary = parseStoredJson<CompletedShiftSummary>('driver_completed_shift_summary');
      const savedSettings = parseStoredJson<StoredSettings>('driver_settings');
      const savedStats = parseStoredJson<PlayerStats>('driver_player_stats');
      const serializedSavedLogs = Array.isArray(savedLogs) ? JSON.stringify(savedLogs) : null;
      const serializedSavedExpenses = Array.isArray(savedExpenses) ? JSON.stringify(savedExpenses) : null;
      const migratedWorkLogs = Array.isArray(savedLogs) ? savedLogs : null;
      const migratedExpenses = Array.isArray(savedExpenses)
        ? (migrateLegacyExpenses(savedExpenses, savedSettings?.claimMethod ?? 'SIMPLIFIED') as Expense[])
        : null;

      if (cancelled) return warnings;

      if (Array.isArray(savedTrips)) setTrips(savedTrips);
      if (Array.isArray(migratedExpenses)) {
        try {
          const preparedExpenses = await prepareExpensesForLocalState(migratedExpenses);
          if (cancelled) return warnings;

          setExpenses(preparedExpenses);
          const serializedPreparedExpenses = JSON.stringify(preparedExpenses);
          if (serializedPreparedExpenses !== serializedSavedExpenses) {
            localStorage.setItem('driver_expenses', serializedPreparedExpenses);
          }
        } catch (error) {
          warnings.push(reportHydrationWarning('Failed to prepare stored expenses during hydration.', error));
          if (cancelled) return warnings;
          setExpenses(migratedExpenses);
        }
      }
      if (Array.isArray(migratedWorkLogs)) {
        const dedupedWorkLogs = filterSubsumedLogs(migratedWorkLogs);
        setDailyLogs(dedupedWorkLogs);
        const serializedDedupedWorkLogs = JSON.stringify(dedupedWorkLogs);
        if (serializedDedupedWorkLogs !== serializedSavedLogs) {
          localStorage.setItem('driver_daily_logs', serializedDedupedWorkLogs);
        }
      }
      if (savedActiveSession) setActiveSession(savedActiveSession);
      if (savedCompletedShiftSummary) setCompletedShiftSummary(savedCompletedShiftSummary);
      if (savedSettings) setSettings(normalizeSettings(savedSettings));
      if (savedStats) setPlayerStats(savedStats);

      return warnings;
    };

    const hydrate = async () => {
      const opfsInit = initOPFS()
        .then(() => null)
        .catch((error) => reportHydrationWarning('Failed to initialize receipt storage during hydration.', error));
      const [opfsWarning, storedDataWarnings] = await Promise.all([opfsInit, hydrateStoredData()]);

      if (!cancelled) {
        const warnings = [
          ...(opfsWarning ? [opfsWarning] : []),
          ...storedDataWarnings,
        ];
        if (warnings.length > 0) {
          console.warn(`Driver Buddy hydrated with warnings: ${warnings.join(' ')}`);
        }
        localStorage.setItem(SCHEMA_VERSION_KEY, String(DATA_SCHEMA_VERSION));
        setBackupCode(getBackupCode());
        setHasHydrated(true);
      }
    };

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
