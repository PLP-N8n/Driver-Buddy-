import { describe, expect, it } from 'vitest';
import {
  buildProjection,
  calculateClass2NI,
  calculateEnglishIncomeTax,
  calculateMileageClaim,
  calculateScottishIncomeTax,
  getPersonalAllowance,
  paymentsOnAccountAmount,
  requiresPaymentsOnAccount,
} from './tax';

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
});

describe('calculateScottishIncomeTax', () => {
  it('applies starter rate correctly', () => {
    assertCloseTo(calculateScottishIncomeTax(2_000), 380, 0);
  });

  it('returns 0 for zero taxable income', () => {
    expect(calculateScottishIncomeTax(0)).toBe(0);
  });

  it('applies multiple bands correctly for 30,000 taxable income', () => {
    assertCloseTo(calculateScottishIncomeTax(30_000), 6_137, 0);
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
});
