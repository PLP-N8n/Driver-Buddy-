import React, { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import {
  formatCurrency,
  formatNumber,
  secondaryButtonClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
  subtlePanelClasses,
} from '../utils/ui';

export type DisputeCandidate = {
  id: string;
  source_type: string;
  confidence: number;
  source_detail?: string;
  [key: string]: unknown;
};

export type DisputeGroup = {
  type: 'shift' | 'expense' | 'mileage';
  candidates: DisputeCandidate[];
};

interface DisputeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  disputes: DisputeGroup[];
  onResolve: (chosenId: string, disputeIndex: number) => void;
}

const TYPE_LABELS: Record<DisputeGroup['type'], string> = {
  shift: 'Shift',
  expense: 'Expense',
  mileage: 'Mileage',
};

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function renderCandidateFields(candidate: DisputeCandidate, type: DisputeGroup['type']): React.ReactNode {
  switch (type) {
    case 'shift': {
      const hours = candidate.hours_worked as number | undefined;
      const earnings = candidate.earnings as number | undefined;
      return (
        <span className="text-xs text-slate-400">
          {hours != null ? `${formatNumber(hours, 1)}h` : ''}
          {hours != null && earnings != null ? ' / ' : ''}
          {earnings != null ? formatCurrency(earnings) : ''}
        </span>
      );
    }
    case 'expense': {
      const amount = candidate.amount as number | undefined;
      const category = candidate.category as string | undefined;
      return (
        <span className="text-xs text-slate-400">
          {amount != null ? formatCurrency(amount) : ''}
          {amount != null && category ? ' / ' : ''}
          {category ?? ''}
        </span>
      );
    }
    case 'mileage': {
      const miles = candidate.total_miles as number | undefined;
      return (
        <span className="text-xs text-slate-400">
          {miles != null ? `${formatNumber(miles, 1)} mi` : ''}
        </span>
      );
    }
  }
}

export const DisputeSheet: React.FC<DisputeSheetProps> = ({
  isOpen,
  onClose,
  disputes,
  onResolve,
}) => {
  const [selectedByDispute, setSelectedByDispute] = useState<Map<number, string>>(new Map());

  if (!isOpen || disputes.length === 0) {
    return null;
  }

  const isSelected = (disputeIndex: number, candidateId: string): boolean => {
    return selectedByDispute.get(disputeIndex) === candidateId;
  };

  const toggleSelection = (disputeIndex: number, candidateId: string) => {
    setSelectedByDispute((prev) => {
      const next = new Map(prev);
      if (next.get(disputeIndex) === candidateId) {
        next.delete(disputeIndex);
      } else {
        next.set(disputeIndex, candidateId);
      }
      return next;
    });
  };

  const handleConfirmSelection = (disputeIndex: number) => {
    const chosenId = selectedByDispute.get(disputeIndex);
    if (!chosenId) return;
    onResolve(chosenId, disputeIndex);
  };

  return (
    <div className={sheetBackdropClasses} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resolve evidence disputes"
        className={sheetPanelClasses}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Evidence conflict</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {disputes.length === 1
                ? 'Conflicting records found'
                : `${disputes.length} conflicting records found`}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Multiple sources reported the same entry. Select the correct one for each conflict below.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dispute sheet"
            onClick={onClose}
            className="rounded-xl border border-surface-border bg-surface-raised p-2 text-slate-300 transition-colors hover:bg-surface-border"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {disputes.map((dispute, disputeIndex) => (
            <article key={disputeIndex} className={subtlePanelClasses}>
              <h3 className="mb-3 text-sm font-semibold text-slate-300">
                {TYPE_LABELS[dispute.type]} entry
              </h3>
              <ul className="space-y-2">
                {dispute.candidates.map((candidate) => {
                  const selected = isSelected(disputeIndex, candidate.id);
                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => toggleSelection(disputeIndex, candidate.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                          selected
                            ? 'border-brand bg-brand/10 text-white'
                            : 'border-surface-border bg-surface-raised text-slate-300 hover:bg-surface-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {candidate.source_type === 'api' && 'API'}
                                {candidate.source_type === 'ocr' && 'OCR'}
                                {candidate.source_type === 'manual' && 'Manual'}
                                {!['api', 'ocr', 'manual'].includes(candidate.source_type) &&
                                  candidate.source_type}
                              </span>
                              <span className="rounded-full bg-surface-border px-2 py-0.5 text-xs text-slate-400">
                                {formatConfidence(candidate.confidence)}
                              </span>
                              {selected && (
                                <Check className="h-4 w-4 text-brand" />
                              )}
                            </div>
                            {candidate.source_detail && (
                              <span className="text-xs text-slate-500">{candidate.source_detail}</span>
                            )}
                            {renderCandidateFields(candidate, dispute.type)}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                disabled={!selectedByDispute.has(disputeIndex)}
                onClick={() => handleConfirmSelection(disputeIndex)}
                className={`${secondaryButtonClasses} mt-3 w-full justify-center ${
                  selectedByDispute.has(disputeIndex)
                    ? 'border-brand text-brand hover:bg-brand/10'
                    : ''
                }`}
              >
                Confirm selection
              </button>
            </article>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`${secondaryButtonClasses} mt-5 w-full justify-center`}
        >
          Dismiss All
        </button>
      </div>
    </div>
  );
};
