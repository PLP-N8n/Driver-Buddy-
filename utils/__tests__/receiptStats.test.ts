import { describe, expect, it } from 'vitest';
import { computeReceiptStats } from '../receiptStats';
import type { ReceiptUploadStatusRow } from '../../services/uploadStatusStore';

function row(expenseId: string, status: ReceiptUploadStatusRow['status']): ReceiptUploadStatusRow {
  return { expenseId, status, lastAttemptAt: 0 };
}

describe('computeReceiptStats', () => {
  it('returns all zeros for an empty array', () => {
    expect(computeReceiptStats([])).toEqual({ total: 0, synced: 0, uploading: 0, failed: 0, localOnly: 0 });
  });

  it('counts each status correctly from a mixed array', () => {
    const rows: ReceiptUploadStatusRow[] = [
      row('a', 'synced'),
      row('b', 'synced'),
      row('c', 'uploading'),
      row('d', 'failed'),
      row('e', 'pending'),
      row('f', 'local-only'),
    ];
    expect(computeReceiptStats(rows)).toEqual({
      total: 6,
      synced: 2,
      uploading: 1,
      failed: 1,
      localOnly: 2,
    });
  });

  it('treats pending and local-only as localOnly', () => {
    const rows: ReceiptUploadStatusRow[] = [row('a', 'pending'), row('b', 'local-only')];
    const stats = computeReceiptStats(rows);
    expect(stats.localOnly).toBe(2);
    expect(stats.synced).toBe(0);
    expect(stats.failed).toBe(0);
  });

  it('counts only failed rows when all are failed', () => {
    const rows = [row('a', 'failed'), row('b', 'failed')];
    const stats = computeReceiptStats(rows);
    expect(stats.failed).toBe(2);
    expect(stats.localOnly).toBe(0);
  });
});
