import { describe, expect, it } from 'vitest';
import {
  buildTaxAnalysis,
  buildProjection,
  calculateClass2NI,
  calculateEnglishIncomeTax,
  calculateMileageClaim,
  calculateScottishIncomeTax,
  getPersonalAllowance,
  paymentsOnAccountAmount,
  requiresPaymentsOnAccount,
} from './tax';
import { DEFAULT_SETTINGS, ExpenseCategory } from '../types';

const assertCloseTo = (actual: number, expected: number, precision = 2) => {
  const tolerance = 10 ** -precision;
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

describe('personal allowance taper', () => {
  it('is 12,570 at income 99,999', () => {
    expect(getPersonalAllowance(99_999)).toBe(12_570);
  });

  it('is 6,285 at income 112,570', () => {
    expect(getPersonalAllowance(112_570)).toBe(6_285);
  });

  it('is 0 at income 125,140', () => {
    expect(getPersonalAllowance(125_140)).toBe(0);
  });

  it('is 0 at income above 125,140', () => {
    expect(getPersonalAllowance(130_000)).toBe(0);
  });
});

describe('requiresPaymentsOnAccount', () => {
  it('returns false when liability < 1,000', () => {
    expect(requiresPaymentsOnAccount(999, 0)).toBe(false);
  });

  it('returns false when >80% collected at source', () => {
    expect(requiresPaymentsOnAccount(5_000, 4_001)).toBe(false);
  });

  it('returns true when liability >= 1,000 and <80% at source', () => {
    expect(requiresPaymentsOnAccount(5_000, 2_000)).toBe(true);
  });
});

describe('paymentsOnAccountAmount', () => {
  it('returns half the last year liability', () => {
    expect(paymentsOnAccountAmount(4_000)).toBe(2_000);
  });
});

describe('calculateMileageClaim', () => {
  it('uses single rate when miles <= 10,000', () => {
    assertCloseTo(calculateMileageClaim(5_000, 0.45, 0.25), 2_250, 2);
  });

  it('uses split rate when miles > 10,000', () => {
    assertCloseTo(calculateMileageClaim(12_000, 0.45, 0.25), 5_000, 2);
  });

  it('returns 0 for zero miles', () => {
    expect(calculateMileageClaim(0, 0.45, 0.25)).toBe(0);
  });
});

describe('calculateClass2NI', () => {
  it('returns 0 above the small profits threshold because mandatory Class 2 was abolished from 6 April 2024', () => {
    expect(calculateClass2NI(20_000)).toBe(0);
  });

  it('returns 0 below the threshold because voluntary Class 2 is not modelled as tax due', () => {
    expect(calculateClass2NI(5_000)).toBe(0);
  });
});

describe('calculateEnglishIncomeTax', () => {
  it('returns 0 when taxable income is 0', () => {
    expect(calculateEnglishIncomeTax(0, 12_570)).toBe(0);
  });

  it('basic rate taxpayer: 20% on income above personal allowance', () => {
    assertCloseTo(calculateEnglishIncomeTax(37_700, 12_570), 7_540, 0);
  });

  it('higher rate taxpayer: 40% on income over basic rate band', () => {
    assertCloseTo(calculateEnglishIncomeTax(47_700, 12_570), 11_540, 0);
  });

  it('keeps the basic-rate band fixed at gross income 100,000', () => {
    const result = buildProjection(100_000, 0);
    expect(result.personalAllowance).toBe(12_570);
    expect(result.taxableIncome).toBe(87_430);
    assertCloseTo(result.estimatedTax, 27_432, 0);
  });

  it('keeps the basic-rate band fixed while personal allowance tapers at gross income 112,570', () => {
    const result = buildProjection(112_570, 0);
    expect(result.personalAllowance).toBe(6_285);
    expect(result.taxableIncome).toBe(106_285);
    assertCloseTo(result.estimatedTax, 34_974, 0);
  });

  it('keeps the basic-rate band fixed after personal allowance fully tapers at gross income 125,140', () => {
    const result = buildProjection(125_140, 0);
    expect(result.personalAllowance).toBe(0);
    expect(result.taxableIncome).toBe(125_140);
    assertCloseTo(result.estimatedTax, 42_516, 0);
  });

  it('uses the additional-rate band above gross income 125,140', () => {
    const result = buildProjection(150_000, 0);
    expect(result.personalAllowance).toBe(0);
    expect(result.taxableIncome).toBe(150_000);
    assertCloseTo(result.estimatedTax, 53_703, 0);
  });
});

describe('calculateScottishIncomeTax', () => {
  it('applies starter rate correctly', () => {
    assertCloseTo(calculateScottishIncomeTax(2_000), 380, 0);
  });

  it('returns 0 for zero taxable income', () => {
    expect(calculateScottishIncomeTax(0)).toBe(0);
  });

  it('applies multiple bands correctly for 30,000 taxable income', () => {
    assertCloseTo(calculateScottishIncomeTax(30_000), 6_091, 0);
  });
});

describe('buildProjection', () => {
  it('returns zero tax for revenue below personal allowance', () => {
    const result = buildProjection(10_000, 0);
    expect(result.estimatedTax).toBe(0);
  });

  it('returns positive tax for revenue above personal allowance', () => {
    const result = buildProjection(30_000, 0);
    expect(result.estimatedTax).toBeGreaterThan(0);
  });

  it('reduces tax when deductions are applied', () => {
    const noDeduction = buildProjection(30_000, 0);
    const withDeduction = buildProjection(30_000, 5_000);
    expect(withDeduction.estimatedTax).toBeLessThan(noDeduction.estimatedTax);
  });

  it('exposes Class 2 and Class 4 NI separately', () => {
    const result = buildProjection(30_000, 0);
    expect(result.estimatedClass2NI).toBe(0);
    expect(result.estimatedClass4NI).toBeGreaterThan(0);
    expect(result.estimatedNI).toBe(result.estimatedClass2NI + result.estimatedClass4NI);
  });

  it('uses the fixed Class 4 lower profits limit when personal allowance tapers', () => {
    const result = buildProjection(120_000, 0);
    expect(result.personalAllowance).toBe(2_570);
    expect(result.class4Main).toBe(2_262);
    expect(result.class4Upper).toBe(1_394.6);
    expect(result.estimatedClass4NI).toBe(3_656.6);
  });
});

describe('buildTaxAnalysis vehicle energy costs', () => {
  const baseSettings = {
    ...DEFAULT_SETTINGS,
    claimMethod: 'SIMPLIFIED' as const,
  };
  const baseExpense = {
    id: 'charge-1',
    date: '2026-04-10',
    category: ExpenseCategory.PUBLIC_CHARGING,
    amount: 120,
    description: 'Public charging',
  };

  it('blocks charging from simplified deductions because mileage covers running costs', () => {
    const analysis = buildTaxAnalysis({
      trips: [{ id: 'trip-1', date: '2026-04-10', startLocation: 'A', endLocation: 'B', startOdometer: 0, endOdometer: 100, totalMiles: 100, purpose: 'Business', notes: '' }],
      expenses: [baseExpense],
      dailyLogs: [],
      settings: baseSettings,
    });

    expect(analysis.simplifiedDeduction).toBe(45);
  });

  it('includes charging in actual-cost vehicle running costs', () => {
    const analysis = buildTaxAnalysis({
      trips: [{ id: 'trip-1', date: '2026-04-10', startLocation: 'A', endLocation: 'B', startOdometer: 0, endOdometer: 100, totalMiles: 100, purpose: 'Business', notes: '' }],
      expenses: [baseExpense],
      dailyLogs: [],
      settings: { ...baseSettings, claimMethod: 'ACTUAL' },
    });

    expect(analysis.vehicleRunningCosts).toBe(120);
    expect(analysis.actualDeduction).toBe(120);
  });

  it('treats home charging as a vehicle running cost', () => {
    const analysis = buildTaxAnalysis({
      trips: [{ id: 'trip-1', date: '2026-04-10', startLocation: 'A', endLocation: 'B', startOdometer: 0, endOdometer: 100, totalMiles: 100, purpose: 'Business', notes: '' }],
      expenses: [{ ...baseExpense, id: 'charge-2', category: ExpenseCategory.HOME_CHARGING, amount: 80 }],
      dailyLogs: [],
      settings: { ...baseSettings, claimMethod: 'ACTUAL' },
    });

    expect(analysis.vehicleRunningCosts).toBe(80);
    expect(analysis.actualDeduction).toBe(80);
  });

  it('keeps parking separately allowable under simplified mileage', () => {
    const analysis = buildTaxAnalysis({
      trips: [{ id: 'trip-1', date: '2026-04-10', startLocation: 'A', endLocation: 'B', startOdometer: 0, endOdometer: 100, totalMiles: 100, purpose: 'Business', notes: '' }],
      expenses: [{ ...baseExpense, id: 'parking-1', category: ExpenseCategory.PARKING, amount: 12 }],
      dailyLogs: [],
      settings: baseSettings,
    });

    expect(analysis.otherBusinessExpenses).toBe(12);
    expect(analysis.vehicleRunningCosts).toBe(0);
    expect(analysis.simplifiedDeduction).toBe(57);
  });
});
