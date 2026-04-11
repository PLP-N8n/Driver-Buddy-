import { DailyWorkLog, Expense, ExpenseCategory, Settings, Trip } from '../types.js';

const BASE_PERSONAL_ALLOWANCE = 12_570;
const TAPER_THRESHOLD = 100_000;
const BASIC_RATE_LIMIT = 50_270;
const HIGHER_RATE_LIMIT = 125_140;
const CLASS_4_MAIN_RATE = 0.06;
const CLASS_4_UPPER_RATE = 0.02;
const OTHER_ALLOWABLE_EXPENSE_CATEGORIES = new Set<ExpenseCategory>([
  ExpenseCategory.PARKING,
  ExpenseCategory.PHONE,
  ExpenseCategory.ACCOUNTANCY,
  ExpenseCategory.SUBSCRIPTIONS,
  ExpenseCategory.PROTECTIVE_CLOTHING,
  ExpenseCategory.TRAINING,
  ExpenseCategory.BANK_CHARGES,
  ExpenseCategory.OTHER,
]);
const VEHICLE_RUNNING_EXPENSE_CATEGORIES = new Set<ExpenseCategory>([
  ExpenseCategory.FUEL,
  ExpenseCategory.REPAIRS,
  ExpenseCategory.INSURANCE,
  ExpenseCategory.TAX,
  ExpenseCategory.MOT,
  ExpenseCategory.CLEANING,
]);

type ProjectionOptions = {
  isScottishTaxpayer?: boolean;
  collectedAtSource?: number;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const sumMilesForTrips = (trips: Trip[], predicate: (trip: Trip) => boolean) =>
  trips.filter(predicate).reduce((sum, trip) => sum + trip.totalMiles, 0);

export function calculateMileageClaim(
  totalBusinessMiles: number,
  rateFirst10k: number,
  rateAfter10k: number
): number {
  if (totalBusinessMiles <= 10_000) return totalBusinessMiles * rateFirst10k;
  return 10_000 * rateFirst10k + (totalBusinessMiles - 10_000) * rateAfter10k;
}

export function getPersonalAllowance(adjustedNetIncome: number): number {
  if (adjustedNetIncome <= TAPER_THRESHOLD) return BASE_PERSONAL_ALLOWANCE;
  const reduction = Math.floor((adjustedNetIncome - TAPER_THRESHOLD) / 2);
  return Math.max(0, BASE_PERSONAL_ALLOWANCE - reduction);
}

export function requiresPaymentsOnAccount(lastYearLiability: number, collectedAtSource: number): boolean {
  if (lastYearLiability < 1_000) return false;
  if (lastYearLiability > 0 && collectedAtSource / lastYearLiability > 0.8) return false;
  return true;
}

export function paymentsOnAccountAmount(lastYearLiability: number): number {
  return lastYearLiability / 2;
}

export function calculateEnglishIncomeTax(taxableIncome: number, personalAllowance: number): number {
  if (taxableIncome <= 0) return 0;

  let tax = 0;
  const basicBandWidth = BASIC_RATE_LIMIT - personalAllowance;
  const inBasic = Math.min(taxableIncome, basicBandWidth);
  tax += inBasic * 0.2;

  if (taxableIncome > basicBandWidth) {
    const remaining = taxableIncome - basicBandWidth;
    const higherBandWidth = HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT;
    const inHigher = Math.min(remaining, higherBandWidth);
    tax += inHigher * 0.4;

    if (remaining > higherBandWidth) {
      tax += (remaining - higherBandWidth) * 0.45;
    }
  }

  return roundCurrency(tax);
}

export function calculateScottishIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;

  const bands = [
    { limit: 2_306, rate: 0.19 },
    { limit: 11_685, rate: 0.20 },
    { limit: 17_101, rate: 0.21 },
    { limit: 31_338, rate: 0.42 },
    { limit: 50_140, rate: 0.45 },
    { limit: Infinity, rate: 0.48 },
  ];

  let tax = 0;
  let remaining = taxableIncome;

  for (const band of bands) {
    if (remaining <= 0) break;
    const inBand = Math.min(remaining, band.limit);
    tax += inBand * band.rate;
    remaining -= inBand;
  }

  return roundCurrency(tax);
}

// Mandatory Class 2 NIC liability was abolished from 6 April 2024 onwards.
// Above the small profits threshold it is treated as paid, and below that it is
// voluntary, which this app does not currently model as a user choice.
export function calculateClass2NI(_annualProfit: number): number {
  return 0;
}

