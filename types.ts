
export interface Trip {
  id: string;
  date: string;
  startLocation: string;
  endLocation: string;
  startOdometer: number;
  endOdometer: number;
  totalMiles: number;
  purpose: 'Business' | 'Personal' | 'Commute';
  notes: string;
  path?: {lat: number, lng: number}[];
}

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  receiptUrl?: string;
  isVatClaimable?: boolean;
  liters?: number;
}

export interface DailyWorkLog {
  id: string;
  date: string;
  provider: string;
  hoursWorked: number;
  revenue: number;
  fuelLiters?: number;
  notes?: string;
  jobCount?: number; // Drops, Rides, or Movements based on role
}

export enum ExpenseCategory {
  FUEL = 'Fuel',
  REPAIRS = 'Repairs & Maintenance',
  INSURANCE = 'Insurance',
  TAX = 'Vehicle Tax',
  MOT = 'MOT',
  CLEANING = 'Cleaning',
  PARKING = 'Parking/Tolls',
  OTHER = 'Other'
}

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

export type DriverRole = 'COURIER' | 'FOOD_DELIVERY' | 'TAXI' | 'LOGISTICS' | 'OTHER';

export interface Settings {
  vehicleReg: string;
  driverRoles: DriverRole[]; // Changed from single role to array
  claimMethod: 'SIMPLIFIED' | 'ACTUAL';
  businessRateFirst10k: number;
  businessRateAfter10k: number;
  vehicleTax: number;
  reminderEnabled: boolean;
  reminderTime: string;
  // Smart Allocations
  taxSetAsidePercent: number;
  maintenanceSetAsidePercent: number;
  debtSetAsidePercent: number;
  // Debt Management
  debts: Debt[];
  debtStrategy: 'AVALANCHE' | 'SNOWBALL';
  // Odometer Tracking
  financialYearStartOdometer: number;
  financialYearStartDate: string;
  lastOdometerCheckDate: string;
  // Manual Adjustments
  manualAllowances: ManualAllowance[];
}

export interface PlayerStats {
  xp: number;
  level: number;
  rankTitle: string;
  totalLogs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  vehicleReg: '',
  driverRoles: ['COURIER'],
  claimMethod: 'SIMPLIFIED',
  businessRateFirst10k: 0.45,
  businessRateAfter10k: 0.25,
  vehicleTax: 0,
  reminderEnabled: false,
  reminderTime: '18:00',
  taxSetAsidePercent: 20,
  maintenanceSetAsidePercent: 10,
  debtSetAsidePercent: 0,
  debts: [],
  debtStrategy: 'AVALANCHE',
  financialYearStartOdometer: 0,
  financialYearStartDate: '2024-04-06', // Default UK Tax Year
  lastOdometerCheckDate: new Date().toISOString().split('T')[0],
  manualAllowances: []
};
