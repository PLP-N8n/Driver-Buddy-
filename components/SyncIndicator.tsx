import { useEffect, useRef, useState } from 'react';
import { Spinner } from './Spinner';
import { isSyncConfigured, onSyncStatus, type SyncStatus } from '../services/syncService';

const LAST_SYNC_KEY = 'dbt_lastSyncAt';
const LEGACY_LAST_SYNC_KEY = 'dtpro_last_sync';

function formatLastSync(lastSyncTime: Date, now: number) {
  const diffMs = Math.max(0, now - lastSyncTime.getTime());

  if (diffMs < 60_000) return 'Saved just now';

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) {
    return `Saved ${mins} min${mins === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(mins / 60);
  return `Saved ${hours} hr${hours === 1 ? '' : 's'} ago`;
}

export function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const previousStatusRef = useRef<SyncStatus>('idle');

  useEffect(() => {
    const storedLastSync = localStorage.getItem(LAST_SYNC_KEY) ?? localStorage.getItem(LEGACY_LAST_SYNC_KEY);
    if (!storedLastSync) return;

    const parsed = new Date(storedLastSync);
    if (!Number.isNaN(parsed.getTime())) {
      setLastSyncTime(parsed);
    }
  }, []);

  useEffect(() => onSyncStatus(setStatus), []);

  useEffect(() => {
    if (status === 'idle' && previousStatusRef.current !== 'idle') {
      const syncedAt = new Date();
      setLastSyncTime(syncedAt);
      localStorage.setItem(LAST_SYNC_KEY, syncedAt.toISOString());
    }

    previousStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const syncConfigured = isSyncConfigured();
  if (!syncConfigured) return null;

  const label =
    status === 'syncing'
      ? 'Saving to cloud. Data is also saved locally.'
      : status === 'offline'
        ? "You're offline. Sync will retry when your connection returns. Data is also saved locally."
        : status === 'error'
          ? 'Sync issue. Retrying automatically. Data is also saved locally.'
      : lastSyncTime
        ? `${formatLastSync(lastSyncTime, now)}. Data is also saved locally.`
        : 'Data is saved locally on this device.';

  const indicatorText =
    status === 'syncing'
      ? 'Syncing'
      : status === 'offline'
        ? 'Offline'
        : status === 'error'
          ? 'Sync issue'
          : lastSyncTime
            ? 'Saved'
            : 'Local';

  const dotClass =
    status === 'offline'
      ? 'bg-amber-400'
      : status === 'error'
        ? 'bg-rose-400'
        : status === 'idle'
          ? 'bg-emerald-400'
          : 'bg-slate-500';

  return (
    <div className="group relative" data-testid="sync-indicator">
      <button
        type="button"
        aria-live="polite"
        aria-label={label}
        title={label}
        className="inline-flex min-h-[32px] items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-3 py-1.5 text-slate-300 transition-colors duration-150 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]"
      >
        {status === 'syncing' ? (
          <Spinner size="sm" className="border-cyan-500/25 border-t-cyan-300" />
        ) : (
          <span className={`h-2.5 w-2.5 rounded-full transition-colors duration-150 ${dotClass}`} />
        )}
        <span className="text-xs font-medium">{indicatorText}</span>
        <span className="sr-only">{label}</span>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden max-w-[16rem] rounded-lg border border-white/8 bg-[#0F172A] px-3 py-2 text-left text-xs text-slate-200 shadow-xl shadow-black/30 group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </div>
  );
}
