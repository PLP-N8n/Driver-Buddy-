import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Expense } from '../types';
import * as Sentry from '../src/sentry';
import { getImage, isR2UploadConfigured, migrateLegacyReceipt, requestReceiptUpload } from '../services/imageStore';
import { sanitizeExpenseForStorage } from '../services/syncTransforms';

type UseReceiptMigrationParams = {
  expenses: Expense[];
  hasHydrated: boolean;
  isOnline: boolean;
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
};

export function useReceiptMigration({
  expenses,
  hasHydrated,
  isOnline,
  setExpenses,
}: UseReceiptMigrationParams) {
  const receiptSyncInFlightRef = useRef<Set<string>>(new Set());
  const legacyReceiptMigrationStartedRef = useRef(false);

  useEffect(() => {
    if (!hasHydrated || legacyReceiptMigrationStartedRef.current || !isR2UploadConfigured()) return;

    legacyReceiptMigrationStartedRef.current = true;
    const needsMigration = expenses.filter((expense) => expense.receiptUrl && !expense.receiptId);
    if (needsMigration.length === 0) return;

    needsMigration.forEach((expense) => {
      void (async () => {
        const receiptId = await migrateLegacyReceipt(expense.receiptUrl!);
        if (!receiptId) return;

        setExpenses((current) =>
          current.map((item) =>
            item.id === expense.id
              ? sanitizeExpenseForStorage({
                  ...item,
                  receiptId,
                })
              : item
          )
        );
      })();
    });
  }, [expenses, hasHydrated, setExpenses]);

  useEffect(() => {
    if (!hasHydrated || !isOnline || !isR2UploadConfigured()) return;

    const pendingExpenses = expenses.filter(
      (expense) =>
        expense.hasReceiptImage &&
        !expense.receiptId &&
        !receiptSyncInFlightRef.current.has(expense.id)
    );

    if (pendingExpenses.length === 0) return;

    let cancelled = false;

    const syncReceiptsToR2 = async () => {
      for (const expense of pendingExpenses) {
        receiptSyncInFlightRef.current.add(expense.id);

        try {
          const blob = await getImage(expense.id);
          if (!blob) continue;

          const mimeExtension = blob.type.split('/')[1]?.split(';')[0];
          const filename = `${expense.id}.${mimeExtension || 'bin'}`;
          const result = await requestReceiptUpload(blob, expense.id, filename);
          if (!result) continue;

          if (cancelled) return;

          setExpenses((current) =>
            current.map((item) =>
              item.id === expense.id
                ? sanitizeExpenseForStorage({
                    ...item,
                    receiptId: result.receiptId,
                    hasReceiptImage: true,
                  })
                : item
            )
          );
        } catch (error) {
          Sentry.captureException(error);
        } finally {
          receiptSyncInFlightRef.current.delete(expense.id);
        }
      }
    };

    void syncReceiptsToR2();

    return () => {
      cancelled = true;
    };
  }, [expenses, hasHydrated, isOnline, setExpenses]);
}
