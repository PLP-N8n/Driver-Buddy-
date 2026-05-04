import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { DailyWorkLog, Expense, Settings, Trip } from '../types';
import {
  isSyncConfigured,
  mergePulledData,
  onPushSuccess,
  onSyncStatus,
  pull,
  retryPendingPush,
  schedulePush,
  type MergedSyncState,
  type SyncStatus,
} from '../services/syncService';
import { buildSyncPayload, prepareExpensesForLocalState } from '../services/syncTransforms';
import { filterSubsumedLogs } from '../utils/platformInsights';
import { useConnectivity } from './useConnectivity';

const FOCUS_PULL_DEBOUNCE_MS = 2000;

type DeletedIdsState = {
  workLogs: string[];
  mileageLogs: string[];
  expenses: string[];
  shifts: string[];
};

type LocalSyncState = MergedSyncState & {
  deletedIds: DeletedIdsState;
};

type UseSyncOrchestratorParams = {
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
  onPushSuccess?: () => void;
};

function isEqualSyncState<T>(current: T, next: T): boolean {
  return JSON.stringify(current) === JSON.stringify(next);
}

function keepCurrentIfEqual<T>(current: T, next: T): T {
  return isEqualSyncState(current, next) ? current : next;
}


function preserveLocallyDeletedRecords(mergedData: MergedSyncState, deletedIds: DeletedIdsState): MergedSyncState {
  const deletedWorkLogIds = new Set([...deletedIds.workLogs, ...deletedIds.shifts]);
  const deletedMileageIds = new Set(deletedIds.mileageLogs);
  const deletedExpenseIds = new Set(deletedIds.expenses);

  return {
    trips: mergedData.trips.filter((trip) => !deletedMileageIds.has(trip.id)),
    dailyLogs: mergedData.dailyLogs.filter((log) => !deletedWorkLogIds.has(log.id)),
    expenses: mergedData.expenses.filter((expense) => !deletedExpenseIds.has(expense.id)),
    settings: mergedData.settings,
  };
}

export function useSyncOrchestrator({
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
  onPushSuccess: handlePushSuccess,
}: UseSyncOrchestratorParams) {
  const { isOnline, connectivityBanner } = useConnectivity();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const latestStateRef = useRef<LocalSyncState>({ trips, expenses, dailyLogs, settings, deletedIds });
  const hasPulledOnStartRef = useRef(false);
  const isPullingRef = useRef(false);
  const focusPullTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => onSyncStatus(setSyncStatus), []);
  useEffect(() => (handlePushSuccess ? onPushSuccess(handlePushSuccess) : undefined), [handlePushSuccess]);

  useEffect(() => {
    latestStateRef.current = { trips, expenses, dailyLogs, settings, deletedIds };
  }, [dailyLogs, deletedIds, expenses, settings, trips]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (focusPullTimerRef.current) {
        clearTimeout(focusPullTimerRef.current);
        focusPullTimerRef.current = null;
      }
    };
  }, []);

  const pullAndMergeLatest = useMemo(
    () => async (): Promise<boolean> => {
      if (!hasHydrated || !isOnline || !isSyncConfigured() || isPullingRef.current) return false;

      isPullingRef.current = true;
      try {
        const pulledData = await pull();
        if (!pulledData || !isMountedRef.current) return true;

      const stateAtMerge = latestStateRef.current;
      const mergedData = preserveLocallyDeletedRecords(
        mergePulledData(stateAtMerge, pulledData),
        stateAtMerge.deletedIds
      );
      const restoredExpenses = await prepareExpensesForLocalState(mergedData.expenses);
      if (!isMountedRef.current) return true;

        const nextState = {
          ...mergedData,
        expenses: restoredExpenses,
      };

      setTrips((current) =>
        isEqualSyncState(current, stateAtMerge.trips) ? keepCurrentIfEqual(current, nextState.trips) : current
      );
      setDailyLogs((current) =>
        isEqualSyncState(current, stateAtMerge.dailyLogs) ? keepCurrentIfEqual(current, filterSubsumedLogs(nextState.dailyLogs)) : current
      );
      setExpenses((current) =>
        isEqualSyncState(current, stateAtMerge.expenses) ? keepCurrentIfEqual(current, nextState.expenses) : current
      );
      setSettings((current) =>
        isEqualSyncState(current, stateAtMerge.settings) ? keepCurrentIfEqual(current, nextState.settings) : current
      );
      return true;
      } finally {
        isPullingRef.current = false;
      }
    },
    [hasHydrated, isOnline, setDailyLogs, setExpenses, setSettings, setTrips]
  );

  useEffect(() => {
    if (!isOnline) return;
    void retryPendingPush();
  }, [isOnline]);

  useEffect(() => {
    if (!hasHydrated || hasPulledOnStartRef.current) return;

    void pullAndMergeLatest().then((attempted: boolean) => {
      if (attempted) hasPulledOnStartRef.current = true;
    });
  }, [hasHydrated, pullAndMergeLatest]);

  useEffect(() => {
    if (!hasHydrated) return;

    const scheduleFocusPull = () => {
      if (focusPullTimerRef.current) clearTimeout(focusPullTimerRef.current);

      focusPullTimerRef.current = setTimeout(() => {
        focusPullTimerRef.current = null;
        void pullAndMergeLatest();
      }, FOCUS_PULL_DEBOUNCE_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleFocusPull();
    };

    window.addEventListener('focus', scheduleFocusPull);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', scheduleFocusPull);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (focusPullTimerRef.current) {
        clearTimeout(focusPullTimerRef.current);
        focusPullTimerRef.current = null;
      }
    };
  }, [hasHydrated, pullAndMergeLatest]);

  useEffect(() => {
    if (!hasHydrated) return;
    schedulePush(buildSyncPayload(trips, expenses, dailyLogs, settings, deletedIds));
  }, [dailyLogs, deletedIds, expenses, hasHydrated, settings, trips]);

  return { isOnline, connectivityBanner, syncStatus };
}
