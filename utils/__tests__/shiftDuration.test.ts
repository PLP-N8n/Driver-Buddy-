import { describe, expect, it } from 'vitest';
import { calculateClockShiftDurationHours } from '../shiftDuration';

describe('shift duration helpers', () => {
  it('treats an end time before the start time as an overnight shift', () => {
    expect(calculateClockShiftDurationHours('23:00', '02:00')).toBe(3);
  });

  it('overnight 23:00 to 07:00 produces 8 hours', () => {
    expect(calculateClockShiftDurationHours('23:00', '07:00')).toBe(8);
  });

  it('overnight 22:30 to 06:15 produces 7.75 hours', () => {
    expect(calculateClockShiftDurationHours('22:30', '06:15')).toBe(7.75);
  });

  it('same-day 09:00 to 17:30 produces 8.5 hours', () => {
    expect(calculateClockShiftDurationHours('09:00', '17:30')).toBe(8.5);
  });
});
