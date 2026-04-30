import type { ReceiptUploadStatusRow } from '../services/uploadStatusStore';

export type ReceiptStats = {
  total: number;
  synced: number;
  uploading: number;
  failed: number;
  localOnly: number;
};

export function computeReceiptStats(rows: ReceiptUploadStatusRow[]): ReceiptStats {
  return {
    total: rows.length,
    synced: rows.filter((r) => r.status === 'synced').length,
    uploading: rows.filter((r) => r.status === 'uploading').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    localOnly: rows.filter((r) => r.status !== 'synced' && r.status !== 'uploading' && r.status !== 'failed').length,
  };
}
