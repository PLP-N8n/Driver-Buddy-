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
import { openDriverBuddyDB, putShift, putExpense, putTrip, putSetting, putPlayerStats } from '../services/storage';

const DATA_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = 'driver_schema_version';
const IDB_MIGRATED_KEY = '_migrated_v1';

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

      if (cancelled) return warnings;

      const db = await openDriverBuddyDB();
      const alreadyMigrated = await db.get('settings', IDB_MIGRATED_KEY);

      if (!alreadyMigrated) {
        // ── One-time localStorage → IndexedDB migration ──────────────

        const logs = Array.isArray(savedLogs) ? savedLogs : [];
        for (const log of logs) {
          await putShift(db, {
            id: log.id,
            date: log.date,
            status: 'completed',
            primary_platform: log.provider ?? 'Unknown',
            hours_worked: log.hoursWorked ?? 0,
            total_earnings: log.revenue ?? 0,
            started_at: log.startedAt ?? null,
            ended_at: log.endedAt ?? null,
            fuel_liters: log.fuelLiters ?? null,
            job_count: log.jobCount ?? null,
            business_miles: log.milesDriven ?? null,
            notes: log.notes ?? null,
            provider_splits: log.providerSplits ? JSON.stringify(log.providerSplits) : null,
            resolved_from_evidence: '[]',
            last_resolved_at: new Date().toISOString(),
            user_override: 0,
          });
        }

        const trips = Array.isArray(savedTrips) ? savedTrips : [];
        for (const trip of trips) {
          await putTrip(db, {
            ...trip,
            resolved_from_evidence: '[]',
            last_resolved_at: new Date().toISOString(),
            user_override: 0,
          });
        }

        const legacyExpenses = Array.isArray(savedExpenses)
          ? migrateLegacyExpenses(savedExpenses, savedSettings?.claimMethod ?? 'SIMPLIFIED')
          : [];
        for (const expense of legacyExpenses) {
          await putExpense(db, {
            ...expense,
            resolved_from_evidence: '[]',
            last_resolved_at: new Date().toISOString(),
            user_override: 0,
          });
        }

        if (savedSettings) await putSetting(db, 'data', normalizeSettings(savedSettings));
        if (savedStats) await putPlayerStats(db, savedStats);

        await putSetting(db, IDB_MIGRATED_KEY, '1');

        try {
          localStorage.removeItem('driver_trips');
          localStorage.removeItem('driver_expenses');
          localStorage.removeItem('driver_daily_logs');
          localStorage.removeItem('driver_settings');
          localStorage.removeItem('driver_player_stats');
        } catch {
          // localStorage clear is best-effort
        }
      }

      if (cancelled) return warnings;

      // ── Populate state from IndexedDB ──────────────────────────────

      const [idbShifts, idbTrips, idbExpenses, idbSettings, idbStats] = await Promise.all([
        db.getAll('shifts'),
        db.getAll('trips'),
        db.getAll('expenses'),
        db.get('settings', 'data'),
        db.get('player_stats', 'singleton'),
      ]);

      if (cancelled) return warnings;

      const workLogs: DailyWorkLog[] = (idbShifts as any[]).map((s) => ({
        id: s.id,
        date: s.date,
        provider: s.primary_platform ?? 'Unknown',
        hoursWorked: s.hours_worked ?? 0,
        revenue: s.total_earnings ?? 0,
        notes: s.notes ?? undefined,
        fuelLiters: s.fuel_liters ?? undefined,
        jobCount: s.job_count ?? undefined,
        milesDriven: s.business_miles ?? undefined,
        startedAt: s.started_at ?? undefined,
        endedAt: s.ended_at ?? undefined,
        providerSplits: typeof s.provider_splits === 'string' ? JSON.parse(s.provider_splits) : undefined,
      }));

      setDailyLogs(filterSubsumedLogs(workLogs));
      setTrips(idbTrips as Trip[]);

      try {
        const prepared = await prepareExpensesForLocalState(idbExpenses as Expense[]);
        if (!cancelled) setExpenses(prepared);
      } catch (error) {
        warnings.push(reportHydrationWarning('Failed to prepare stored expenses during hydration.', error));
        if (!cancelled) setExpenses(idbExpenses as Expense[]);
      }

      if (idbSettings) setSettings(normalizeSettings(idbSettings as StoredSettings));
      if (idbStats) setPlayerStats(idbStats as PlayerStats);
      if (savedActiveSession) setActiveSession(savedActiveSession);
      if (savedCompletedShiftSummary) setCompletedShiftSummary(savedCompletedShiftSummary);

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
