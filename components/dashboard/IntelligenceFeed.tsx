import React from 'react';
import { AlertTriangle, Brain, RefreshCw, Sparkles } from 'lucide-react';
import type { RecurringExpense } from '../../types';
import type { DriverPrediction } from '../../utils/predictions';

type IntelligenceFeedProps = {
  dashboardInsight: string | null;
  dismissedInsight: string | null;
  onDismissInsight: (insight: string) => void;
  topPrediction: DriverPrediction | null;
  isPredictionExpanded: boolean;
  onTogglePrediction: () => void;
  onDismissPrediction: (message: string, type: DriverPrediction['type']) => void;
  onSetReminder?: () => void;
  missedDays: string[];
  onOpenBackfill: () => void;
  dueRecurringExpenses?: RecurringExpense[];
  onLogRecurring?: (item: RecurringExpense) => void;
};

export const IntelligenceFeed: React.FC<IntelligenceFeedProps> = ({
  dashboardInsight,
  dismissedInsight,
  onDismissInsight,
  topPrediction,
  isPredictionExpanded,
  onTogglePrediction,
  onDismissPrediction,
  onSetReminder,
  missedDays,
  onOpenBackfill,
  dueRecurringExpenses = [],
  onLogRecurring,
}) => (
  <>
    {dueRecurringExpenses.length > 0 && onLogRecurring && (
      <div className="mt-5 rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-violet-300" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Regular expenses due</span>
        </div>
        <div className="flex flex-col gap-2">
          {dueRecurringExpenses.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-200">{item.description} — £{item.amount.toFixed(2)}</span>
              <button
                type="button"
                onClick={() => onLogRecurring(item)}
                className="shrink-0 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-100 transition-colors hover:bg-violet-400/20 active:scale-95"
              >
                Log it
              </button>
            </div>
          ))}
        </div>
      </div>
    )}

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
                data-testid="prediction-action"
                onClick={(event) => {
                  event.stopPropagation();
                  if (topPrediction.type === 'target') {
                    onSetReminder?.();
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
