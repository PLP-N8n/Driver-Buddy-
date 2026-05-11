import { describe, it, expect } from 'vitest';
import { reconcileShiftEvidence } from './reconciliation';
import type { ShiftEvidence } from '../types';

function makeEvidence(overrides: Partial<ShiftEvidence> & { id: string }): ShiftEvidence {
  return {
    source_type: 'manual',
    source_detail: 'user',
    confidence: 0.5,
    created_at: '2026-05-10T08:00:00Z',
    date: '2026-05-10',
    hours_worked: 4,
    earnings: 60,
    ...overrides,
  };
}

describe('reconcileShiftEvidence', () => {
  it('auto-promotes high-confidence evidence with no conflicts', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'api', source_detail: 'uber_api', confidence: 0.95, hours_worked: 3.75, earnings: 58.50 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('promoted');
    if (result.status === 'promoted') {
      expect(result.ledgerEntry?.hours_worked).toBe(3.75);
      expect(result.ledgerEntry?.total_earnings).toBe(58.50);
    }
  });

  it('creates dispute when two records have similar confidence', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'manual', source_detail: 'user', confidence: 0.5, hours_worked: 4, earnings: 60 }),
      makeEvidence({ id: 'e2', source_type: 'ocr', source_detail: 'screenshot', confidence: 0.7, hours_worked: 3.5, earnings: 55 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('disputed');
    if (result.status === 'disputed') {
      expect(result.disputeCandidates).toHaveLength(2);
    }
  });

  it('auto-resolves when confidence gap is large enough', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'manual', source_detail: 'user', confidence: 0.5, hours_worked: 4, earnings: 60 }),
      makeEvidence({ id: 'e2', source_type: 'api', source_detail: 'uber_api', confidence: 0.95, hours_worked: 3.75, earnings: 58.50 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('promoted');
    if (result.status === 'promoted') {
      expect(result.ledgerEntry?.hours_worked).toBe(3.75);
    }
  });

  it('deduplicates same-source evidence (newest wins)', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'api', source_detail: 'uber_api', confidence: 0.95, created_at: '2026-05-10T09:00:00Z', hours_worked: 3.5, earnings: 55 }),
      makeEvidence({ id: 'e2', source_type: 'api', source_detail: 'uber_api', confidence: 0.95, created_at: '2026-05-10T10:00:00Z', hours_worked: 3.75, earnings: 58 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('promoted');
    if (result.status === 'promoted') {
      expect(result.ledgerEntry?.hours_worked).toBe(3.75);
      expect(result.ledgerEntry?.total_earnings).toBe(58);
    }
  });

  it('returns idle for empty evidence', () => {
    const result = reconcileShiftEvidence([]);
    expect(result.status).toBe('idle');
  });
});
