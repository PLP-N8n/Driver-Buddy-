import { describe, it, expect } from 'vitest';
import { calcTrueTakeHome } from '../trueTakeHome';
import type { Expense } from '../../../types';
import { ExpenseCategory } from '../../../types';

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e1',
    date: '2026-05-10',
    category: ExpenseCategory.PARKING,
    amount: 10,
    description: 'Test',
    ...overrides,
  };
}

describe('calcTrueTakeHome', () => {
  it('computes take-home under simplified method with mileage deduction', () => {
    const result = calcTrueTakeHome({
      grossEarnings: 200,
      businessMiles: 50,
      expenses: [],
      claimMethod: 'SIMPLIFIED',
      taxSetAsidePercent: 20,
    });

    expect(result.grossEarnings).toBe(200);
    expect(result.taxSetAside).toBe(40); // 20% of 200
    expect(result.vehicleCostDeduction).toBe(22.5); // 50 * 0.45
    expect(result.otherBusinessExpenses).toBe(0);
    expect(result.totalDeductions).toBe(22.5);
    expect(result.trueTakeHome).toBe(137.5); // 200 - 22.5 - 40
  });

  it('computes take-home under actual method with real vehicle expenses', () => {
    const fuelExpense = makeExpense({
      id: 'e-fuel',
      category: ExpenseCategory.FUEL,
      amount: 30,
      taxTreatment: 'deductible',
    });
    const parkingExpense = makeExpense({
      id: 'e-park',
      category: ExpenseCategory.PARKING,
      amount: 5,
    });

    const result = calcTrueTakeHome({
      grossEarnings: 200,
      businessMiles: 50,
      expenses: [fuelExpense, parkingExpense],
      claimMethod: 'ACTUAL',
      taxSetAsidePercent: 20,
    });

    expect(result.vehicleCostDeduction).toBe(30);
    expect(result.otherBusinessExpenses).toBe(5);
    expect(result.totalDeductions).toBe(35);
    expect(result.trueTakeHome).toBe(125); // 200 - 35 - 40
  });

  it('returns taxSetAside=0 and allows negative take-home for zero earnings', () => {
    const result = calcTrueTakeHome({
      grossEarnings: 0,
      businessMiles: 0,
      expenses: [makeExpense({ category: ExpenseCategory.PARKING, amount: 20 })],
      claimMethod: 'SIMPLIFIED',
      taxSetAsidePercent: 20,
    });

    expect(result.taxSetAside).toBe(0);
    expect(result.trueTakeHome).toBe(-20); // 0 - 20 - 0
  });

  it('vehicleCostPerMile override works under simplified method', () => {
    const result = calcTrueTakeHome({
      grossEarnings: 300,
      businessMiles: 100,
      expenses: [],
      claimMethod: 'SIMPLIFIED',
      taxSetAsidePercent: 20,
      vehicleCostPerMile: 0.30,
    });

    expect(result.vehicleCostDeduction).toBe(30); // 100 * 0.30
  });

  it('includes non-vehicle expenses in otherBusinessExpenses', () => {
    const phoneExpense = makeExpense({
      id: 'e-phone',
      category: ExpenseCategory.PHONE,
      amount: 15,
    });

    const result = calcTrueTakeHome({
      grossEarnings: 100,
      businessMiles: 0,
      expenses: [phoneExpense],
      claimMethod: 'ACTUAL',
      taxSetAsidePercent: 20,
    });

    expect(result.otherBusinessExpenses).toBe(15);
    expect(result.vehicleCostDeduction).toBe(0);
  });

  it('handles no expenses — only mileage-based deductions', () => {
    const result = calcTrueTakeHome({
      grossEarnings: 150,
      businessMiles: 40,
      expenses: [],
      claimMethod: 'SIMPLIFIED',
      taxSetAsidePercent: 20,
    });

    expect(result.vehicleCostDeduction).toBe(18); // 40 * 0.45
    expect(result.otherBusinessExpenses).toBe(0);
  });

  it('handles expenses with taxTreatment blocked_under_simplified', () => {
    const fuelExpense = makeExpense({
      id: 'e-fuel',
      category: ExpenseCategory.FUEL,
      amount: 25,
      taxTreatment: 'blocked_under_simplified',
    });

    const result = calcTrueTakeHome({
      grossEarnings: 100,
      businessMiles: 20,
      expenses: [fuelExpense],
      claimMethod: 'SIMPLIFIED',
      taxSetAsidePercent: 20,
    });

    expect(result.otherBusinessExpenses).toBe(0);
    expect(result.vehicleCostDeduction).toBe(9); // 20 * 0.45, not double-counted
  });
});
