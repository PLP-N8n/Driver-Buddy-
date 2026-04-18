import { describe, it, expect } from 'vitest';
import {
  calcSimplifiedDeduction,
  calcActualDeduction,
  compareTaxMethods,
  calcTaxableProfit,
  calcTaxBuffer,
  calcKept,
} from '../tax';
import type { Expense } from '../../types/expense';

const makeExpense = (deductible: number): Expense =>
  ({
    id: '1',
    date: '2026-04-01',
    category: 'Phone',
    amount: deductible,
    description: '',
    scope: 'business',
    businessUsePercent: 100,
    deductibleAmount: deductible,
    nonDeductibleAmount: 0,
    vehicleExpenseType: 'non_vehicle',
    taxTreatment: 'deductible',
    sourceType: 'manual',
    reviewStatus: 'confirmed',
  } as Expense);

describe('calcSimplifiedDeduction', () => {
  it('returns 45p per mile for <=10000 miles', () => {
    expect(calcSimplifiedDeduction(100)).toBeCloseTo(45);
  });
  it('uses split rate above 10000', () => {
    expect(calcSimplifiedDeduction(11000)).toBeCloseTo(4750);
  });
});

describe('calcActualDeduction', () => {
  it('sums deductible amounts', () => {
    expect(calcActualDeduction([makeExpense(200), makeExpense(100)])).toBe(300);
  });
  it('returns 0 for empty array', () => {
    expect(calcActualDeduction([])).toBe(0);
  });
});

describe('compareTaxMethods', () => {
  it('recommends simplified when it is higher', () => {
    const result = compareTaxMethods(10000, [], { rateFirst10k: 0.45, rateAfter10k: 0.25 });
    expect(result.simplified).toBeCloseTo(4500);
    expect(result.actual).toBe(0);
    expect(result.recommended).toBe('simplified');
  });
  it('recommends actual when it is higher', () => {
    const expenses = [makeExpense(5000)];
    const result = compareTaxMethods(1000, expenses, { rateFirst10k: 0.45, rateAfter10k: 0.25 });
    expect(result.actual).toBe(5000);
    expect(result.recommended).toBe('actual');
  });
  it('saving is the absolute difference', () => {
    const result = compareTaxMethods(1000, [makeExpense(0)], { rateFirst10k: 0.45, rateAfter10k: 0.25 });
    expect(result.saving).toBeCloseTo(450);
  });
});

describe('calcTaxableProfit', () => {
  it('subtracts deduction and personal allowance', () => {
    expect(calcTaxableProfit(20000, 4500, 12570)).toBeCloseTo(2930);
  });
  it('never returns negative', () => {
    expect(calcTaxableProfit(5000, 4500, 12570)).toBe(0);
  });
});

describe('calcTaxBuffer', () => {
  it('returns correct percentage', () => {
    expect(calcTaxBuffer(10000, 20)).toBe(2000);
  });
});

describe('calcKept', () => {
  it('applies canonical formula', () => {
    // 1000 earnings - 200 expenses - 200 tax buffer = 600
    expect(calcKept(1000, 200, 200)).toBe(600);
  });
  it('can return negative if costs exceed earnings', () => {
    expect(calcKept(100, 200, 50)).toBe(-150);
  });
});
