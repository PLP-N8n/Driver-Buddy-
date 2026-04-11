import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export const UpdateBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_VERSION') setShow(true);
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-[148px] inset-x-0 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/15 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-sm">
        <RefreshCw className="h-4 w-4 shrink-0 text-brand" />
        <p className="text-sm font-medium text-white">New version available</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};
