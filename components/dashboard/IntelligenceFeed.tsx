import React from 'react';
import { AlertTriangle, Brain, Sparkles } from 'lucide-react';
import type { DriverPrediction } from '../../utils/predictions';

type IntelligenceFeedProps = {
  dashboardInsight: string | null;
  dismissedInsight: string | null;
  onDismissInsight: (insight: string) => void;
  topPrediction: DriverPrediction | null;
  isPredictionExpanded: boolean;
  onTogglePrediction: () => void;
  onDismissPrediction: (message: string, type: DriverPrediction['type']) => void;
  onOpenTaxTab?: () => void;
  missedDays: string[];
  onOpenBackfill: () => void;
};

export const IntelligenceFeed: React.FC<IntelligenceFeedProps> = ({
  dashboardInsight,
  dismissedInsight,
  onDismissInsight,
  topPrediction,
  isPredictionExpanded,
  onTogglePrediction,
  onDismissPrediction,
  onOpenTaxTab,
  missedDays,
  onOpenBackfill,
}) => (
  <>
    {dashboardInsight && dismissedInsight !== dashboardInsight && (
      <button
        type="button"
        data-testid="dashboard-insight-pill"
        onClick={() => onDismissInsight(dashboardInsight)}
        className="mt-5 flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-left text-slate-100 transition-colors hover:bg-brand/15"
      >
        <span>{dashboardInsight}</span>
        <Sparkles className="h-4 w-4 shrink-0 text-brand" />
      </button>
    )}

    {topPrediction && (
      <button
        type="button"
        data-testid="prediction-card"
        onClick={onTogglePrediction}
        className="mt-3 w-full rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-cyan-200">
              <Brain className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Next move</span>
            </div>
            <p className="mt-2 text-sm text-slate-100">
              {isPredictionExpanded ? topPrediction.message : 'Forward-looking coaching based on your recent shifts.'}
            </p>
            {isPredictionExpanded && topPrediction.actionLabel && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (topPrediction.type === 'target') {
                    onOpenTaxTab?.();
                  }
                }}
                className="mt-3 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100"
              >
                {topPrediction.actionLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss prediction"
            onClick={(event) => {
              event.stopPropagation();
              onDismissPrediction(topPrediction.message, topPrediction.type);
            }}
            className="min-h-[44px] rounded-full border border-cyan-500/20 bg-slate-950/20 px-4 py-2 text-xs text-cyan-100"
          >
            Dismiss
          </button>
        </div>
      </button>
    )}

    {missedDays.length > 0 && (
      <button
        type="button"
        data-testid="missed-log-banner"
        onClick={onOpenBackfill}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
          <span className="text-sm text-amber-50">
            {missedDays.length === 1 ? 'A recent day still needs a shift or day-off note.' : `${missedDays.length} recent days still need a shift or day-off note.`}
          </span>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Review</span>
      </button>
    )}
  </>
);
