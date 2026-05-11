import React, { type Dispatch, type SetStateAction } from 'react';
import type { DailyWorkLog, Expense, Settings, Trip } from '../../types';
import { useSyncOrchestrator } from '../../hooks/useSyncOrchestrator';
import type { SyncStatus } from '../../services/syncService';

type DeletedIdsState = {
  workLogs: string[];
  mileageLogs: string[];
  expenses: string[];
  shifts: string[];
};

interface UseSyncProviderParams {
  trips: Trip[];
  setTrips: Dispatch<SetStateAction<Trip[]>>;
  expenses: Expense[];
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  dailyLogs: DailyWorkLog[];
  setDailyLogs: Dispatch<SetStateAction<DailyWorkLog[]>>;
  settings: Settings;
  setSettings: Dispatch<SetStateAction<Settings>>;
  deletedIds: DeletedIdsState;
  hasHydrated: boolean;
  onPushSuccess: () => void;
}

export interface SyncProviderResult {
  isOnline: boolean;
  connectivityBanner: string | null;
  syncStatus: SyncStatus;
  triggerPull: () => Promise<boolean>;
  ConnectivityBanner: React.ReactNode;
}

export function useSyncProvider({
  trips,
  setTrips,
  expenses,
  setExpenses,
  dailyLogs,
  setDailyLogs,
  settings,
  setSettings,
  deletedIds,
  hasHydrated,
  onPushSuccess,
}: UseSyncProviderParams): SyncProviderResult {
  const { isOnline, connectivityBanner: rawBanner, syncStatus, triggerPull } = useSyncOrchestrator({
    trips,
    setTrips,
    expenses,
    setExpenses,
    dailyLogs,
    setDailyLogs,
    settings,
    setSettings,
    deletedIds,
    hasHydrated,
    onPushSuccess,
  });

  const ConnectivityBanner = rawBanner ? (
    <div
      data-testid="offline-banner"
      className="fixed inset-x-0 top-[72px] z-40 border-b border-surface-border bg-surface/95 px-4 py-2 text-center text-sm text-slate-200 backdrop-blur-xl"
    >
      {rawBanner === 'offline'
        ? "You're offline - your data is safe and saved locally"
        : 'Back online'}
    </div>
  ) : null;

  return { isOnline, connectivityBanner: rawBanner, syncStatus, triggerPull, ConnectivityBanner };
}
