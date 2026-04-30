import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ExpenseCategory, type DailyWorkLog, type Expense, type Settings, type Trip } from '../../types';
import { buildMonthlySummaries } from '../monthlySummary';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  businessRateFirst10k: 0.45,
  businessRateAfter10k: 0.25,
  taxSetAsidePercent: 20,
};

const makeLog = (id: string, overrides: Partial<DailyWorkLog>): DailyWorkLog => ({
  id,
  date: '2026-03-15',
  provider: 'Uber',
  hoursWorked: 4,
  revenue: 100,
  ...overrides,
});

const makeExpense = (id: string, overrides: Partial<Expense>): Expense => ({
  id,
  date: '2026-03-15',
  category: ExpenseCategory.FUEL,
  amount: 20,
  description: 'Fuel',
  ...overrides,
});

const makeTrip = (id: string, overrides: Partial<Trip>): Trip => ({
  id,
  date: '2026-03-15',
  startLocation: 'Start',
  endLocation: 'End',
  startOdometer: 10_000,
  endOdometer: 10_100,
  totalMiles: 100,
  purpose: 'Business',
  notes: '',
  ...overrides,
});

describe('buildMonthlySummaries', () => {
  it('aggregates logs in different months correctly', () => {
    const result = buildMonthlySummaries(
      [
        makeLog('jan-1', { date: '2026-01-04', revenue: 120 }),
        makeLog('jan-2', { date: '2026-01-19', revenue: 80 }),
        makeLog('feb-1', { date: '2026-02-02', revenue: 90 }),
      ],
      [],
      [
        makeExpense('jan-expense', { date: '2026-01-20', amount: 35 }),
        makeExpense('feb-expense', { date: '2026-02-03', amount: 15 }),
      ],
      settings,
      2025
    );

    expect(result.map((month) => month.yearMonth)).toEqual(['2026-01', '2026-02']);
    expect(result[0]).toMatchObject({
      earnings: 200,
      expenses: 35,
      estimatedTax: 40,
      kept: 125,
      shiftCount: 2,
    });
    expect(result[1]).toMatchObject({
      earnings: 90,
      expenses: 15,
      estimatedTax: 18,
      kept: 57,
      shiftCount: 1,
    });
  });

  it('calculates mileage claim value with calcMileageAllowance rates', () => {
    const result = buildMonthlySummaries(
      [makeLog('shift-1', { date: '2026-03-12', revenue: 200 })],
      [
        makeTrip('business-1', { date: '2026-03-12', totalMiles: 100, purpose: 'Business' }),
        makeTrip('business-2', { date: '2026-03-18', totalMiles: 50, purpose: 'Business' }),
        makeTrip('personal-1', { date: '2026-03-18', totalMiles: 40, purpose: 'Personal' }),
      ],
      [],
      {
        ...settings,
        businessRateFirst10k: 0.5,
        businessRateAfter10k: 0.3,
      },
      2025
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.mileageClaimValue).toBeCloseTo(75);
  });

  it('excludes months outside the selected tax year boundaries', () => {
    const result = buildMonthlySummaries(
      [
        makeLog('before-start', { date: '2025-04-05', revenue: 500 }),
        makeLog('inside-start', { date: '2025-04-06', revenue: 100 }),
        makeLog('inside-end', { date: '2026-04-05', revenue: 150 }),
        makeLog('after-end', { date: '2026-04-06', revenue: 700 }),
      ],
      [],
      [
        makeExpense('before-start-expense', { date: '2025-04-05', amount: 300 }),
        makeExpense('inside-start-expense', { date: '2025-04-06', amount: 20 }),
        makeExpense('inside-end-expense', { date: '2026-04-05', amount: 30 }),
        makeExpense('after-end-expense', { date: '2026-04-06', amount: 400 }),
      ],
      settings,
      2025
    );

    expect(result.map((month) => month.yearMonth)).toEqual(['2025-04', '2026-04']);
    expect(result[0]?.earnings).toBe(100);
    expect(result[0]?.expenses).toBe(20);
    expect(result[1]?.earnings).toBe(150);
    expect(result[1]?.expenses).toBe(30);
  });

  it('excludes months with no shifts', () => {
    const result = buildMonthlySummaries(
      [makeLog('shift-1', { date: '2026-01-10', revenue: 100 })],
      [makeTrip('feb-trip', { date: '2026-02-10', totalMiles: 100 })],
      [makeExpense('feb-expense', { date: '2026-02-10', amount: 60 })],
      settings,
      2025
    );

    expect(result.map((month) => month.yearMonth)).toEqual(['2026-01']);
  });

  it('allows kept to be negative', () => {
    const result = buildMonthlySummaries(
      [makeLog('shift-1', { date: '2026-03-10', revenue: 100 })],
      [],
      [makeExpense('expense-1', { date: '2026-03-11', amount: 140 })],
      settings,
      2025
    );

    expect(result[0]?.estimatedTax).toBe(20);
    expect(result[0]?.kept).toBe(-60);
  });
});
