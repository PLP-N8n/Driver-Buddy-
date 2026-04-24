import React, { useEffect, useState } from 'react';
import { DailyWorkLog, Expense, PlayerStats, Settings, SyncPullPayload, Trip } from '../types';
import { commitRecoveryCode, getBackupCode, parseRecoveryCode } from '../services/deviceId';
import { normalizeSettings } from '../services/settingsService';
import { clearRegistrationCache, clearSessionCache, getLastDeviceCount } from '../services/sessionManager';
import { isSyncConfigured, mergePulledData, pull } from '../services/syncService';
import {
  prepareExpensesForLocalState,
} from '../services/syncTransforms';
import * as Sentry from '../src/sentry';
import { todayUK } from '../utils/ukDate';

const LEGACY_BACKUP_CODE_KEY = 'backup_code';
const ACCOUNT_ID_KEY = 'drivertax_device_id';
const DEVICE_SECRET_KEY = 'driver_device_secret';

function isObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null);
}

function isValidRestorePayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;

  const record = data as Record<string, unknown>;
  const hasData =
    Array.isArray(record.dailyLogs) ||
    Array.isArray(record.expenses) ||
    Array.isArray(record.workLogs) ||
    Array.isArray(record.mileageLogs) ||
    Array.isArray(record.trips);

  if (!hasData) return false;

  if (Array.isArray(record.dailyLogs) && !isObjectArray(record.dailyLogs)) return false;
  if (Array.isArray(record.expenses) && !isObjectArray(record.expenses)) return false;
  if (Array.isArray(record.workLogs) && !isObjectArray(record.workLogs)) return false;
  if (Array.isArray(record.mileageLogs) && !isObjectArray(record.mileageLogs)) return false;
  if (Array.isArray(record.trips) && !isObjectArray(record.trips)) return false;

  return true;
}

type RestorePayload = Partial<{
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  playerStats: PlayerStats;
  version: string;
  exportDate: string;
  workLogs: SyncPullPayload['workLogs'];
  mileageLogs: SyncPullPayload['mileageLogs'];
}>;

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ShowToast = (message: string, type?: ToastType, duration?: number) => void;

type RestoreRecordCounts = {
  trips: number;
  expenses: number;
  dailyLogs: number;
  settings: number;
};

export type RestoreReviewSummary = {
  local: RestoreRecordCounts;
  cloud: RestoreRecordCounts;
  conflicts: RestoreRecordCounts;
  merged: RestoreRecordCounts;
  mode: 'keep-newest';
};

export type PendingRestoreReview = {
  code: string;
  accountId: string;
  deviceSecret: string;
  pulledData: SyncPullPayload;
  summary: RestoreReviewSummary;
};

interface UseBackupRestoreParams {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  playerStats: PlayerStats;
  showToast: ShowToast;
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setDailyLogs: React.Dispatch<React.SetStateAction<DailyWorkLog[]>>;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  setPlayerStats: React.Dispatch<React.SetStateAction<PlayerStats>>;
  triggerTextDownload: (filename: string, content: string, mimeType: string) => void;
  queueDownload: (count: number, fn: () => void) => void;
  clearDeletedIds?: () => void;
}

