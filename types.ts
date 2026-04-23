
import { getTaxYear, todayUK, ukTaxYearStart } from './utils/ukDate.js';

export type AppTab = 'dashboard' | 'mileage' | 'expenses' | 'worklog' | 'tax' | 'debt' | 'settings';
export type TripPurpose = 'Business' | 'Personal' | 'Commute';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Trip {
  id: string;
  date: string;
  startLocation: string;
  endLocation: string;
  startOdometer: number;
  endOdometer: number;
  /**
   * Canonical mileage for business-use calculations. Prefer Trip records over
   * DailyWorkLog.milesDriven when computing allowances, tax, or analytics.
   */
  totalMiles: number;
  purpose: TripPurpose;
  notes: string;
  path?: Coordinate[];
  updatedAt?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  receiptId?: string; // new: opaque server-side receipt key
  receiptUrl?: string; // receiptUrl is kept as legacy migration field; do not remove yet
  hasReceiptImage?: boolean;
  isVatClaimable?: boolean;
  energyQuantity?: number;
  energyUnit?: EnergyQuantityUnit;
  liters?: number;
  updatedAt?: string;
}

export type EnergyQuantityUnit = 'litre' | 'kWh';

export interface ProviderSplit {
  provider: string;
  /**
   * Canonical per-provider revenue when a shift was split across platforms.
   * DailyWorkLog.revenue remains the aggregate shift total.
   */
  revenue: number;
  jobCount?: number;
}

export interface DailyWorkLog {
  id: string;
  date: string;
  /**
   * Primary provider label for the shift. When providerSplits exists, this is a
   * summary label only and providerSplits is authoritative for provider detail.
   */
  provider: string;
  hoursWorked: number;
  /**
   * Aggregate shift revenue. When providerSplits exists, this should equal the
   * sum of those split rows and is the authoritative total for the whole shift.
   */
  revenue: number;
  fuelLiters?: number;
  expensesTotal?: number;
  notes?: string;
  jobCount?: number; // Drops, Rides, or Movements based on role
  /**
   * Shift-time mileage snapshot kept for convenience in the work log UI. See
   * Trip records for canonical mileage used in allowances and tax calculations.
   */
  milesDriven?: number;
  /**
   * Relationship pointer to the auto-created Business Trip. The linked Trip is
   * authoritative for mileage; this field only associates the two records.
   */
  linkedTripId?: string;
  /**
   * Authoritative provider-level revenue breakdown for multi-platform shifts.
   * Use this instead of provider/revenue when provider detail matters.
   */
  providerSplits?: ProviderSplit[];
  startedAt?: string;
  endedAt?: string;
  updatedAt?: string;
}

export enum ExpenseCategory {
  FUEL = 'Fuel',
  PUBLIC_CHARGING = 'Public Charging',
  HOME_CHARGING = 'Home Charging',
  REPAIRS = 'Repairs & Maintenance',
  INSURANCE = 'Insurance',
  TAX = 'Vehicle Tax',
  MOT = 'MOT',
  CLEANING = 'Cleaning',
  PARKING = 'Parking/Tolls',
  PHONE = 'Phone',
  ACCOUNTANCY = 'Accountancy',
  SUBSCRIPTIONS = 'Subscriptions',
  PROTECTIVE_CLOTHING = 'Protective Clothing',
  TRAINING = 'Training',
  BANK_CHARGES = 'Bank Charges',
  OTHER = 'Other'
}

export const EXPENSE_CATEGORY_OPTIONS: ExpenseCategory[] = [
  ExpenseCategory.FUEL,
  ExpenseCategory.PUBLIC_CHARGING,
  ExpenseCategory.HOME_CHARGING,
  ExpenseCategory.REPAIRS,
  ExpenseCategory.INSURANCE,
  ExpenseCategory.TAX,
  ExpenseCategory.MOT,
  ExpenseCategory.CLEANING,
  ExpenseCategory.PARKING,
  ExpenseCategory.PHONE,
  ExpenseCategory.ACCOUNTANCY,
  ExpenseCategory.SUBSCRIPTIONS,
  ExpenseCategory.PROTECTIVE_CLOTHING,
  ExpenseCategory.TRAINING,
  ExpenseCategory.BANK_CHARGES,
  ExpenseCategory.OTHER,
];

export interface ManualAllowance {
  id: string;
  description: string;
  amount: number;
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
}

export interface DirectDebit {
  id: string;
  name: string;
  amount: number;
  dueDay: number;
}

export type DriverRole = 'COURIER' | 'FOOD_DELIVERY' | 'TAXI' | 'LOGISTICS' | 'OTHER';
export type VehicleFuelType = 'PETROL' | 'DIESEL' | 'HYBRID' | 'EV';

