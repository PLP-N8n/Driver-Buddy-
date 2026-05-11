import type { Expense, Settings } from '../../types';
import { calcTaxBuffer, calcKept, calcSimplifiedDeduction } from './tax';
import { getTaxDeductibleAmount, isVehicleRunningCostCategory } from './expenses';

export interface TrueTakeHomeInput {
  grossEarnings: number;
  businessMiles: number;
  expenses: Expense[];
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  taxSetAsidePercent: number;
  vehicleCostPerMile?: number;
}

export interface TrueTakeHomeResult {
  grossEarnings: number;
  taxSetAside: number;
  vehicleCostDeduction: number;
  otherBusinessExpenses: number;
  totalDeductions: number;
  trueTakeHome: number;
}

export function calcTrueTakeHome(input: TrueTakeHomeInput): TrueTakeHomeResult {
  const { grossEarnings, businessMiles, expenses, claimMethod, taxSetAsidePercent, vehicleCostPerMile } = input;

  const taxSetAside = calcTaxBuffer(grossEarnings, taxSetAsidePercent);

  let vehicleRunningExpenses = 0;
  let otherBusinessExpenses = 0;
  for (const expense of expenses) {
    const deductible = getTaxDeductibleAmount(expense);
    if (deductible <= 0) continue;
    if (isVehicleRunningCostCategory(expense.category)) {
      vehicleRunningExpenses += deductible;
    } else {
      otherBusinessExpenses += deductible;
    }
  }

  let vehicleCostDeduction: number;
  if (claimMethod === 'SIMPLIFIED') {
    if (vehicleCostPerMile !== undefined && vehicleCostPerMile > 0) {
      vehicleCostDeduction = businessMiles * vehicleCostPerMile;
    } else {
      vehicleCostDeduction = calcSimplifiedDeduction(businessMiles);
    }
  } else {
    if (vehicleRunningExpenses > 0) {
      vehicleCostDeduction = vehicleRunningExpenses;
    } else if (vehicleCostPerMile !== undefined && vehicleCostPerMile > 0) {
      vehicleCostDeduction = businessMiles * vehicleCostPerMile;
    } else {
      vehicleCostDeduction = expenses
        .filter(e => isVehicleRunningCostCategory(e.category))
        .reduce((sum, e) => sum + getTaxDeductibleAmount(e), 0);
    }
  }

  const totalDeductions = vehicleCostDeduction + otherBusinessExpenses;
  const trueTakeHome = calcKept(grossEarnings, totalDeductions, taxSetAside);

  return {
    grossEarnings,
    taxSetAside,
    vehicleCostDeduction,
    otherBusinessExpenses,
    totalDeductions,
    trueTakeHome,
  };
}
