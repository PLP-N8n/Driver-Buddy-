import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type ActiveWorkSession,
  type CompletedShiftSummary,
  type DailyWorkLog,
  type Expense,
  ExpenseCategory,
  type Trip,
} from '../../types';
import { useDriverLedger } from '../useDriverLedger';

vi.mock('../../services/analyticsService', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../../src/sentry', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const makeExpense = (id: string, overrides: Partial<Expense> = {}): Expense => ({
  id,
  date: '2026-04-30',
  category: ExpenseCategory.PHONE,
  amount: 50,
  description: 'Expense',
  scope: 'business',
  businessUsePercent: 100,
  deductibleAmount: 50,
  nonDeductibleAmount: 0,
  vehicleExpenseType: 'non_vehicle',
  taxTreatment: 'deductible',
  sourceType: 'manual',
  reviewStatus: 'confirmed',
  updatedAt: '2026-04-30T10:00:00.000Z',
  ...overrides,
});

function renderDriverLedgerHook(options?: {
  trips?: Trip[];
  dailyLogs?: DailyWorkLog[];
  expenses?: Expense[];
}) {
  return renderHook(() => {
    const [trips, setTrips] = useState<Trip[]>(options?.trips ?? []);
    const [expenses, setExpenses] = useState<Expense[]>(options?.expenses ?? []);
    const [dailyLogs, setDailyLogs] = useState<DailyWorkLog[]>(options?.dailyLogs ?? []);
    const [activeSession, setActiveSession] = useState<ActiveWorkSession | null>(null);
    const [, setCompletedShiftSummary] = useState<CompletedShiftSummary | null>(null);

    const ledger = useDriverLedger({
      trips,
      setTrips,
      expenses,
      setExpenses,
      dailyLogs,
      setDailyLogs,
      activeSession,
      setActiveSession,
      setCompletedShiftSummary,
      settings: DEFAULT_SETTINGS,
    });

    return {
      ...ledger,
      state: { expenses },
    };
  });
}

describe('useDriverLedger expense reclassification', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('reclassifies vehicle-running expenses when switching to actual costs', () => {
    const { result } = renderDriverLedgerHook({
      expenses: [
        makeExpense('fuel', {
          category: ExpenseCategory.FUEL,
          amount: 50,
          deductibleAmount: 0,
          nonDeductibleAmount: 50,
          vehicleExpenseType: 'running_cost',
          taxTreatment: 'blocked_under_simplified',
        }),
        makeExpense('insurance', {
          category: ExpenseCategory.INSURANCE,
          amount: 100,
          deductibleAmount: 0,
          nonDeductibleAmount: 100,
          vehicleExpenseType: 'running_cost',
          taxTreatment: 'blocked_under_simplified',
        }),
      ],
    });
    let changedCount = 0;

    act(() => {
      changedCount = result.current.reclassifyExpensesForMethod('ACTUAL');
    });

    expect(changedCount).toBeGreaterThan(0);
    expect(result.current.state.expenses.map((expense) => expense.taxTreatment)).toEqual(['deductible', 'deductible']);
  });

  it('returns zero and leaves expenses unchanged when no vehicle-running expenses exist', () => {
    const initialExpenses = [makeExpense('phone')];
    const { result } = renderDriverLedgerHook({
      expenses: initialExpenses,
    });
    let changedCount = -1;

    act(() => {
      changedCount = result.current.reclassifyExpensesForMethod('ACTUAL');
    });

    expect(changedCount).toBe(0);
    expect(result.current.state.expenses).toEqual(initialExpenses);
  });
});
