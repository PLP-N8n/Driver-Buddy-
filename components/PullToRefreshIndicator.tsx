import React, { useEffect, useRef } from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { PullState } from '../hooks/usePullToRefresh';
import { triggerHaptic } from '../utils/haptics';

interface PullToRefreshIndicatorProps {
  pullState: PullState;
  pullDistance: number;
}

const THRESHOLD = 80;

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullState,
  pullDistance,
}) => {
  const prevState = useRef<PullState>(pullState);

  // Elastic resistance: harder to pull past 120px
  const effectiveDistance = pullDistance <= 120
    ? pullDistance
    : 120 + (pullDistance - 120) * 0.3;

  const isReady = pullState === 'ready';
  const isRefreshing = pullState === 'refreshing';

  useEffect(() => {
    if (prevState.current !== 'ready' && pullState === 'ready') {
      triggerHaptic('medium');
    }
    prevState.current = pullState;
  }, [pullState]);

  if (pullState === 'idle') return null;

  const progress = Math.min(1, effectiveDistance / THRESHOLD);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[76px] z-30 flex items-center justify-center overflow-hidden"
      style={{ height: `${Math.max(0, effectiveDistance)}px` }}
    >
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-all duration-200 ${
          isReady
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : isRefreshing
              ? 'border-brand/30 bg-brand/10 text-brand'
              : 'border-white/10 bg-surface-raised/80 text-slate-400'
        }`}
        style={{
          transform: `translateY(${Math.min(0, 20 - effectiveDistance)}px)`,
          opacity: Math.min(1, effectiveDistance / 40),
        }}
      >
        {isRefreshing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" />
        ) : (
          <ArrowDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isReady ? 'rotate-180' : ''}`}
            style={{ transform: `rotate(${progress * 180}deg)` }}
          />
        )}
        <span>
          {isRefreshing
            ? 'Syncing…'
            : isReady
              ? 'Release to sync'
              : 'Pull to sync'}
        </span>
      </div>
    </div>
  );
};