export const buildProjection = (totalRevenue: number, deductionUsed: number, options: ProjectionOptions = {}) => {
  const taxableProfit = Math.max(0, totalRevenue - deductionUsed);
  const adjustedNetIncome = taxableProfit;
  const personalAllowance = getPersonalAllowance(adjustedNetIncome);
  const personalAllowanceUsed = Math.min(taxableProfit, personalAllowance);
  const personalAllowanceRemaining = Math.max(0, personalAllowance - personalAllowanceUsed);
  const taxableIncome = Math.max(0, taxableProfit - personalAllowance);

  const estimatedTax = options.isScottishTaxpayer
    ? calculateScottishIncomeTax(taxableIncome)
    : calculateEnglishIncomeTax(taxableIncome, personalAllowance);

  const estimatedClass2NI = calculateClass2NI(taxableProfit);
  let estimatedClass4NI = 0;
  let class4Main = 0;
  let class4Upper = 0;

  if (taxableProfit > personalAllowance) {
    const niBandWidth = BASIC_RATE_LIMIT - personalAllowance;
    const profitForNi = taxableProfit - personalAllowance;
    class4Main = Math.min(profitForNi, niBandWidth) * CLASS_4_MAIN_RATE;
    estimatedClass4NI += class4Main;

    if (profitForNi > niBandWidth) {
      class4Upper = (profitForNi - niBandWidth) * CLASS_4_UPPER_RATE;
      estimatedClass4NI += class4Upper;
    }
  }

  const estimatedNI = roundCurrency(estimatedClass2NI + estimatedClass4NI);
  const estimatedLiability = roundCurrency(estimatedTax + estimatedNI);
  const paymentsOnAccount = requiresPaymentsOnAccount(estimatedLiability, options.collectedAtSource ?? 0);
  const paymentOnAccountDue = paymentsOnAccount ? roundCurrency(paymentsOnAccountAmount(estimatedLiability)) : 0;
  const januaryPaymentTotal = paymentsOnAccount
    ? roundCurrency(estimatedLiability + paymentOnAccountDue)
    : estimatedLiability;

  return {
    taxableProfit,
    taxableIncome,
    personalAllowance,
    personalAllowanceUsed,
    personalAllowanceRemaining,
    estimatedTax,
    estimatedClass2NI: roundCurrency(estimatedClass2NI),
    estimatedClass4NI: roundCurrency(estimatedClass4NI),
    estimatedNI,
    estimatedLiability,
    paymentsOnAccount,
    paymentOnAccountAmount: paymentOnAccountDue,
    januaryPaymentTotal,
    class4Main: roundCurrency(class4Main),
    class4Upper: roundCurrency(class4Upper),
  };
};

export const buildTaxAnalysis = ({
  trips,
  expenses,
  dailyLogs,
  settings,
}: {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
}) => {
  // Revenue comes from work logs, but mileage is always derived from Trip
  // records. See DailyWorkLog.milesDriven for the duplicate snapshot field.
  const totalRevenue = dailyLogs.reduce((sum, log) => sum + log.revenue, 0);
  const totalBusinessMiles = sumMilesForTrips(trips, (trip) => trip.purpose === 'Business');
  const totalPersonalMiles = sumMilesForTrips(trips, (trip) => trip.purpose !== 'Business');
  const totalMiles = totalBusinessMiles + totalPersonalMiles;
  const businessUsePercent = totalMiles > 0 ? totalBusinessMiles / totalMiles : 0;

  const totalMileageAllowance = calculateMileageClaim(
    totalBusinessMiles,
    settings.businessRateFirst10k,
    settings.businessRateAfter10k
  );

  const deductibleAmount = (expense: Expense) => (expense.isVatClaimable ? expense.amount / 1.2 : expense.amount);

  const otherBusinessExpenses = expenses
    .filter((expense) => OTHER_ALLOWABLE_EXPENSE_CATEGORIES.has(expense.category))
    .reduce((sum, expense) => sum + deductibleAmount(expense), 0);

  const vehicleRunningCosts = expenses
    .filter((expense) => VEHICLE_RUNNING_EXPENSE_CATEGORIES.has(expense.category))
    .reduce((sum, expense) => sum + deductibleAmount(expense), 0);

  const totalManualAllowances = settings.manualAllowances.reduce((sum, allowance) => sum + allowance.amount, 0);
  const simplifiedDeduction = totalMileageAllowance + otherBusinessExpenses + totalManualAllowances;
  const actualDeduction = vehicleRunningCosts * businessUsePercent + otherBusinessExpenses + totalManualAllowances;
  const projectionOptions = {
    isScottishTaxpayer: settings.isScottishTaxpayer,
  };
  const simplifiedProjection = buildProjection(totalRevenue, simplifiedDeduction, projectionOptions);
  const actualProjection = buildProjection(totalRevenue, actualDeduction, projectionOptions);

  return {
    totalRevenue,
    totalBusinessMiles,
    businessUsePercent,
    totalMileageAllowance,
    otherBusinessExpenses,
    vehicleRunningCosts,
    totalManualAllowances,
    simplifiedDeduction,
    actualDeduction,
    simplifiedProjection,
    actualProjection,
  };
};
