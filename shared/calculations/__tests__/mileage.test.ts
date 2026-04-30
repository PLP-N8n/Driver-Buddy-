import { describe, it, expect } from 'vitest';
import {
  calcBusinessMilesFromOdo,
  calcPersonalGapMiles,
  calcMileageAllowance,
  calcMileageAllowanceForMiles,
  validateOdoSequence,
} from '../mileage';

describe('calcBusinessMilesFromOdo', () => {
  it('returns difference between end and start', () => {
    expect(calcBusinessMilesFromOdo(1000, 1050)).toBe(50);
  });
  it('returns 0 when end equals start', () => {
    expect(calcBusinessMilesFromOdo(1000, 1000)).toBe(0);
  });
  it('returns 0 when end is less than start (bad data)', () => {
    expect(calcBusinessMilesFromOdo(1050, 1000)).toBe(0);
  });
});

describe('calcPersonalGapMiles', () => {
  it('returns gap between shifts', () => {
    expect(calcPersonalGapMiles(1050, 1060)).toBe(10);
  });
  it('returns 0 when next start equals prev end', () => {
    expect(calcPersonalGapMiles(1050, 1050)).toBe(0);
  });
  it('returns 0 for negative gap (bad data)', () => {
    expect(calcPersonalGapMiles(1060, 1050)).toBe(0);
  });
});

describe('calcMileageAllowance', () => {
  it('uses 45p rate for first 10000 miles', () => {
    expect(calcMileageAllowance(100)).toBeCloseTo(45);
  });
  it('uses split rate for miles over 10000', () => {
    // 10000 * 0.45 + 1000 * 0.25 = 4500 + 250 = 4750
    expect(calcMileageAllowance(11000)).toBeCloseTo(4750);
  });
  it('exact boundary: 10000 miles = Â£4500', () => {
    expect(calcMileageAllowance(10000)).toBeCloseTo(4500);
  });
  it('respects custom rates', () => {
    expect(calcMileageAllowance(100, 0.50, 0.25)).toBeCloseTo(50);
  });
});

describe('calcMileageAllowanceForMiles', () => {
  it('uses the remaining first-rate band after prior tax-year miles', () => {
    expect(calcMileageAllowanceForMiles(100, 9_950)).toBeCloseTo(35);
  });

  it('uses the second rate once prior tax-year miles exceed 10000', () => {
    expect(calcMileageAllowanceForMiles(100, 10_000)).toBeCloseTo(25);
  });
});

describe('validateOdoSequence', () => {
  it('valid when end > start', () => {
    expect(validateOdoSequence(1000, 1050)).toEqual({ valid: true });
  });
  it('valid when end equals start', () => {
    expect(validateOdoSequence(1000, 1000)).toEqual({ valid: true });
  });
  it('invalid when end < start', () => {
    const result = validateOdoSequence(1050, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
