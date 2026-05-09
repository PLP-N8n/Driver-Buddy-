import React from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { PullState } from '../hooks/usePullToRefresh';

interface PullToRefreshIndicatorProps {
  pullState: PullState;
  pullDistance: number;
}

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullState,
  pullDistance,
}) => {
  if (pullState === 'idle') return null;

  const isReady = pullState === 'ready';
  const isRefreshing = pullState === 'refreshing';

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[76px] z-30 flex items-center justify-center overflow-hidden"
      style={{ height: `${Math.max(0, pullDistance)}px` }}
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
          transform: `translateY(${Math.min(0, 20 - pullDistance)}px)`,
          opacity: Math.min(1, pullDistance / 40),
        }}
      >
        {isRefreshing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isReady ? 'rotate-180' : ''}`}
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
