import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ExpenseCategory, type DailyWorkLog, type Expense, type Settings, type Trip } from '../../types';
import { buildHealthCheck } from '../healthCheck';

const today = '2026-04-30';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  taxSetAsidePercent: 20,
};

const makeLog = (id: string, overrides: Partial<DailyWorkLog> = {}): DailyWorkLog => ({
  id,
  date: today,
  provider: 'Uber',
  hoursWorked: 4,
  revenue: 100,
  linkedTripId: 'trip-1',
  ...overrides,
});

const makeExpense = (id: string, overrides: Partial<Expense> = {}): Expense => ({
  id,
  date: today,
  category: ExpenseCategory.FUEL,
  amount: 30,
  description: 'Fuel',
  ...overrides,
});

const trips: Trip[] = [{
  id: 'trip-1',
  date: today,
  startLocation: 'Start',
  endLocation: 'End',
  startOdometer: 10_000,
  endOdometer: 10_040,
  totalMiles: 40,
  purpose: 'Business',
  notes: '',
}];

describe('buildHealthCheck', () => {
  it('marks all signals good when there are no recent shifts', () => {
    const result = buildHealthCheck([
      makeLog('old-log', {
        date: '2026-04-01',
        linkedTripId: undefined,
      }),
    ], trips, [], settings, today);

    expect(result).toMatchObject({
      status: 'good',
      taxSignal: 'good',
      expenseSignal: 'good',
      mileageSignal: 'good',
      summary: 'You are on track this week.',
      details: [],
    });
  });

  it('marks all signals good when recent shifts have expenses and mileage', () => {
    const result = buildHealthCheck([
      makeLog('log-1', { date: '2026-04-29', linkedTripId: 'trip-1' }),
      makeLog('log-2', { linkedTripId: 'trip-1' }),
    ], trips, [
      makeExpense('expense-1'),
    ], settings, today);

    expect(result).toMatchObject({
      status: 'good',
      taxSignal: 'good',
      expenseSignal: 'good',
      mileageSignal: 'good',
      details: [],
    });
  });

  it('flags attention when recent shifts exist but no expenses were logged in the past 7 days', () => {
    const result = buildHealthCheck([
      makeLog('log-1', { linkedTripId: 'trip-1' }),
    ], trips, [
      makeExpense('old-expense', { date: '2026-04-20' }),
    ], settings, today);

    expect(result.expenseSignal).toBe('attention');
    expect(result.status).toBe('attention');
    expect(result.details).toContain('No expenses logged this week -- did you have fuel or parking costs?');
  });

  it('flags warning when most recent shifts are missing linked mileage', () => {
    const result = buildHealthCheck([
      makeLog('log-1', { date: '2026-04-28', linkedTripId: undefined }),
      makeLog('log-2', { date: '2026-04-29', linkedTripId: undefined }),
      makeLog('log-3', { linkedTripId: 'trip-1' }),
    ], trips, [
      makeExpense('expense-1'),
    ], settings, today);

    expect(result.mileageSignal).toBe('warning');
    expect(result.status).toBe('warning');
    expect(result.details).toContain('Some shifts are missing mileage -- tap a shift to add it.');
  });

  it('uses the worst signal as the overall status', () => {
    const result = buildHealthCheck([
      makeLog('log-1', { date: '2026-04-28', linkedTripId: undefined }),
      makeLog('log-2', { date: '2026-04-29', linkedTripId: undefined }),
      makeLog('log-3', { linkedTripId: 'trip-1' }),
    ], trips, [], {
      ...settings,
      taxSetAsidePercent: 0,
    }, today);

    expect(result.taxSignal).toBe('attention');
    expect(result.expenseSignal).toBe('attention');
    expect(result.mileageSignal).toBe('warning');
    expect(result.status).toBe('warning');
    expect(result.summary).toBe('A few things need attention.');
  });
});
