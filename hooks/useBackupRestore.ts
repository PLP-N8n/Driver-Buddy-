import React, { useEffect, useState } from 'react';
import { DailyWorkLog, Expense, PlayerStats, Settings, SyncPullPayload, Trip } from '../types';
import { getBackupCode } from '../services/deviceId';
import { normalizeSettings } from '../services/settingsService';
import { isSyncConfigured, mergePulledData, pull } from '../services/syncService';
import {
  prepareExpensesForLocalState,
} from '../services/syncTransforms';
import * as Sentry from '../src/sentry';
import { todayUK } from '../utils/ukDate';

const DEVICE_ID_STORAGE_KEY = 'drivertax_device_id';
const LEGACY_BACKUP_CODE_KEY = 'backup_code';
const BACKUP_CODE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
}: UseBackupRestoreParams) {
  const [backupCode, setBackupCode] = useState(() => getBackupCode());
  const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null);

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
          `DriverTaxPro_Backup_${todayUK()}.json`,
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

    if (!BACKUP_CODE_REGEX.test(trimmedCode)) {
      showToast('Enter a valid backup code.', 'warning');
      return;
    }

    localStorage.setItem('pending_identity', trimmedCode);

    try {
      const syncedData = await pull(trimmedCode);
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

      const { restoredLogs, restoredExpenses } = await writeRestoredData(syncedData);

      localStorage.setItem(DEVICE_ID_STORAGE_KEY, trimmedCode);
      localStorage.setItem(LEGACY_BACKUP_CODE_KEY, trimmedCode);
      localStorage.removeItem('pending_identity');
      setBackupCode(getBackupCode());

      const message = `${restoredLogs} work logs and ${restoredExpenses} expenses restored successfully`;
      setRestoreStatusMessage(message);
      showToast(message);
    } catch (error) {
      localStorage.removeItem('pending_identity');
      const message = error instanceof Error ? error.message : 'Restore failed';
      setRestoreStatusMessage(message);
      showToast(message, 'error');
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
  };
}
