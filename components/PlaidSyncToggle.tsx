import React, { useEffect, useState } from 'react';
import { Building2, Link2Off } from 'lucide-react';
import { Toast } from './Toast';
import { buildAuthHeaders } from '../services/sessionManager';
import {
  panelClasses,
  secondaryButtonClasses,
  subtlePanelClasses,
} from '../utils/ui';

type PlaidStatus = {
  connected: boolean;
  institutionName: string | null;
  lastSynced: number | null;
};

type ToastState = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const WORKER_URL = env?.VITE_SYNC_WORKER_URL ?? '';
const DEFAULT_STATUS: PlaidStatus = {
  connected: false,
  institutionName: null,
  lastSynced: null,
};

function formatLastSynced(value: number | null): string {
  if (!value) return 'Never';

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function PlaidSyncToggle() {
  const [status, setStatus] = useState<PlaidStatus>(DEFAULT_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      if (!WORKER_URL) {
        if (!cancelled) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const headers = await buildAuthHeaders();
        const response = await fetch(`${WORKER_URL}/api/plaid/status`, {
          headers,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as PlaidStatus;
        if (!cancelled) {
          setStatus({
            connected: Boolean(data.connected),
            institutionName: data.institutionName ?? null,
            lastSynced: typeof data.lastSynced === 'number' ? data.lastSynced : null,
          });
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setStatus(DEFAULT_STATUS);
          setError('Could not load bank sync status right now.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (message: string, type: ToastState['type']) => {
    setToast({ id: Date.now(), message, type });
  };

  const handleDisconnect = async () => {
    if (!WORKER_URL) {
      showToast('Bank sync is not available in this environment.', 'error');
      return;
    }

    setIsDisconnecting(true);

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch(`${WORKER_URL}/api/plaid/disconnect`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setStatus(DEFAULT_STATUS);
      setError(null);
      showToast('Bank sync disconnected and imported transactions deleted.', 'success');
    } catch {
      showToast('Could not disconnect bank sync right now.', 'error');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = status.connected;

  return (
    <>
      <div className={`${subtlePanelClasses} space-y-4 p-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-surface p-3 text-slate-200">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-white">Bank sync</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  isConnected ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-700/80 text-slate-300'
                }`}>
                  {isConnected ? 'On' : 'Coming soon'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Plaid connection is still in development. For now, new bank connections stay disabled while the read-only import flow is finished.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isConnected}
            aria-label="Bank sync status"
            disabled
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:cursor-default ${
              isConnected ? 'bg-brand' : 'bg-surface'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                isConnected ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {isLoading ? (
          <div className={`${panelClasses} border-dashed p-4 text-sm text-slate-400`}>
            Checking bank sync status...
          </div>
        ) : isConnected ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className={`${panelClasses} p-4`}>
              <p className="text-sm font-semibold text-white">{status.institutionName ?? 'Connected bank'}</p>
              <p className="mt-1 text-sm text-slate-400">Last synced: {formatLastSynced(status.lastSynced)}</p>
              <p className="mt-3 text-xs text-slate-500">Disconnecting removes the Plaid connection and deletes every imported bank transaction immediately.</p>
            </div>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={isDisconnecting}
              className={`${secondaryButtonClasses} border-red-500/30 text-red-100 hover:bg-red-500/15`}
            >
              <Link2Off className="h-4 w-4" />
              <span>{isDisconnecting ? 'Disconnecting...' : 'Disconnect'}</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className={`${panelClasses} p-4`}>
              <p className="text-sm font-semibold text-white">Bank sync is coming soon</p>
              <p className="mt-1 text-sm text-slate-400">
                New Plaid connections are not live yet. We&apos;ll enable read-only transaction import once the connection flow is ready.
              </p>
            </div>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className={secondaryButtonClasses}
            >
              Connect your bank
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[95] flex justify-center px-4">
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => setToast((current) => (current?.id === toast.id ? null : current))}
          />
        </div>
      )}
    </>
  );
}
