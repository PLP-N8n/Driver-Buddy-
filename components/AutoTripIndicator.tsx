import React, { useEffect, useState } from 'react';
import { Car, MapPin, Navigation, X } from 'lucide-react';
import { AutoTripState } from '../hooks/useAutoTripDetection';

interface AutoTripIndicatorProps {
  state: AutoTripState;
  onCancel: () => void;
}

export const AutoTripIndicator: React.FC<AutoTripIndicatorProps> = ({ state, onCancel }) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (state !== 'driving') {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  if (state === 'idle') return null;

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isDriving = state === 'driving';

  // 88px offset: dock height (68px) + nav bar padding (~20px). Keep in sync with .bottom-dock + .app-nav.
  return (
    <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom)+88px)] z-50 px-4">
      <div
        className={`mx-auto flex max-w-sm items-center gap-3 rounded-2xl border p-3 shadow-lg backdrop-blur-xl transition-all duration-300 ${
          isDriving
            ? 'border-emerald-500/20 bg-emerald-500/10'
            : 'border-white/10 bg-surface-raised/90'
        }`}
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isDriving ? 'bg-emerald-500/20' : 'bg-indigo-500/15'
          }`}
        >
          {isDriving ? (
            <Navigation className="h-5 w-5 animate-pulse text-emerald-400" />
          ) : (
            <Car className="h-5 w-5 text-indigo-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            {isDriving ? 'Recording trip' : 'Detecting movement…'}
          </p>
          <p className="text-xs text-slate-400">
            {isDriving
              ? `Elapsed: ${formatTime(elapsedMs)} · Stop for 2 min to finish`
              : 'Stay above 15 mph for 30 seconds'}
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Cancel auto trip detection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
