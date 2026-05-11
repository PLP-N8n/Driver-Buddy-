import { useEffect, useMemo, useRef } from 'react';
import { debounce } from 'es-toolkit';
import type { IDBPDatabase } from 'idb';
import { openDriverBuddyDB, putShift, putExpense, putTrip, putSetting, putPlayerStats } from '../services/storage';
import { sanitizeExpenseForStorage } from '../services/syncTransforms';
import { migrateDailyWorkLog } from '../shared/migrations/migrateShift';
import type {
  AppTab,
  DailyWorkLog,
  Expense,
  PlayerStats,
  Settings,
  Trip,
} from '../types';

type UseStorageParams = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  playerStats: PlayerStats;
  activeTab: AppTab;
};

export function useStorage({
  trips,
  expenses,
  dailyLogs,
  settings,
  playerStats,
  activeTab,
}: UseStorageParams) {
  const dbRef = useRef<IDBPDatabase | null>(null);

  useEffect(() => {
    openDriverBuddyDB().then((db) => { dbRef.current = db; });
    return () => {
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  const persistShifts = useMemo(
    () => debounce(async (nextLogs: DailyWorkLog[], db: IDBPDatabase | null) => {
      if (!db) return;
      for (const log of nextLogs) {
        const shiftEntry = migrateDailyWorkLog(log);
        await putShift(db, { ...shiftEntry, id: log.id });
      }
    }, 500),
    [],
  );

  const persistExpenses = useMemo(
    () => debounce(async (nextExpenses: Expense[], db: IDBPDatabase | null) => {
      if (!db) return;
      for (const expense of nextExpenses) {
        await putExpense(db, sanitizeExpenseForStorage(expense) as unknown as Record<string, unknown>);
      }
    }, 500),
    [],
  );

  const persistTrips = useMemo(
    () => debounce(async (nextTrips: Trip[], db: IDBPDatabase | null) => {
      if (!db) return;
      for (const trip of nextTrips) {
        await putTrip(db, trip as unknown as Record<string, unknown>);
      }
    }, 500),
    [],
  );

  const persistSettings = useMemo(
    () => debounce(async (nextSettings: Settings, db: IDBPDatabase | null) => {
      if (!db) return;
      await putSetting(db, 'data', nextSettings);
    }, 500),
    [],
  );

  const persistPlayerStats = useMemo(
    () => debounce(async (nextStats: PlayerStats, db: IDBPDatabase | null) => {
      if (!db) return;
      await putPlayerStats(db, nextStats);
    }, 500),
    [],
  );

  useEffect(() => {
    persistShifts(dailyLogs, dbRef.current);
  }, [dailyLogs, persistShifts]);

  useEffect(() => {
    persistExpenses(expenses, dbRef.current);
  }, [expenses, persistExpenses]);

  useEffect(() => {
    persistTrips(trips, dbRef.current);
  }, [trips, persistTrips]);

  useEffect(() => {
    persistSettings(settings, dbRef.current);
  }, [settings, persistSettings]);

  useEffect(() => {
    persistPlayerStats(playerStats, dbRef.current);
  }, [playerStats, persistPlayerStats]);

  // Flush on unmount
  useEffect(() => () => {
    persistShifts.flush();
    persistExpenses.flush();
    persistTrips.flush();
    persistSettings.flush();
    persistPlayerStats.flush();
  }, [persistShifts, persistExpenses, persistTrips, persistSettings, persistPlayerStats]);

  // Track settings visited
  useEffect(() => {
    if (activeTab === 'settings' && dbRef.current) {
      putSetting(dbRef.current, 'dtpro_settings_visited', 'true');
    }
  }, [activeTab]);
}