export interface Settings {
  vehicleReg: string;
  vehicleFuelType: VehicleFuelType;
  driverRoles: DriverRole[]; // Changed from single role to array
  colorTheme: 'DARK' | 'LIGHT';
  workWeekStartDay: 'MON' | 'SUN';
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  analyticsConsent?: boolean; // default false - opt-in
  mileageTrackingEnabled: boolean;
  weeklyRevenueTarget: number;
  businessRateFirst10k: number;
  businessRateAfter10k: number;
  vehicleTax: number;
  reminderEnabled: boolean;
  reminderTime: string;
  isScottishTaxpayer?: boolean;
  // Smart Allocations
  taxSetAsidePercent: number;
  maintenanceSetAsidePercent: number;
  debtSetAsidePercent: number;
  // Debt Management
  debts: Debt[];
  directDebits: DirectDebit[];
  debtStrategy: 'AVALANCHE' | 'SNOWBALL';
  // Odometer Tracking
  financialYearStartOdometer: number;
  financialYearStartDate: string;
  lastOdometerCheckDate: string;
  // Manual Adjustments
  manualAllowances: ManualAllowance[];
  dayOffDates: string[];
  updatedAt?: string;
}

export interface PlayerStats {
  xp: number;
  level: number;
  rankTitle: string;
  totalLogs: number;
}

export type SyncPullPayload = {
  workLogs?: Array<{
    id: string;
    date: string;
    platform?: string | null;
    hours?: number | null;
    earnings?: number | null;
    notes?: string | null;
    updated_at?: string | null;
  }>;
  mileageLogs?: Array<{
    id: string;
    date: string;
    description?: string | null;
    miles?: number | null;
    trip_type?: string | null;
    linked_work_id?: string | null;
    updated_at?: string | null;
  }>;
  expenses?: Array<{
    id: string;
    date: string;
    category?: string | null;
    description?: string | null;
    amount?: number | null;
    has_image?: number | null;
    updated_at?: string | null;
  }>;
  shifts?: Array<{
    id: string;
    date: string;
    status?: string | null;
    primary_platform?: string | null;
    hours_worked?: number | null;
    total_earnings?: number | null;
    started_at?: string | null;
    ended_at?: string | null;
    start_odometer?: number | null;
    end_odometer?: number | null;
    business_miles?: number | null;
    fuel_liters?: number | null;
    job_count?: number | null;
    notes?: string | null;
    updated_at?: string | null;
  }>;
  shiftEarnings?: Array<{
    id: string;
    shift_id: string;
    account_id?: string | null;
    platform?: string | null;
    amount?: number | null;
    job_count?: number | null;
  }>;
  deletedIds?: {
    workLogs?: string[];
    mileageLogs?: string[];
    expenses?: string[];
    shifts?: string[];
  };
  settings?: Partial<Settings> | null;
};

export interface ActiveWorkSessionExpenseDraft {
  id: string;
  category: ExpenseCategory;
  amount: number;
  energyQuantity?: number;
  energyUnit?: EnergyQuantityUnit;
  liters?: number;
  description: string;
}

export interface ActiveWorkSession {
  id: string;
  date: string;
  startedAt: string;
  provider?: string;
  startOdometer?: number;
  revenue?: number;
  miles?: number;
  expenses: ActiveWorkSessionExpenseDraft[];
  providerSplits?: ProviderSplit[];
}

export interface CompletedShiftSummary {
  id: string;
  date: string;
  startedAt: string;
  endedAt: string;
  hoursWorked?: number;
  revenue: number;
  taxToSetAside: number;
  mileageClaim: number;
  expensesTotal: number;
  realProfit: number;
  miles: number;
  fuelLiters: number;
  insights: string[];
  weekRevenue: number;
  weekTaxToSetAside: number;
  weekKept: number;
  workDayCount: number;
}

export function getCurrentTaxYearStart(): string {
  return ukTaxYearStart();
}

export function getCurrentTaxYearLabel(): string {
  const startYear = getTaxYear();
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export const DEFAULT_SETTINGS: Settings = {
  vehicleReg: '',
  vehicleFuelType: 'PETROL',
  driverRoles: ['COURIER'],
  colorTheme: 'DARK',
  workWeekStartDay: 'MON',
  claimMethod: 'SIMPLIFIED',
  analyticsConsent: false,
  mileageTrackingEnabled: false,
  weeklyRevenueTarget: 600,
  businessRateFirst10k: 0.45,
  businessRateAfter10k: 0.25,
  vehicleTax: 0,
  reminderEnabled: false,
  reminderTime: '18:00',
  isScottishTaxpayer: false,
  taxSetAsidePercent: 20,
  maintenanceSetAsidePercent: 10,
  debtSetAsidePercent: 0,
  debts: [],
  directDebits: [],
  debtStrategy: 'AVALANCHE',
  financialYearStartOdometer: 0,
  financialYearStartDate: ukTaxYearStart(),
  lastOdometerCheckDate: todayUK(),
  manualAllowances: [],
  dayOffDates: []
};