export function useBackupRestore({
  trips,
  expenses,
  dailyLogs,
  settings,
  playerStats,
  showToast,
  setTrips,
  setExpenses,
  setDailyLogs,
  setSettings,
  setPlayerStats,
  triggerTextDownload,
  queueDownload,
  clearDeletedIds,
}: UseBackupRestoreParams) {
  const [backupCode, setBackupCode] = useState(() => getBackupCode());
  const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null);
  const [pendingRestoreReview, setPendingRestoreReview] = useState<PendingRestoreReview | null>(null);
  const [isPreparingRestore, setIsPreparingRestore] = useState(false);
  const [isApplyingRestore, setIsApplyingRestore] = useState(false);

  useEffect(() => {
    localStorage.removeItem('pending_identity');
  }, []);

  const writeRestoredData = async (pulledData: SyncPullPayload) => {
    const mergedData = mergePulledData(
      {
        trips,
        expenses,
        dailyLogs,
        settings,
      },
      pulledData
    );
    const restoredExpenses = await prepareExpensesForLocalState(mergedData.expenses);

    localStorage.setItem('driver_trips', JSON.stringify(mergedData.trips));
    localStorage.setItem('driver_daily_logs', JSON.stringify(mergedData.dailyLogs));
    localStorage.setItem('driver_expenses', JSON.stringify(restoredExpenses));
    if (pulledData.settings) {
      localStorage.setItem('driver_settings', JSON.stringify(mergedData.settings));
    }

    setTrips(mergedData.trips);
    setDailyLogs(mergedData.dailyLogs);
    setExpenses(restoredExpenses);
    if (pulledData.settings) setSettings(mergedData.settings);

    return {
      restoredLogs: mergedData.dailyLogs.length,
      restoredExpenses: restoredExpenses.length,
    };
  };

  const countOverlappingChanges = <LocalRecord extends { id: string; updatedAt?: string }, CloudRecord extends { id: string; updated_at?: string | null }>(
    localRecords: LocalRecord[],
    cloudRecords: CloudRecord[]
  ) => {
    const localById = new Map(localRecords.map((record) => [record.id, record.updatedAt ?? '']));

    return cloudRecords.reduce((count, record) => {
      const localUpdatedAt = localById.get(record.id);
      if (localUpdatedAt === undefined) return count;
      return localUpdatedAt !== (record.updated_at ?? '') ? count + 1 : count;
    }, 0);
  };

  const buildRestoreReview = (code: string, accountId: string, deviceSecret: string, pulledData: SyncPullPayload): PendingRestoreReview => {
    const mergedData = mergePulledData(
      {
        trips,
        expenses,
        dailyLogs,
        settings,
      },
      pulledData
    );

    const cloudDailyLogs = pulledData.shifts?.length ? pulledData.shifts : pulledData.workLogs ?? [];
    const localSettingsUpdatedAt = settings.updatedAt ?? '';
    const cloudSettingsUpdatedAt = pulledData.settings?.updatedAt ?? '';

    return {
      code,
      accountId,
      deviceSecret,
      pulledData,
      summary: {
        local: {
          trips: trips.length,
          expenses: expenses.length,
          dailyLogs: dailyLogs.length,
          settings: 1,
        },
        cloud: {
          trips: pulledData.mileageLogs?.length ?? 0,
          expenses: pulledData.expenses?.length ?? 0,
          dailyLogs: cloudDailyLogs.length,
          settings: pulledData.settings ? 1 : 0,
        },
        conflicts: {
          trips: countOverlappingChanges(trips, pulledData.mileageLogs ?? []),
          expenses: countOverlappingChanges(expenses, pulledData.expenses ?? []),
          dailyLogs: countOverlappingChanges(dailyLogs, cloudDailyLogs),
          settings: pulledData.settings && localSettingsUpdatedAt !== cloudSettingsUpdatedAt ? 1 : 0,
        },
        merged: {
          trips: mergedData.trips.length,
          expenses: mergedData.expenses.length,
          dailyLogs: mergedData.dailyLogs.length,
          settings: 1,
        },
        mode: 'keep-newest',
      },
    };
  };

  const backup = () =>
    {
      const content = JSON.stringify(
        { trips, expenses, dailyLogs, settings, playerStats, version: '1.0', exportDate: new Date(Date.now()).toISOString() },
        null,
        2
      );
      const backupBlob = new Blob([content], { type: 'application/json' }) as Blob & {
        text?: () => Promise<string>;
      };

      backupBlob.text = async () => content;
      return backupBlob;
    };

  const handleBackup = () => {
    const backupBlob = backup();
    queueDownload(trips.length + expenses.length + dailyLogs.length, () => {
      void backupBlob.text().then((content) => {
        triggerTextDownload(
          `DriverBuddy_Backup_${todayUK()}.json`,
          content,
          backupBlob.type
        );
      });
    });
  };

  const restore = async (payload: unknown) => {
    if (!isValidRestorePayload(payload)) {
      throw new Error('Backup data appears corrupted');
    }

    const data = payload as RestorePayload;

    if (Array.isArray(data.trips)) setTrips(data.trips);
    if (Array.isArray(data.expenses)) {
      const preparedExpenses = await prepareExpensesForLocalState(data.expenses);
      setExpenses(preparedExpenses);
    }
    if (Array.isArray(data.dailyLogs)) setDailyLogs(data.dailyLogs);
    if (data.settings) setSettings(normalizeSettings(data.settings));
    if (data.playerStats) setPlayerStats(data.playerStats);

    const restoredLogs = Array.isArray(data.dailyLogs) ? data.dailyLogs.length : 0;
    const restoredExpenses = Array.isArray(data.expenses) ? data.expenses.length : 0;
    const message = `${restoredLogs} work logs and ${restoredExpenses} expenses restored successfully`;
    setRestoreStatusMessage(message);
    showToast(message);

    return {
      restoredLogs,
      restoredExpenses,
    };
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      try {
        const parsed = JSON.parse(loadEvent.target?.result as string) as unknown;
        await restore(parsed);
      } catch (error) {
        Sentry.captureException(error);
        console.error('Failed to restore data', error);
        showToast('Invalid backup file. Choose a valid Driver Buddy backup.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleCopyBackupCode = async () => {
    try {
      await navigator.clipboard.writeText(backupCode);
      showToast('Backup code copied.');
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to copy backup code', error);
      alert('Could not copy the backup code. Copy it manually from the code box.');
    }
  };

  const handleRestoreFromBackupCode = async (code: string) => {
    const trimmedCode = code.trim();
    const recovery = parseRecoveryCode(trimmedCode);

    if (!recovery) {
      showToast('Enter a valid backup code.', 'warning');
      return;
    }

    localStorage.setItem('pending_identity', recovery.accountId);
    setIsPreparingRestore(true);

    try {
      clearSessionCache();
      const syncedData = await pull(recovery.accountId, recovery.deviceSecret);
      if (!syncedData) {
        throw new Error(
          isSyncConfigured()
            ? 'Cloud data could not be pulled right now.'
            : 'Set VITE_SYNC_WORKER_URL before using cloud restore.'
        );
      }

      if (!isValidRestorePayload(syncedData)) {
        throw new Error('Backup data appears corrupted');
      }

      setPendingRestoreReview(buildRestoreReview(trimmedCode, recovery.accountId, recovery.deviceSecret, syncedData));
      setRestoreStatusMessage('Review the cloud restore before applying it.');
      showToast('Cloud backup ready to review.', 'info');
    } catch (error) {
      localStorage.removeItem('pending_identity');
      const message = error instanceof Error ? error.message : 'Restore failed';
      setRestoreStatusMessage(message);
      showToast(message, 'error');
    } finally {
      setIsPreparingRestore(false);
    }
  };

  const cancelPendingRestore = () => {
    setPendingRestoreReview(null);
    localStorage.removeItem('pending_identity');
    setRestoreStatusMessage(null);
  };

  const confirmPendingRestore = async () => {
    if (!pendingRestoreReview) return;

    const storageSnapshot = {
      trips: localStorage.getItem('driver_trips'),
      dailyLogs: localStorage.getItem('driver_daily_logs'),
      expenses: localStorage.getItem('driver_expenses'),
      settings: localStorage.getItem('driver_settings'),
      backupCode: localStorage.getItem(LEGACY_BACKUP_CODE_KEY),
      accountId: localStorage.getItem(ACCOUNT_ID_KEY),
      deviceSecret: localStorage.getItem(DEVICE_SECRET_KEY),
      pendingIdentity: localStorage.getItem('pending_identity'),
    };
    const stateSnapshot = { trips, expenses, dailyLogs, settings };

    setIsApplyingRestore(true);

    try {
      const { restoredLogs, restoredExpenses } = await writeRestoredData(pendingRestoreReview.pulledData);

      if (!commitRecoveryCode(pendingRestoreReview.code)) {
        throw new Error('Backup code could not be applied');
      }

      localStorage.setItem(LEGACY_BACKUP_CODE_KEY, pendingRestoreReview.code);
      clearRegistrationCache(pendingRestoreReview.accountId);
      clearSessionCache();
      localStorage.removeItem('pending_identity');
      localStorage.removeItem('driver_deleted_ids');
      clearDeletedIds?.();
      setBackupCode(getBackupCode());
      setPendingRestoreReview(null);

      const message = `${restoredLogs} work logs and ${restoredExpenses} expenses restored successfully`;
      setRestoreStatusMessage(message);
      showToast(message);
      const deviceCount = getLastDeviceCount();
      if (deviceCount && deviceCount > 1) {
        showToast(`Device added - ${deviceCount} total devices linked to this account`, 'success');
      }
    } catch (error) {
      const restoreStorageValue = (key: string, value: string | null) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      };

      restoreStorageValue('driver_trips', storageSnapshot.trips);
      restoreStorageValue('driver_daily_logs', storageSnapshot.dailyLogs);
      restoreStorageValue('driver_expenses', storageSnapshot.expenses);
      restoreStorageValue('driver_settings', storageSnapshot.settings);
      restoreStorageValue(LEGACY_BACKUP_CODE_KEY, storageSnapshot.backupCode);
      restoreStorageValue(ACCOUNT_ID_KEY, storageSnapshot.accountId);
      restoreStorageValue(DEVICE_SECRET_KEY, storageSnapshot.deviceSecret);
      restoreStorageValue('pending_identity', storageSnapshot.pendingIdentity);
      setTrips(stateSnapshot.trips);
      setExpenses(stateSnapshot.expenses);
      setDailyLogs(stateSnapshot.dailyLogs);
      setSettings(stateSnapshot.settings);

      const message = error instanceof Error ? error.message : 'Restore failed';
      setRestoreStatusMessage(message);
      showToast(message, 'error');
    } finally {
      setIsApplyingRestore(false);
    }
  };

  return {
    backupCode,
    setBackupCode,
    restoreStatusMessage,
    backup,
    restore,
    handleBackup,
    handleRestore,
    handleCopyBackupCode,
    handleRestoreFromBackupCode,
    pendingRestoreReview,
    isPreparingRestore,
    isApplyingRestore,
    confirmPendingRestore,
    cancelPendingRestore,
  };
}
