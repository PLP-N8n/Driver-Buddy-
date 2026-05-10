import React from 'react';
import { formatCurrency, subtlePanelClasses } from '../utils/ui';

export interface TaxProjectionRangeProps {
  currentProjection: number;
  conservativeProjection: number;
  optimisticProjection: number;
  requiredWeeklyAverage: number;
  weeksRemaining: number;
}

export const TaxProjectionRange: React.FC<TaxProjectionRangeProps> = ({
  currentProjection,
  conservativeProjection,
  optimisticProjection,
  requiredWeeklyAverage,
  weeksRemaining,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className={`${subtlePanelClasses} p-4 text-center`}>
          <p className="text-xs text-slate-500">Conservative</p>
          <p className="mt-1 font-mono text-xl font-semibold text-white">
            {formatCurrency(conservativeProjection)}
          </p>
        </div>
        <div className={`${subtlePanelClasses} p-4 text-center`}>
          <p className="text-xs text-slate-500">Current</p>
          <p className="mt-1 font-mono text-xl font-semibold text-white">
            {formatCurrency(currentProjection)}
          </p>
        </div>
        <div className={`${subtlePanelClasses} p-4 text-center`}>
          <p className="text-xs text-slate-500">Optimistic</p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-400">
            {formatCurrency(optimisticProjection)}
          </p>
        </div>
      </div>

      {requiredWeeklyAverage > 0 && (
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-sm text-amber-300">
            You need to average {formatCurrency(requiredWeeklyAverage)}/week for the next{' '}
            {weeksRemaining} weeks to hit your target.
          </p>
        </div>
      )}
    </div>
  );
};
