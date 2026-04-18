/**
 * Business miles driven during a shift (end odo minus start odo).
 * Returns 0 if either value is missing.
 */
export function calcBusinessMilesFromOdo(startOdo: number, endOdo: number): number {
  return Math.max(0, endOdo - startOdo);
}

/**
 * Personal gap miles between two shifts (next start minus previous end).
 * Returns 0 if result would be negative.
 */
export function calcPersonalGapMiles(prevEndOdo: number, nextStartOdo: number): number {
  return Math.max(0, nextStartOdo - prevEndOdo);
}

/**
 * HMRC simplified mileage allowance.
 * 45p per mile for first 10,000 business miles in tax year, 25p thereafter.
 * Rates can be overridden via settings for future-proofing.
 */
export function calcMileageAllowance(
  businessMiles: number,
  rateFirst10k = 0.45,
  rateAfter10k = 0.25
): number {
  if (businessMiles <= 10000) {
    return businessMiles * rateFirst10k;
  }
  return 10000 * rateFirst10k + (businessMiles - 10000) * rateAfter10k;
}

/**
 * Validate that odometer readings are in correct sequence.
 */
export function validateOdoSequence(
  startOdo: number,
  endOdo: number
): { valid: boolean; error?: string } {
  if (endOdo < startOdo) {
    return { valid: false, error: 'End odometer must be greater than or equal to start odometer' };
  }
  return { valid: true };
}
