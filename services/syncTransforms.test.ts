import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type DailyWorkLog, type Expense, ExpenseCategory, type Trip } from '../types';
import { applyPulledExpenses, buildSyncPayload, sanitizeExpenseForStorage } from './syncTransforms';

describe('syncTransforms', () => {
  it('buildSyncPayload includes all changed records', () => {
    const trips: Trip[] = [
      {
        id: 'trip-1',
        date: '2026-04-03',
        startLocation: 'Leeds',
        endLocation: 'Bradford',
        startOdometer: 1000,
        endOdometer: 1020,
        totalMiles: 20,
        purpose: 'Business',
        notes: 'Airport run',
      },
    ];
    const expenses: Expense[] = [
      {
        id: 'expense-1',
        date: '2026-04-03',
        category: ExpenseCategory.FUEL,
        amount: 40,
        description: 'Fuel fill',
        receiptId: 'receipt-1',
        hasReceiptImage: true,
        isVatClaimable: false,
      },
    ];
    const dailyLogs: DailyWorkLog[] = [
      {
        id: 'log-1',
        date: '2026-04-03',
        provider: 'Uber',
        hoursWorked: 6,
        revenue: 180,
        notes: 'Evening shift',
      },
    ];

    const payload = buildSyncPayload(trips, expenses, dailyLogs, DEFAULT_SETTINGS);

    expect(payload.workLogs).toHaveLength(1);
    expect(payload.mileageLogs).toHaveLength(1);
    expect(payload.expenses).toHaveLength(1);
    expect(payload.settings).toEqual(DEFAULT_SETTINGS);
    expect(payload.expenses[0]).toEqual(
      expect.objectContaining({
        id: 'expense-1',
        hasImage: true,
      })
    );
  });

  it('sanitizeExpenseForStorage strips blob URLs', () => {
    const sanitized = sanitizeExpenseForStorage({
      id: 'expense-blob',
      date: '2026-04-03',
      category: ExpenseCategory.OTHER,
      amount: 12,
      description: 'Blob receipt',
      receiptUrl: 'blob:https://driver-buddy.test/receipt-1',
      hasReceiptImage: true,
    });

    expect(sanitized.receiptUrl).toBeUndefined();
    expect(sanitized.hasReceiptImage).toBe(true);
  });

  it('applyPulledExpenses merges without duplicates', () => {
    const localExpenses: Expense[] = [
      {
        id: 'expense-1',
        date: '2026-04-05',
        category: ExpenseCategory.PARKING,
        amount: 21,
        description: 'Local newer parking',
        hasReceiptImage: false,
      },
    ];

    const merged = applyPulledExpenses(
      [
        {
          id: 'expense-1',
          date: '2026-04-03',
          category: ExpenseCategory.PARKING,
          amount: 10,
          description: JSON.stringify({ description: 'Remote older parking' }),
          has_image: 0,
        },
        {
          id: 'expense-2',
          date: '2026-04-04',
          category: ExpenseCategory.FUEL,
          amount: 45,
          description: JSON.stringify({ description: 'Remote fuel', receiptId: 'receipt-2' }),
          has_image: 1,
        },
      ],
      localExpenses
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((expense) => expense.id === 'expense-1')?.amount).toBe(21);
    expect(merged.find((expense) => expense.id === 'expense-2')).toEqual(
      expect.objectContaining({
        description: 'Remote fuel',
        receiptId: 'receipt-2',
      })
    );
  });
});
