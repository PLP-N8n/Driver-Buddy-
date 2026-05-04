import type {
  Expense,
  ExpenseScope,
  VehicleExpenseType,
  TaxTreatment,
} from '../types/expense';

export type ExpenseCategoryTaxGroup =
  | 'vehicle_running'
  | 'separately_allowable'
  | 'other_allowable';

export type ExpenseCategoryTaxMetadata = {
  category: string;
  vehicleExpenseType: VehicleExpenseType;
  taxGroup: ExpenseCategoryTaxGroup;
};

export const EXPENSE_CATEGORY_TAX_METADATA = [
  { category: 'Fuel', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'Public Charging', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'Home Charging', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'Repairs & Maintenance', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'Insurance', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'Vehicle Tax', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'MOT', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'Cleaning', vehicleExpenseType: 'running_cost', taxGroup: 'vehicle_running' },
  { category: 'Parking/Tolls', vehicleExpenseType: 'separately_allowable', taxGroup: 'separately_allowable' },
  { category: 'Phone', vehicleExpenseType: 'non_vehicle', taxGroup: 'other_allowable' },
  { category: 'Accountancy', vehicleExpenseType: 'non_vehicle', taxGroup: 'other_allowable' },
  { category: 'Subscriptions', vehicleExpenseType: 'non_vehicle', taxGroup: 'other_allowable' },
  { category: 'Protective Clothing', vehicleExpenseType: 'non_vehicle', taxGroup: 'other_allowable' },
  { category: 'Training', vehicleExpenseType: 'non_vehicle', taxGroup: 'other_allowable' },
  { category: 'Bank Charges', vehicleExpenseType: 'non_vehicle', taxGroup: 'other_allowable' },
  { category: 'Other', vehicleExpenseType: 'non_vehicle', taxGroup: 'other_allowable' },
] as const satisfies readonly ExpenseCategoryTaxMetadata[];

const CATEGORY_TAX_METADATA = new Map<string, ExpenseCategoryTaxMetadata>(
  EXPENSE_CATEGORY_TAX_METADATA.map((metadata) => [metadata.category, metadata])
);

export const VEHICLE_RUNNING_COST_CATEGORIES = EXPENSE_CATEGORY_TAX_METADATA
  .filter((metadata) => metadata.taxGroup === 'vehicle_running')
  .map((metadata) => metadata.category);

export const SEPARATELY_ALLOWABLE_EXPENSE_CATEGORIES = EXPENSE_CATEGORY_TAX_METADATA
  .filter((metadata) => metadata.taxGroup === 'separately_allowable')
  .map((metadata) => metadata.category);

export function getExpenseCategoryTaxMetadata(category: string): ExpenseCategoryTaxMetadata | undefined {
  return CATEGORY_TAX_METADATA.get(category);
}

export function isVehicleRunningCostCategory(category: string): boolean {
  return getExpenseCategoryTaxMetadata(category)?.taxGroup === 'vehicle_running';
}

export function isSeparatelyAllowableExpenseCategory(category: string): boolean {
  return getExpenseCategoryTaxMetadata(category)?.taxGroup === 'separately_allowable';
}

export function isTaxAllowableExpenseCategory(category: string): boolean {
  return getExpenseCategoryTaxMetadata(category) !== undefined;
}

/**
 * Derive HMRC vehicle expense type from category string.
 */
export function getVehicleExpenseType(category: string): VehicleExpenseType {
  return getExpenseCategoryTaxMetadata(category)?.vehicleExpenseType ?? 'non_vehicle';
}

/**
 * Derive HMRC tax treatment given vehicle type, scope, and claim method.
 */
export function getTaxTreatment(
  vehicleExpenseType: VehicleExpenseType,
  scope: ExpenseScope,
  claimMethod: 'SIMPLIFIED' | 'ACTUAL'
): TaxTreatment {
  if (scope === 'personal') return 'non_deductible';
  if (vehicleExpenseType === 'running_cost' && claimMethod === 'SIMPLIFIED') {
    return 'blocked_under_simplified';
  }
  if (scope === 'mixed') return 'partially_deductible';
  return 'deductible';
}

/**
 * Classify a new expense - returns vehicleExpenseType and taxTreatment.
 */
