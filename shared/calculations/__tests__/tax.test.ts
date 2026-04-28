import { describe, it, expect } from 'vitest';
import {
  calcSimplifiedDeduction,
  calcActualDeduction,
  calcVehicleTaxDeductions,
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

describe('calcVehicleTaxDeductions', () => {
  it('excludes EV charging from simplified mileage and includes parking separately', () => {
    const result = calcVehicleTaxDeductions({
      expenses: [
        { category: 'Public Charging', amount: 100 },
        { category: 'Home Charging', amount: 50 },
        { category: 'Parking/Tolls', amount: 20 },
      ],
      totalMileageAllowance: 45,
      businessUsePercent: 1,
    });

    expect(result.vehicleRunningCosts).toBe(150);
    expect(result.otherBusinessExpenses).toBe(20);
    expect(result.simplifiedDeduction).toBe(65);
  });

  it('apportions vehicle running costs by business use for actual costs', () => {
    const result = calcVehicleTaxDeductions({
      expenses: [
        { category: 'Fuel', amount: 100 },
        { category: 'Public Charging', amount: 80 },
        { category: 'Phone', amount: 30 },
      ],
      totalMileageAllowance: 0,
      businessUsePercent: 0.5,
    });

    expect(result.vehicleRunningCosts).toBe(180);
    expect(result.otherBusinessExpenses).toBe(30);
    expect(result.actualDeduction).toBe(120);
  });

  it('uses VAT-exclusive amounts when expenses are VAT claimable', () => {
    const result = calcVehicleTaxDeductions({
      expenses: [
        { category: 'Fuel', amount: 120, isVatClaimable: true },
        { category: 'Parking/Tolls', amount: 12, isVatClaimable: true },
      ],
      totalMileageAllowance: 0,
      businessUsePercent: 1,
    });

    expect(result.vehicleRunningCosts).toBe(100);
    expect(result.otherBusinessExpenses).toBe(10);
    expect(result.actualDeduction).toBe(110);
  });

  it('excludes personal-scope expense from otherBusinessExpenses when taxTreatment is stored', () => {
    const result = calcVehicleTaxDeductions({
      expenses: [
        { category: 'Phone', amount: 50, taxTreatment: 'non_deductible', deductibleAmount: 0 },
        { category: 'Phone', amount: 30, taxTreatment: 'deductible', deductibleAmount: 30 },
      ],
      totalMileageAllowance: 0,
      businessUsePercent: 1,
    });
    expect(result.otherBusinessExpenses).toBe(30);
  });

  it('uses deductibleAmount for mixed-use non-vehicle expense', () => {
    const result = calcVehicleTaxDeductions({
      expenses: [
        { category: 'Phone', amount: 100, taxTreatment: 'partially_deductible', deductibleAmount: 80 },
      ],
      totalMileageAllowance: 0,
      businessUsePercent: 1,
    });
    expect(result.otherBusinessExpenses).toBe(80);
    expect(result.actualDeduction).toBe(80);
  });

  it('excludes personal-scope fuel from vehicle running costs', () => {
    const result = calcVehicleTaxDeductions({
      expenses: [
        { category: 'Fuel', amount: 100, taxTreatment: 'non_deductible', deductibleAmount: 0 },
        { category: 'Fuel', amount: 60, taxTreatment: 'blocked_under_simplified', deductibleAmount: 0 },
      ],
      totalMileageAllowance: 0,
      businessUsePercent: 1,
    });
    expect(result.vehicleRunningCosts).toBe(60);
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
