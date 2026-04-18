import { describe, it, expect } from 'vitest';
import {
  getVehicleExpenseType,
  getTaxTreatment,
  classifyExpense,
  calcDeductibleAmount,
  sumDeductibleExpenses,
} from '../expenses';
import type { Expense } from '../../types/expense';

describe('getVehicleExpenseType', () => {
  it('classifies fuel as running_cost', () => {
    expect(getVehicleExpenseType('Fuel')).toBe('running_cost');
  });
  it('classifies parking as separately_allowable', () => {
    expect(getVehicleExpenseType('Parking/Tolls')).toBe('separately_allowable');
  });
  it('classifies phone as non_vehicle', () => {
    expect(getVehicleExpenseType('Phone')).toBe('non_vehicle');
  });
  it('classifies unknown category as non_vehicle', () => {
    expect(getVehicleExpenseType('Stationery')).toBe('non_vehicle');
  });
});

describe('getTaxTreatment', () => {
  it('personal scope is always non_deductible', () => {
    expect(getTaxTreatment('non_vehicle', 'personal', 'ACTUAL')).toBe('non_deductible');
    expect(getTaxTreatment('running_cost', 'personal', 'ACTUAL')).toBe('non_deductible');
  });
  it('running cost is blocked_under_simplified when using simplified', () => {
    expect(getTaxTreatment('running_cost', 'business', 'SIMPLIFIED')).toBe('blocked_under_simplified');
  });
  it('running cost is deductible when using actual', () => {
    expect(getTaxTreatment('running_cost', 'business', 'ACTUAL')).toBe('deductible');
  });
  it('separately_allowable is deductible even under simplified', () => {
    expect(getTaxTreatment('separately_allowable', 'business', 'SIMPLIFIED')).toBe('deductible');
  });
  it('mixed scope is partially_deductible', () => {
    expect(getTaxTreatment('non_vehicle', 'mixed', 'ACTUAL')).toBe('partially_deductible');
  });
});

describe('calcDeductibleAmount', () => {
  it('fully deductible expense returns full amount', () => {
    const result = calcDeductibleAmount(100, 'deductible', 100);
    expect(result).toEqual({ deductibleAmount: 100, nonDeductibleAmount: 0 });
  });
  it('blocked expense returns 0 deductible', () => {
    const result = calcDeductibleAmount(100, 'blocked_under_simplified', 100);
    expect(result).toEqual({ deductibleAmount: 0, nonDeductibleAmount: 100 });
  });
  it('non_deductible returns 0 deductible', () => {
    const result = calcDeductibleAmount(100, 'non_deductible', 100);
    expect(result).toEqual({ deductibleAmount: 0, nonDeductibleAmount: 100 });
  });
  it('partially_deductible uses businessUsePercent', () => {
    const result = calcDeductibleAmount(100, 'partially_deductible', 60);
    expect(result).toEqual({ deductibleAmount: 60, nonDeductibleAmount: 40 });
  });
});

describe('sumDeductibleExpenses', () => {
  it('sums deductibleAmount across all expenses', () => {
    const expenses = [{ deductibleAmount: 50 }, { deductibleAmount: 30 }, { deductibleAmount: 20 }] as Expense[];
    expect(sumDeductibleExpenses(expenses)).toBe(100);
  });
  it('returns 0 for empty array', () => {
    expect(sumDeductibleExpenses([])).toBe(0);
  });
});
