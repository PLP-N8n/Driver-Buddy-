import { describe, expect, it } from 'vitest';
import {
  getSimplifiedMileageDeductibleExplanation,
  isCoveredBySimplifiedMileage,
  type DeductibleSummaryExpense,
} from './simplifiedMileageDeductibleCopy';

const simplifiedSettings = {
  claimMethod: 'SIMPLIFIED' as const,
  mileageTrackingEnabled: false,
};

const actualSettings = {
  claimMethod: 'ACTUAL' as const,
  mileageTrackingEnabled: false,
};

const fuelExpense: DeductibleSummaryExpense = {
  category: 'Fuel',
  deductibleAmount: 0,
  scope: 'business',
  taxTreatment: 'blocked_under_simplified',
};

describe('simplified mileage deductible copy', () => {
  it('explains zero deductible fuel under simplified mileage', () => {
    expect(getSimplifiedMileageDeductibleExplanation([fuelExpense], simplifiedSettings)).toBe(
      'Fuel is covered by your mileage rate - no separate deduction needed'
    );
  });

  it('explains zero deductible vehicle running costs under simplified mileage', () => {
    const expenses: DeductibleSummaryExpense[] = [
      fuelExpense,
      {
        category: 'Insurance',
        deductibleAmount: 0,
        scope: 'business',
        taxTreatment: 'blocked_under_simplified',
      },
    ];

    expect(getSimplifiedMileageDeductibleExplanation(expenses, simplifiedSettings)).toBe(
      'These vehicle costs are covered by your mileage rate - no separate deduction needed'
    );
  });

  it('can use mileage tracking as the simplified mileage signal for legacy expenses', () => {
    expect(
      getSimplifiedMileageDeductibleExplanation(
        [{ category: 'Fuel', deductibleAmount: 0, scope: 'business' }],
        { claimMethod: 'ACTUAL', mileageTrackingEnabled: true }
      )
    ).toBe('Fuel is covered by your mileage rate - no separate deduction needed');
  });

  it('leaves non-zero deductible displays unchanged', () => {
    expect(
      getSimplifiedMileageDeductibleExplanation(
        [{ category: 'Parking/Tolls', deductibleAmount: 12, scope: 'business', taxTreatment: 'deductible' }],
        simplifiedSettings
      )
    ).toBeNull();
  });

  it('does not relabel personal expenses as covered by mileage', () => {
    expect(
      isCoveredBySimplifiedMileage(
        { category: 'Fuel', deductibleAmount: 0, scope: 'personal', taxTreatment: 'non_deductible' },
        simplifiedSettings
      )
    ).toBe(false);
  });

  it('does not explain zero deductible fuel under actual costs', () => {
    expect(getSimplifiedMileageDeductibleExplanation([fuelExpense], actualSettings)).toBeNull();
  });
});
