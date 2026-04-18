import type { ShiftEarning } from '../types/shift';

/**
 * Hourly rate for a shift. Returns 0 if hours is 0 or missing.
 */
export function calcHourlyRate(totalEarnings: number, hoursWorked: number): number {
  if (!hoursWorked || hoursWorked <= 0) return 0;
  return totalEarnings / hoursWorked;
}

/**
 * Earnings per business mile. Returns 0 if miles is 0 or missing.
 */
export function calcEarningsPerMile(totalEarnings: number, businessMiles: number): number {
  if (!businessMiles || businessMiles <= 0) return 0;
  return totalEarnings / businessMiles;
}

/**
 * Platform breakdown with percentage share.
 */
export function calcPlatformShares(
  earnings: ShiftEarning[]
): Array<{ platform: string; amount: number; percent: number }> {
  const total = earnings.reduce((sum, e) => sum + e.amount, 0);
  if (total === 0) return earnings.map((e) => ({ platform: e.platform, amount: 0, percent: 0 }));
  return earnings.map((e) => ({
    platform: e.platform,
    amount: e.amount,
    percent: (e.amount / total) * 100,
  }));
}
