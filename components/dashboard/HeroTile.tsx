import React from 'react';
import { AnimatedNumber } from '../AnimatedNumber';

export interface HeroTileProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delta?: number;
  progress?: number;
  subLabel?: string;
  onClick?: () => void;
  isEmpty?: boolean;
  emptyHint?: string;
}

export const HeroTile: React.FC<HeroTileProps> = ({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  delta,
  progress,
  subLabel,
  onClick,
  isEmpty,
  emptyHint,
}) => {
  const showDelta = delta !== undefined && delta !== 0 && Number.isFinite(delta);
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative flex min-h-[96px] flex-col justify-between rounded-2xl border border-surface-border bg-surface-raised p-4 text-left transition-transform duration-150 hover:scale-[1.02] active:scale-95"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {showDelta && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${deltaPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
            {deltaPositive ? '+' : ''}{new Intl.NumberFormat('en-GB', { maximumFractionDigits: decimals }).format(delta ?? 0)}
          </span>
        )}
      </div>

      <div className="mt-2">
        {isEmpty ? (
          <>
            <p className="font-mono text-2xl font-bold tracking-tight text-slate-600">--</p>
            {emptyHint && <p className="mt-1 text-[10px] text-slate-600">{emptyHint}</p>}
          </>
        ) : (
          <>
            <p className="font-mono text-2xl font-bold tracking-tight text-white">
              <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
            </p>
            {subLabel && <p className="mt-1 text-[10px] text-slate-500">{subLabel}</p>}
          </>
        )}
      </div>

      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="hero-tile-progress-bar h-full rounded-full bg-brand transition-all duration-700 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </button>
  );
};
