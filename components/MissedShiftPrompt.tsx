import React, { useEffect, useState } from 'react';
import { Briefcase, Clock, X } from 'lucide-react';
import { InferredShift } from '../hooks/useMissedShiftInference';

interface MissedShiftPromptProps {
  visible: boolean;
  phase: 'idle' | 'waiting_for_gps' | 'prompting' | 'accepted' | 'rejected' | 'timeout';
  inferredShift: InferredShift | null;
  onAccept: () => void;
  onReject: () => void;
  onDismissTimeout: () => void;
}

const DISMISS_FEEDBACK_DELAY = 3000;

export const MissedShiftPrompt: React.FC<MissedShiftPromptProps> = ({
  visible,
  phase,
  inferredShift,
  onAccept,
  onReject,
  onDismissTimeout,
}) => {
  const [showFeedback, setShowFeedback] = useState(false);

  // Reset feedback state when prompt becomes visible again
  useEffect(() => {
    if (visible) setShowFeedback(false);
  }, [visible]);

  // Auto-hide after feedback shown, then signal AppShell to reset phase
  useEffect(() => {
    if (!showFeedback) return;
    const t = setTimeout(() => {
      setShowFeedback(false);
      onDismissTimeout();
    }, DISMISS_FEEDBACK_DELAY);
    return () => clearTimeout(t);
  }, [showFeedback, onDismissTimeout]);

  if (!visible && !showFeedback) return null;

  // Dismiss feedback screen
  if (showFeedback || phase === 'timeout') {
    return (
      <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom)+88px)] z-50 px-4">
        <div className="mx-auto max-w-sm rounded-2xl border border-brand/20 bg-surface-raised/95 p-4 shadow-lg backdrop-blur-xl">
          <p className="text-sm text-slate-300 text-center">
            Got it — noted. This helps me learn your patterns.
          </p>
        </div>
      </div>
    );
  }

  if (!inferredShift) return null;

  const earningsDisplay =
    inferredShift.estimatedRevenueMin === inferredShift.estimatedRevenueMax
      ? `£${inferredShift.estimatedRevenueAvg.toFixed(2)}`
      : `£${inferredShift.estimatedRevenueMin.toFixed(0)}–${inferredShift.estimatedRevenueMax.toFixed(0)}`;

  return (
    <div className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom)+88px)] z-50 px-4">
      <div className="mx-auto max-w-sm animate-in slide-in-from-bottom-4 fade-in rounded-2xl border border-amber-500/20 bg-surface-raised/95 p-4 shadow-lg backdrop-blur-xl">
        {/* Header */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
              <Briefcase className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Looks like you were driving earlier</p>
              <p className="text-xs text-slate-400">Want to log that shift?</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReject}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Estimated details */}
        <div className="mb-4 flex items-center gap-4 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-300">
              ~{inferredShift.hours}h · {inferredShift.provider}
            </span>
          </div>
          <div className="ml-auto">
            <span className="text-sm font-semibold text-amber-400">{earningsDisplay}</span>
            <span className="ml-1 text-xs text-slate-500">est.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90 active:scale-[0.98]"
          >
            Yes, log it
          </button>
          <button
            type="button"
            onClick={() => {
              onReject();
              setShowFeedback(true);
            }}
            className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 active:scale-[0.98]"
          >
            No, wasn't working
          </button>
        </div>
      </div>
    </div>
  );
};
