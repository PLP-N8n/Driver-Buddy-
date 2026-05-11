import type { ShiftEvidence, ExpenseEvidence, MileageEvidence } from '../types';

interface BaseEvidence {
  id: string;
  source_type: string;
  source_detail: string;
  confidence: number;
  created_at: string;
  date: string;
  dispute_status?: string | null;
}

export type ReconciliationResult =
  | { status: 'idle' }
  | { status: 'promoted'; ledgerEntry: Record<string, unknown>; resolvedEvidenceIds: string[] }
  | { status: 'disputed'; disputeCandidates: BaseEvidence[] };

const CONFIDENCE_GAP_THRESHOLD = 0.3;

function deduplicateBySource<T extends BaseEvidence>(evidence: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const e of evidence) {
    const key = `${e.source_type}|${e.source_detail}|${e.date}`;
    const existing = byKey.get(key);
    if (!existing || e.created_at > existing.created_at) {
      byKey.set(key, e);
    }
  }
  return [...byKey.values()];
}

function getDefaultConfidence(sourceType: string): number {
  switch (sourceType) {
    case 'api': return 0.95;
    case 'ocr': return 0.70;
    case 'manual': return 0.50;
    default: return 0.5;
  }
}

function normalizeConfidence<T extends BaseEvidence>(e: T): T {
  if (e.confidence === 0 || e.confidence == null) {
    return { ...e, confidence: getDefaultConfidence(e.source_type) };
  }
  return e;
}

function reconcile<T extends BaseEvidence>(
  evidence: T[],
  buildLedgerEntry: (winner: T) => Record<string, unknown>,
): ReconciliationResult {
  if (evidence.length === 0) return { status: 'idle' };

  const deduped = deduplicateBySource(evidence.map(normalizeConfidence));

  if (deduped.length === 1) {
    const single = deduped[0]!;
    if (single.confidence >= 0.95) {
      return {
        status: 'promoted',
        ledgerEntry: buildLedgerEntry(single),
        resolvedEvidenceIds: [single.id],
      };
    }
    return { status: 'idle' };
  }

  deduped.sort((a, b) => b.confidence - a.confidence);
  const highest = deduped[0]!;

  const hasClosePeer = deduped.some(
    (e) => e.id !== highest.id && (highest.confidence - e.confidence) <= CONFIDENCE_GAP_THRESHOLD,
  );

  if (hasClosePeer) {
    return {
      status: 'disputed',
      disputeCandidates: deduped.filter(
        (e) => (highest.confidence - e.confidence) <= CONFIDENCE_GAP_THRESHOLD,
      ),
    };
  }

  return {
    status: 'promoted',
    ledgerEntry: buildLedgerEntry(highest),
    resolvedEvidenceIds: deduped.map((e) => e.id),
  };
}

// ── Shift reconciliation ─────────────────────────────────────────────

export function reconcileShiftEvidence(evidence: ShiftEvidence[]): ReconciliationResult {
  return reconcile(evidence, (winner) => ({
    date: winner.date,
    primary_platform: winner.platform,
    hours_worked: winner.hours_worked,
    total_earnings: winner.earnings,
    started_at: winner.started_at,
    ended_at: winner.ended_at,
    start_odometer: winner.start_odometer,
    end_odometer: winner.end_odometer,
    business_miles: winner.business_miles,
    fuel_liters: winner.fuel_liters,
    job_count: winner.job_count,
    notes: winner.notes,
    provider_splits: JSON.stringify(winner.provider_splits ?? null),
    status: 'completed',
  }));
}

// ── Expense reconciliation ───────────────────────────────────────────

export function reconcileExpenseEvidence(evidence: ExpenseEvidence[]): ReconciliationResult {
  return reconcile(evidence, (winner) => ({
    date: winner.date,
    category: winner.category,
    amount: winner.amount,
    description: winner.description,
    receipt_id: winner.receipt_id,
    scope: winner.scope,
    business_use_percent: winner.business_use_percent,
    vehicle_expense_type: winner.vehicle_expense_type,
    tax_treatment: winner.tax_treatment,
    linked_shift_id: winner.linked_shift_id,
  }));
}

// ── Mileage reconciliation ───────────────────────────────────────────

export function reconcileMileageEvidence(evidence: MileageEvidence[]): ReconciliationResult {
  return reconcile(evidence, (winner) => ({
    date: winner.date,
    start_location: winner.start_location,
    end_location: winner.end_location,
    start_odometer: winner.start_odometer,
    end_odometer: winner.end_odometer,
    total_miles: winner.total_miles,
    purpose: winner.purpose,
    notes: winner.notes,
    linked_shift_id: winner.linked_shift_id,
    path: winner.path ? JSON.stringify(winner.path) : undefined,
  }));
}
