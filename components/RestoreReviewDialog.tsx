import React from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import type { PendingRestoreReview, RestoreReviewSummary } from '../hooks/useBackupRestore';
import {
  dialogBackdropClasses,
  dialogPanelClasses,
  iconButtonClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  subtlePanelClasses,
} from '../utils/ui';

type RestoreReviewDialogProps = {
  review: PendingRestoreReview | null;
  isApplying: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

const countRows: Array<{ key: keyof RestoreReviewSummary['local']; label: string }> = [
  { key: 'trips', label: 'Trips' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'dailyLogs', label: 'Work logs' },
  { key: 'settings', label: 'Settings' },
];

export const RestoreReviewDialog: React.FC<RestoreReviewDialogProps> = ({
  review,
  isApplying,
  onConfirm,
  onCancel,
}) => {
  if (!review) return null;

  const hasConflicts = countRows.some(({ key }) => review.summary.conflicts[key] > 0);

  return (
    <div className={dialogBackdropClasses} onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review cloud restore"
        className={`${dialogPanelClasses} max-w-2xl`}
        onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Review cloud restore</h2>
            <p className="mt-1 text-sm text-slate-400">
              Merge mode: keep newest by updated timestamp.
            </p>
          </div>
          <button type="button" aria-label="Cancel restore" onClick={onCancel} className={iconButtonClasses}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasConflicts && (
          <div className="mt-4 flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-300" />
            <p className="text-sm text-amber-100">
              Some local and cloud records share the same ID. The newer version will be kept when you confirm.
            </p>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded-2xl border border-surface-border">
          <div className="grid grid-cols-[1fr_repeat(4,minmax(64px,1fr))] bg-surface-raised px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            <span>Data</span>
            <span className="text-right">Local</span>
            <span className="text-right">Cloud</span>
            <span className="text-right">Conflicts</span>
            <span className="text-right">After</span>
          </div>
          {countRows.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[1fr_repeat(4,minmax(64px,1fr))] border-t border-surface-border px-4 py-3 text-sm">
              <span className="font-medium text-slate-200">{label}</span>
              <span className="text-right font-mono text-white">{review.summary.local[key]}</span>
              <span className="text-right font-mono text-white">{review.summary.cloud[key]}</span>
              <span className={`text-right font-mono ${review.summary.conflicts[key] > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                {review.summary.conflicts[key]}
              </span>
              <span className="text-right font-mono text-white">{review.summary.merged[key]}</span>
            </div>
          ))}
        </div>

        <div className={`${subtlePanelClasses} mt-4 p-4`}>
          <p className="text-sm text-slate-300">
            Nothing changes on this device until you confirm. If the restore fails while writing, the previous local data is restored.
          </p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={isApplying} className={secondaryButtonClasses}>
            Cancel
          </button>
          <button type="button" onClick={() => void onConfirm()} disabled={isApplying} className={primaryButtonClasses}>
            <RotateCcw className="h-4 w-4" />
            <span>{isApplying ? 'Restoring...' : 'Restore data'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
