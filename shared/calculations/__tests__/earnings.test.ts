import { describe, it, expect } from 'vitest';
import { calcHourlyRate, calcEarningsPerMile, calcPlatformShares } from '../earnings';
import type { ShiftEarning } from '../../types/shift';

describe('calcHourlyRate', () => {
  it('divides earnings by hours', () => {
    expect(calcHourlyRate(120, 8)).toBeCloseTo(15);
  });
  it('returns 0 for 0 hours', () => {
    expect(calcHourlyRate(120, 0)).toBe(0);
  });
  it('returns 0 for negative hours', () => {
    expect(calcHourlyRate(120, -1)).toBe(0);
  });
});

describe('calcEarningsPerMile', () => {
  it('divides earnings by miles', () => {
    expect(calcEarningsPerMile(100, 50)).toBeCloseTo(2);
  });
  it('returns 0 for 0 miles', () => {
    expect(calcEarningsPerMile(100, 0)).toBe(0);
  });
});

describe('calcPlatformShares', () => {
  const earnings: ShiftEarning[] = [
    { id: '1', shiftId: 's1', platform: 'uber', amount: 60 },
    { id: '2', shiftId: 's1', platform: 'deliveroo', amount: 40 },
  ];
  it('computes correct percentages', () => {
    const result = calcPlatformShares(earnings);
    expect(result[0]!.percent).toBeCloseTo(60);
    expect(result[1]!.percent).toBeCloseTo(40);
  });
  it('amounts pass through unchanged', () => {
    const result = calcPlatformShares(earnings);
    expect(result[0]!.amount).toBe(60);
  });
  it('returns 0 percent for all when total is 0', () => {
    const zero: ShiftEarning[] = [{ id: '1', shiftId: 's1', platform: 'uber', amount: 0 }];
    expect(calcPlatformShares(zero)[0]!.percent).toBe(0);
  });
});
