import React, { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useReceiptUpload } from '../hooks/useReceiptUpload';
import { panelClasses, secondaryButtonClasses, subtlePanelClasses } from '../utils/ui';

export const ReceiptSyncPanel: React.FC = () => {
  const { rows, retryAll } = useReceiptUpload();
  const counts = useMemo(
    () => ({
      local: rows.filter((row) => row.status === 'local-only').length,
      synced: rows.filter((row) => row.status === 'synced').length,
      failed: rows.filter((row) => row.status === 'failed').length,
    }),
    [rows]
  );

  return (
    <section className={`${panelClasses} p-5`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Receipt sync</h2>
          <p className="text-sm text-slate-400">Track which receipt images are local, synced, or waiting for retry.</p>
        </div>
        <button type="button" onClick={() => void retryAll()} disabled={counts.failed === 0} className={secondaryButtonClasses}>
          <RefreshCw className="h-4 w-4" />
          <span>Retry all failed</span>
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${subtlePanelClasses} px-4 py-3`}>
          <p className="text-sm text-slate-400">Local only</p>
          <p className="mt-1 font-mono text-xl text-amber-300">{counts.local}</p>
        </div>
        <div className={`${subtlePanelClasses} px-4 py-3`}>
          <p className="text-sm text-slate-400">Cloud synced</p>
          <p className="mt-1 font-mono text-xl text-emerald-300">{counts.synced}</p>
        </div>
        <div className={`${subtlePanelClasses} px-4 py-3`}>
          <p className="text-sm text-slate-400">Failed</p>
          <p className="mt-1 font-mono text-xl text-red-300">{counts.failed}</p>
        </div>
      </div>
    </section>
  );
};
