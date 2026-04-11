import { useEffect, useState } from 'react';
import type { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { onSyncStatus, retryPendingPush, schedulePush, type SyncStatus } from '../services/syncService';
import { buildSyncPayload } from '../services/syncTransforms';
import { useConnectivity } from './useConnectivity';

type UseSyncOrchestratorParams = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  hasHydrated: boolean;
};

export function useSyncOrchestrator({
  trips,
  expenses,
  dailyLogs,
  settings,
  hasHydrated,
}: UseSyncOrchestratorParams) {
  const { isOnline, connectivityBanner } = useConnectivity();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  useEffect(() => onSyncStatus(setSyncStatus), []);

  useEffect(() => {
    if (!isOnline) return;
    void retryPendingPush();
  }, [isOnline]);

  useEffect(() => {
    if (!hasHydrated) return;
    schedulePush(buildSyncPayload(trips, expenses, dailyLogs, settings));
  }, [dailyLogs, expenses, hasHydrated, settings, trips]);

  return { isOnline, connectivityBanner, syncStatus };
}
