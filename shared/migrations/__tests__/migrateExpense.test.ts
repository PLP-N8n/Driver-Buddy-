import { describe, it, expect } from 'vitest';
import { migrateLegacyExpense, migrateLegacyExpenses } from '../migrateExpense';

const legacyFuel = {
  id: 'exp-1',
  date: '2026-04-01',
  category: 'Fuel',
  amount: 80,
  description: 'Fill up',
};

const legacyPhone = {
  id: 'exp-2',
  date: '2026-04-01',
  category: 'Phone',
  amount: 30,
  description: 'Data plan',
};

describe('migrateLegacyExpense - SIMPLIFIED method', () => {
  it('sets scope to business', () => {
    expect(migrateLegacyExpense(legacyFuel, 'SIMPLIFIED').scope).toBe('business');
  });
  it('blocks fuel deduction under simplified', () => {
    const result = migrateLegacyExpense(legacyFuel, 'SIMPLIFIED');
    expect(result.taxTreatment).toBe('blocked_under_simplified');
    expect(result.deductibleAmount).toBe(0);
    expect(result.nonDeductibleAmount).toBe(80);
  });
  it('allows phone deduction under simplified', () => {
    const result = migrateLegacyExpense(legacyPhone, 'SIMPLIFIED');
    expect(result.taxTreatment).toBe('deductible');
    expect(result.deductibleAmount).toBe(30);
  });
  it('sets sourceType to manual', () => {
    expect(migrateLegacyExpense(legacyFuel, 'SIMPLIFIED').sourceType).toBe('manual');
  });
  it('sets reviewStatus to confirmed', () => {
    expect(migrateLegacyExpense(legacyFuel, 'SIMPLIFIED').reviewStatus).toBe('confirmed');
  });
  it('is idempotent', () => {
    const first = migrateLegacyExpense(legacyFuel, 'SIMPLIFIED');
    const second = migrateLegacyExpense(first as any, 'SIMPLIFIED');
    expect(second).toBe(first);
  });
});

describe('migrateLegacyExpense - ACTUAL method', () => {
  it('allows fuel deduction under actual', () => {
    const result = migrateLegacyExpense(legacyFuel, 'ACTUAL');
    expect(result.taxTreatment).toBe('deductible');
    expect(result.deductibleAmount).toBe(80);
  });
});

describe('migrateLegacyExpenses', () => {
  it('migrates all expenses in array', () => {
    const result = migrateLegacyExpenses([legacyFuel, legacyPhone], 'SIMPLIFIED');
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('exp-1');
    expect(result[1]!.id).toBe('exp-2');
  });
});
