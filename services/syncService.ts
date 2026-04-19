import type { DailyWorkLog, Expense, Settings, SyncPullPayload, Trip } from '../types';
import { trackEvent } from './analyticsService';
import { getDeviceId } from './deviceId';
import { normalizeSettings } from './settingsService';
import { buildAuthHeaders } from './sessionManager';
import { applyPulledExpenses, applyPulledShiftWorkLogs, applyPulledTrips, applyPulledWorkLogs } from './syncTransforms';

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const WORKER_URL = env?.VITE_SYNC_WORKER_URL ?? '';
const SYNC_DEBOUNCE_MS = 3000;
const MIN_RETRY_BACKOFF_MS = 5000;
const MAX_PUSH_RETRIES = 3;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;
let isRetrying = false;
let queuedPushData: object | null = null;
let retryCount = 0;

export type MergedSyncState = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
};

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

type SyncStatusListener = (status: SyncStatus) => void;
type PushSuccessListener = () => void;
const listeners: SyncStatusListener[] = [];
const pushSuccessListeners: PushSuccessListener[] = [];

export function onSyncStatus(fn: SyncStatusListener) {
  listeners.push(fn);
  return () => {
    const index = listeners.indexOf(fn);
    if (index >= 0) listeners.splice(index, 1);
  };
}

export function onPushSuccess(fn: PushSuccessListener) {
  pushSuccessListeners.push(fn);
  return () => {
    const index = pushSuccessListeners.indexOf(fn);
    if (index >= 0) pushSuccessListeners.splice(index, 1);
  };
}

export function resetSyncServiceForTests() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  resetRetryState();
  isSyncing = false;
  queuedPushData = null;
  listeners.splice(0, listeners.length);
  pushSuccessListeners.splice(0, pushSuccessListeners.length);
}

export function isSyncConfigured(): boolean {
  return Boolean(WORKER_URL);
}

function emit(status: SyncStatus) {
  listeners.forEach((fn) => fn(status));
}

function clearRetryTimer() {
  if (!retryTimer) return;

  clearTimeout(retryTimer);
  retryTimer = null;
}

function resetRetryState(clearQueue = false) {
  clearRetryTimer();
  isRetrying = false;
  retryCount = 0;
  if (clearQueue) queuedPushData = null;
}

function scheduleRetry() {
  if (!queuedPushData) {
    resetRetryState();
    emit('error');
    return;
  }

  if (retryCount >= MAX_PUSH_RETRIES) {
    resetRetryState(true);
    emit('error');
    return;
  }

  clearRetryTimer();
  isRetrying = true;
  const delay = MIN_RETRY_BACKOFF_MS * 2 ** retryCount;
  retryCount += 1;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    isRetrying = false;
    await flushQueuedPush();
  }, delay);
}

export function schedulePush(data: object) {
  if (!WORKER_URL) return;

  resetRetryState();
  queuedPushData = data;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    await flushQueuedPush();
  }, SYNC_DEBOUNCE_MS);
}

async function flushQueuedPush(): Promise<boolean> {
  if (!queuedPushData || isSyncing) return false;

  const nextData = queuedPushData;
  queuedPushData = null;
  return push(nextData);
}

export async function retryPendingPush(): Promise<boolean> {
  clearRetryTimer();

  if (isRetrying) return false;

  isRetrying = true;
  try {
    return await flushQueuedPush();
  } finally {
    isRetrying = false;
  }
}

export async function push(data: object): Promise<boolean> {
  if (!WORKER_URL) {
    return false;
  }

  if (!navigator.onLine) {
    queuedPushData = data;
    emit('offline');
    return false;
  }

  if (isSyncing) {
    queuedPushData = data;
    return false;
  }

  isSyncing = true;
  emit('syncing');

  try {
    const authHeaders = await buildAuthHeaders();
    const res = await fetch(`${WORKER_URL}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    resetRetryState();
    pushSuccessListeners.forEach((listener) => listener());
    emit('idle');
    trackEvent('sync_completed');
    return true;
  } catch {
    queuedPushData = queuedPushData ?? data;
    emit('error');
    scheduleRetry();
    if (retryCount >= MAX_PUSH_RETRIES && !retryTimer) {
      return false;
    }
    return false;
  } finally {
    isSyncing = false;
  }
}

export async function pull(deviceIdOverride?: string): Promise<SyncPullPayload | null> {
  if (!WORKER_URL) {
    return null;
  }

  if (!navigator.onLine) {
    emit('offline');
    return null;
  }

  emit('syncing');

  try {
    const accountId = deviceIdOverride ?? getDeviceId();
    const authHeaders = await buildAuthHeaders(accountId);
    const res = await fetch(`${WORKER_URL}/sync/pull`, {
      headers: authHeaders,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    emit('idle');
    return data;
  } catch {
    emit('error');
    return null;
  }
}

export function mergePulledData(localState: MergedSyncState, pulledData: SyncPullPayload): MergedSyncState {
  const workLogsFromLegacy = applyPulledWorkLogs(pulledData.workLogs ?? [], localState.dailyLogs);
  const mergedDailyLogs = pulledData.shifts?.length
    ? applyPulledShiftWorkLogs(pulledData.shifts, pulledData.shiftEarnings ?? [], workLogsFromLegacy)
    : workLogsFromLegacy;

  const deletedWorkLogIds = new Set([
    ...(pulledData.deletedIds?.workLogs ?? []),
    ...(pulledData.deletedIds?.shifts ?? []),
  ]);
  const deletedMileageIds = new Set(pulledData.deletedIds?.mileageLogs ?? []);
  const deletedExpenseIds = new Set(pulledData.deletedIds?.expenses ?? []);

  return {
    trips: applyPulledTrips(pulledData.mileageLogs ?? [], localState.trips).filter((trip) => !deletedMileageIds.has(trip.id)),
    dailyLogs: mergedDailyLogs.filter((log) => !deletedWorkLogIds.has(log.id)),
    expenses: applyPulledExpenses(pulledData.expenses ?? [], localState.expenses).filter((expense) => !deletedExpenseIds.has(expense.id)),
    settings: pulledData.settings
      ? normalizeSettings({ ...localState.settings, ...pulledData.settings })
      : localState.settings,
  };
}

export async function pullAndMerge(
  localState: MergedSyncState,
  deviceIdOverride?: string
): Promise<MergedSyncState | null> {
  const pulledData = await pull(deviceIdOverride);
  if (!pulledData) return null;

  return mergePulledData(localState, pulledData);
}

export async function deleteAccount(): Promise<boolean> {
  if (!WORKER_URL) return false;

  try {
    const authHeaders = await buildAuthHeaders();
    const res = await fetch(`${WORKER_URL}/sync/account`, {
      method: 'DELETE',
      headers: authHeaders,
    });

    return res.ok;
  } catch {
    return false;
  }
}
