import { useEffect, useState } from 'react';
import type { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { onPushSuccess, onSyncStatus, retryPendingPush, schedulePush, type SyncStatus } from '../services/syncService';
import { buildSyncPayload } from '../services/syncTransforms';
import { useConnectivity } from './useConnectivity';

type DeletedIdsState = {
  workLogs: string[];
  mileageLogs: string[];
  expenses: string[];
  shifts: string[];
};

type UseSyncOrchestratorParams = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  deletedIds: DeletedIdsState;
  hasHydrated: boolean;
  onPushSuccess?: () => void;
};

export function useSyncOrchestrator({
  trips,
  expenses,
  dailyLogs,
  settings,
  deletedIds,
  hasHydrated,
  onPushSuccess: handlePushSuccess,
}: UseSyncOrchestratorParams) {
  const { isOnline, connectivityBanner } = useConnectivity();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  useEffect(() => onSyncStatus(setSyncStatus), []);
  useEffect(() => (handlePushSuccess ? onPushSuccess(handlePushSuccess) : undefined), [handlePushSuccess]);

  useEffect(() => {
    if (!isOnline) return;
    void retryPendingPush();
  }, [isOnline]);

  useEffect(() => {
    if (!hasHydrated) return;
    schedulePush(buildSyncPayload(trips, expenses, dailyLogs, settings, deletedIds));
  }, [dailyLogs, deletedIds, expenses, hasHydrated, settings, trips]);

  return { isOnline, connectivityBanner, syncStatus };
}
