import { useEffect, useMemo, useState } from 'react';
import { getImage, requestReceiptUpload } from '../services/imageStore';
import {
  listAll,
  ReceiptUploadStatus,
  ReceiptUploadStatusRow,
  setStatus,
  subscribeUploadStatus,
} from '../services/uploadStatusStore';

type UploadResult = Awaited<ReturnType<typeof requestReceiptUpload>>;

const inFlightUploads = new Map<string, Promise<UploadResult>>();

type UseReceiptUploadOptions = {
  onUploadFailed?: (expenseId: string, errorReason?: string) => void;
};

function filenameFor(expenseId: string, blob: Blob): string {
  const mimeExtension = blob.type.split('/')[1]?.split(';')[0];
  return `${expenseId}.${mimeExtension || 'bin'}`;
}

export function useReceiptUpload({ onUploadFailed }: UseReceiptUploadOptions = {}) {
  const [rows, setRows] = useState<ReceiptUploadStatusRow[]>([]);

  const refresh = async () => {
    setRows(await listAll());
  };

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeUploadStatus(() => {
      void refresh();
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const statusByExpenseId = useMemo(() => new Map(rows.map((row) => [row.expenseId, row])), [rows]);

  const upload = async (expenseId: string, blob: Blob) => {
    const existing = inFlightUploads.get(expenseId);
    if (existing) return existing;

    const promise = requestReceiptUpload(blob, expenseId, filenameFor(expenseId, blob))
      .then((result) => {
        if (result?.status === 'failed') {
          onUploadFailed?.(expenseId, result.errorReason);
        }
        return result;
      })
      .finally(() => {
        inFlightUploads.delete(expenseId);
      });
    inFlightUploads.set(expenseId, promise);
    return promise;
  };

  const retry = async (expenseId: string) => {
    const blob = await getImage(expenseId);
    if (!blob) {
      await setStatus(expenseId, { status: 'failed', lastAttemptAt: Date.now(), errorReason: 'missing_local_receipt' });
      onUploadFailed?.(expenseId, 'missing_local_receipt');
      return null;
    }
    return upload(expenseId, blob);
  };

  const retryAll = async () => {
    const failedRows = rows.filter((row) => row.status === 'failed');
    await Promise.all(failedRows.map((row) => retry(row.expenseId)));
  };

  const getStatus = (expenseId: string): ReceiptUploadStatus | null => statusByExpenseId.get(expenseId)?.status ?? null;

  return {
    rows,
    getStatus,
    upload,
    retry,
    retryAll,
  };
}
