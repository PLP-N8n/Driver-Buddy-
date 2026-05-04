import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseCategory, type Expense } from '../types';
import { useHydration } from './useHydration';

const mocks = vi.hoisted(() => ({
  getBackupCode: vi.fn(() => 'backup-code'),
  initOPFS: vi.fn(),
  prepareExpensesForLocalState: vi.fn(),
}));

vi.mock('../services/deviceId', () => ({
  getBackupCode: mocks.getBackupCode,
}));

vi.mock('../services/opfsStore', () => ({
  initOPFS: mocks.initOPFS,
}));

vi.mock('../services/syncTransforms', () => ({
  prepareExpensesForLocalState: mocks.prepareExpensesForLocalState,
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe('useHydration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('flips hasHydrated only after expense prep and receipt storage init finish', async () => {
    const initDeferred = createDeferred<void>();
    const prepareDeferred = createDeferred<Expense[]>();
    const storedExpense: Expense = {
      id: 'expense-stored',
      date: '2026-04-10',
      category: ExpenseCategory.PARKING,
      amount: 12,
      description: 'Stored parking',
      hasReceiptImage: true,
      receiptUrl: 'data:image/png;base64,abc',
    };
    const preparedExpense: Expense = {
      ...storedExpense,
      receiptUrl: undefined,
    };
    mocks.initOPFS.mockReturnValue(initDeferred.promise);
    mocks.prepareExpensesForLocalState.mockReturnValue(prepareDeferred.promise);
    localStorage.setItem('driver_expenses', JSON.stringify([storedExpense]));

    const setExpenses = vi.fn();
    const setHasHydrated = vi.fn();
    const setBackupCode = vi.fn();

    renderHook(() =>
      useHydration({
        setTrips: vi.fn(),
        setExpenses,
        setDailyLogs: vi.fn(),
        setActiveSession: vi.fn(),
        setCompletedShiftSummary: vi.fn(),
        setSettings: vi.fn(),
        setPlayerStats: vi.fn(),
        setHasHydrated,
        setBackupCode,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.prepareExpensesForLocalState).toHaveBeenCalledWith([
      expect.objectContaining({
        id: storedExpense.id,
        receiptUrl: storedExpense.receiptUrl,
      }),
    ]);
    expect(setHasHydrated).not.toHaveBeenCalled();

    await act(async () => {
      prepareDeferred.resolve([preparedExpense]);
      await Promise.resolve();
    });

    expect(setExpenses).toHaveBeenCalledWith([preparedExpense]);
    expect(setHasHydrated).not.toHaveBeenCalled();

    await act(async () => {
      initDeferred.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(setBackupCode).toHaveBeenCalledWith('backup-code');
    expect(setHasHydrated).toHaveBeenCalledWith(true);
  });
});
