import React, { useEffect, useMemo, useState } from 'react';
import { Laptop, RefreshCw, Trash2 } from 'lucide-react';
import { buildAuthHeaders, getDeviceSecretHash, getSyncWorkerUrl } from '../services/sessionManager';
import { panelClasses, secondaryButtonClasses, subtlePanelClasses } from '../utils/ui';

type LinkedDevice = {
  deviceSecretHashSuffix: string;
  addedAt: number;
  addedVia: string;
};

function formatAddedAt(value: number): string {
  if (!Number.isFinite(value)) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const LinkedDevicesPanel: React.FC = () => {
  const workerUrl = getSyncWorkerUrl();
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [currentSuffix, setCurrentSuffix] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canLoad = Boolean(workerUrl);

  const loadDevices = async () => {
    if (!workerUrl) {
      setStatus('Cloud sync is not configured.');
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const [headers, hash] = await Promise.all([buildAuthHeaders(), getDeviceSecretHash()]);
      setCurrentSuffix(hash.slice(-12));
      const response = await fetch(`${workerUrl}/api/auth/devices`, { headers });
      if (!response.ok) throw new Error('Could not load linked devices.');
      const data = (await response.json()) as { devices?: LinkedDevice[] };
      setDevices(Array.isArray(data.devices) ? data.devices : []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load linked devices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDevices();
  }, [workerUrl]);

  const removeDevice = async (suffix: string) => {
    if (!workerUrl) return;
    setStatus(null);
    try {
      const headers = await buildAuthHeaders();
      const response = await fetch(`${workerUrl}/api/auth/devices/${encodeURIComponent(suffix)}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw new Error('Could not remove device.');
      await loadDevices();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not remove device.');
    }
  };

  const deviceRows = useMemo(
    () =>
      devices.map((device) => ({
        ...device,
        isCurrent: currentSuffix === device.deviceSecretHashSuffix,
      })),
    [currentSuffix, devices]
  );

  return (
    <section className={`${panelClasses} p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-surface-raised p-3 text-slate-200">
            <Laptop className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Linked devices</h2>
            <p className="text-sm text-slate-400">Devices that can restore and sync this account.</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadDevices()} disabled={!canLoad || loading} className={secondaryButtonClasses}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {status && <p className="mb-3 text-sm text-amber-300">{status}</p>}

      <div className="space-y-3">
        {deviceRows.length === 0 ? (
          <div className={`${subtlePanelClasses} px-4 py-3 text-sm text-slate-400`}>
            {loading ? 'Loading devices...' : 'No linked devices loaded yet.'}
          </div>
        ) : (
          deviceRows.map((device) => (
            <div key={device.deviceSecretHashSuffix} className={`${subtlePanelClasses} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm text-white">...{device.deviceSecretHashSuffix}</p>
                  {device.isCurrent && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      This device
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Added {formatAddedAt(device.addedAt)} via {device.addedVia}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void removeDevice(device.deviceSecretHashSuffix)}
                disabled={device.isCurrent}
                className={secondaryButtonClasses}
              >
                <Trash2 className="h-4 w-4" />
                <span>Remove</span>
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