export function classifyExpense(
  category: string,
  scope: ExpenseScope,
  claimMethod: 'SIMPLIFIED' | 'ACTUAL'
): { vehicleExpenseType: VehicleExpenseType; taxTreatment: TaxTreatment } {
  const vehicleExpenseType = getVehicleExpenseType(category);
  const taxTreatment = getTaxTreatment(vehicleExpenseType, scope, claimMethod);
  return { vehicleExpenseType, taxTreatment };
}

export function calcExpenseTaxBasisAmount(amount: number, isVatClaimable = false): number {
  return isVatClaimable ? Math.round((amount / 1.2) * 100) / 100 : amount;
}

const clampBusinessUsePercent = (value: number) => Math.max(0, Math.min(100, value));

const getDefaultBusinessUsePercent = (scope: ExpenseScope, businessUsePercent?: number) => {
  if (scope === 'personal') return 0;
  if (businessUsePercent !== undefined && Number.isFinite(businessUsePercent)) {
    return clampBusinessUsePercent(businessUsePercent);
  }
  return scope === 'mixed' ? 50 : 100;
};

export function calculateExpenseTaxClassification({
  amount,
  businessUsePercent,
  category,
  claimMethod,
  isVatClaimable = false,
  scope = 'business',
}: {
  amount: number;
  businessUsePercent?: number;
  category: string;
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  isVatClaimable?: boolean;
  scope?: ExpenseScope;
}): Pick<
  Expense,
  | 'businessUsePercent'
  | 'deductibleAmount'
  | 'nonDeductibleAmount'
  | 'scope'
  | 'taxTreatment'
  | 'vehicleExpenseType'
> {
  const normalizedBusinessUsePercent = getDefaultBusinessUsePercent(scope, businessUsePercent);
  const { vehicleExpenseType, taxTreatment } = classifyExpense(category, scope, claimMethod);
  const taxBasisAmount = calcExpenseTaxBasisAmount(amount, isVatClaimable);
  const { deductibleAmount, nonDeductibleAmount } = calcDeductibleAmount(
    taxBasisAmount,
    taxTreatment,
    normalizedBusinessUsePercent
  );

  return {
    scope,
    businessUsePercent: normalizedBusinessUsePercent,
    deductibleAmount,
    nonDeductibleAmount,
    vehicleExpenseType,
    taxTreatment,
  };
}

export function getTaxDeductibleAmount(expense: {
  amount: number;
  businessUsePercent?: number;
  deductibleAmount?: number;
  isVatClaimable?: boolean;
  taxTreatment?: TaxTreatment;
}): number {
  if (expense.taxTreatment === 'non_deductible' || expense.taxTreatment === 'blocked_under_simplified') {
    return 0;
  }

  const storedDeductibleAmount = expense.deductibleAmount;
  if (storedDeductibleAmount === undefined) {
    return calcExpenseTaxBasisAmount(expense.amount, expense.isVatClaimable);
  }

  if (!expense.isVatClaimable) {
    return storedDeductibleAmount;
  }

  const taxBasisAmount = calcExpenseTaxBasisAmount(expense.amount, true);
  const businessUsePercent =
    expense.businessUsePercent !== undefined && Number.isFinite(expense.businessUsePercent)
      ? getDefaultBusinessUsePercent('mixed', expense.businessUsePercent)
      : 100;
  const maxNetDeductible =
    expense.taxTreatment === 'partially_deductible' || businessUsePercent < 100
      ? (taxBasisAmount * businessUsePercent) / 100
      : taxBasisAmount;

  return Math.min(storedDeductibleAmount, maxNetDeductible);
}

/**
 * Compute deductible and non-deductible split for an expense.
 */
export function calcDeductibleAmount(
  amount: number,
  taxTreatment: TaxTreatment,
  businessUsePercent: number
): { deductibleAmount: number; nonDeductibleAmount: number } {
  if (taxTreatment === 'non_deductible' || taxTreatment === 'blocked_under_simplified') {
    return { deductibleAmount: 0, nonDeductibleAmount: amount };
  }
  if (taxTreatment === 'partially_deductible') {
    const deductible = (amount * businessUsePercent) / 100;
    return { deductibleAmount: deductible, nonDeductibleAmount: amount - deductible };
  }
  return { deductibleAmount: amount, nonDeductibleAmount: 0 };
}

/**
 * Sum total deductible amount across a list of expenses.
 */
export function sumDeductibleExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + getTaxDeductibleAmount(e), 0);
}
