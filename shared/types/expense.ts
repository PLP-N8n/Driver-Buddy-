export type ExpenseScope = 'business' | 'personal' | 'mixed';
export type VehicleExpenseType =
  | 'running_cost'
  | 'separately_allowable'
  | 'non_vehicle'
  | 'personal_only';
export type TaxTreatment =
  | 'deductible'
  | 'partially_deductible'
  | 'blocked_under_simplified'
  | 'non_deductible';
export type ExpenseSourceType = 'manual' | 'bank_import';
export type ExpenseReviewStatus = 'pending' | 'confirmed' | 'edited' | 'ignored';

export interface Expense {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string;
  receiptId?: string;
  receiptUrl?: string;
  hasReceiptImage?: boolean;
  isVatClaimable?: boolean;
  liters?: number;
  // HMRC classification
  scope: ExpenseScope;
  businessUsePercent: number;
  deductibleAmount: number;
  nonDeductibleAmount: number;
  vehicleExpenseType: VehicleExpenseType;
  taxTreatment: TaxTreatment;
  linkedShiftId?: string | null;
  sourceType: ExpenseSourceType;
  reviewStatus: ExpenseReviewStatus;
}
