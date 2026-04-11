import { useEffect, useMemo } from 'react';
import { debounce } from 'es-toolkit';
import type {
  ActiveWorkSession,
  AppTab,
  CompletedShiftSummary,
  DailyWorkLog,
  Expense,
  PlayerStats,
  Settings,
  Trip,
} from '../types';
import { sanitizeExpenseForStorage } from '../services/syncTransforms';
import type { ToastState } from './useAppState';

type UsePersistenceParams = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  activeSession: ActiveWorkSession | null;
  completedShiftSummary: CompletedShiftSummary | null;
  settings: Settings;
  playerStats: PlayerStats;
  activeTab: AppTab;
  isAdvancedUser: boolean;
  showToast: (message: string, type?: ToastState['type'], duration?: number) => void;
};

export function usePersistence({
  trips,
  expenses,
  dailyLogs,
  activeSession,
  completedShiftSummary,
  settings,
  playerStats,
  activeTab,
  isAdvancedUser,
  showToast,
}: UsePersistenceParams) {
  const persistTrips = useMemo(
    () => debounce((nextTrips: Trip[]) => localStorage.setItem('driver_trips', JSON.stringify(nextTrips)), 500),
    []
  );
  const persistExpenses = useMemo(
    () =>
      debounce(
        (nextExpenses: Expense[]) =>
          localStorage.setItem('driver_expenses', JSON.stringify(nextExpenses.map(sanitizeExpenseForStorage))),
        500
      ),
    []
  );
  const persistDailyLogs = useMemo(
    () =>
      debounce(
        (nextDailyLogs: DailyWorkLog[]) => localStorage.setItem('driver_daily_logs', JSON.stringify(nextDailyLogs)),
        500
      ),
    []
  );
  const persistSettings = useMemo(
    () => debounce((nextSettings: Settings) => localStorage.setItem('driver_settings', JSON.stringify(nextSettings)), 500),
    []
  );
  const persistPlayerStats = useMemo(
    () =>
      debounce(
        (nextPlayerStats: PlayerStats) =>
          localStorage.setItem('driver_player_stats', JSON.stringify(nextPlayerStats)),
        500
      ),
    []
  );

  useEffect(() => {
    persistTrips(trips);
  }, [persistTrips, trips]);

  useEffect(() => {
    persistExpenses(expenses);
  }, [expenses, persistExpenses]);

  useEffect(() => {
    persistDailyLogs(dailyLogs);
  }, [dailyLogs, persistDailyLogs]);

  useEffect(() => {
    if (activeSession) {
      localStorage.setItem('driver_active_session', JSON.stringify(activeSession));
      return;
    }

    localStorage.removeItem('driver_active_session');
  }, [activeSession]);

  useEffect(() => {
    if (completedShiftSummary) {
      localStorage.setItem('driver_completed_shift_summary', JSON.stringify(completedShiftSummary));
      return;
    }

    localStorage.removeItem('driver_completed_shift_summary');
  }, [completedShiftSummary]);

  useEffect(() => {
    persistSettings(settings);
  }, [persistSettings, settings]);

  useEffect(() => {
    persistPlayerStats(playerStats);
  }, [persistPlayerStats, playerStats]);

  useEffect(
    () => () => {
      persistTrips.flush();
      persistExpenses.flush();
      persistDailyLogs.flush();
      persistSettings.flush();
      persistPlayerStats.flush();
    },
    [persistDailyLogs, persistExpenses, persistPlayerStats, persistSettings, persistTrips]
  );


  useEffect(() => {
    if (!isAdvancedUser) return;
    if (localStorage.getItem('dbt_featuresUnlocked') === 'true') return;
    localStorage.setItem('dbt_featuresUnlocked', 'true');
    showToast("You've unlocked all features", 'info');
  }, [isAdvancedUser, showToast]);

  useEffect(() => {
    if (activeTab === 'settings') {
      localStorage.setItem('dtpro_settings_visited', 'true');
    }
  }, [activeTab]);
}
