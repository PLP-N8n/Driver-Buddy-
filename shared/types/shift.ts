export type ShiftStatus = 'active' | 'completed';
export type MileageSource = 'odo' | 'gps' | 'manual';
export type Platform = 'uber' | 'deliveroo' | 'just_eat' | 'amazon_flex' | 'bolt' | 'other';

export interface ShiftEarning {
  id: string;
  shiftId: string;
  platform: Platform;
  amount: number;
  jobCount?: number;
}

export interface Shift {
  id: string;
  date: string;
  status: ShiftStatus;
  primaryPlatform?: string;
  hoursWorked?: number;
  totalEarnings: number;
  earnings: ShiftEarning[];
  startedAt?: string;
  endedAt?: string;
  startOdometer?: number;
  endOdometer?: number;
  businessMiles?: number;
  personalGapMiles?: number;
  gpsMiles?: number;
  mileageSource?: MileageSource;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  fuelLiters?: number;
  expensesTotal?: number;
  jobCount?: number;
  notes?: string;
}

export interface ShiftExpenseDraft {
  id: string;
  category: string;
  amount: number;
  liters?: number;
  description: string;
}

export interface ActiveShift {
  id: string;
  date: string;
  startedAt: string;
  primaryPlatform?: string;
  startOdometer?: number;
  totalEarnings?: number;
  businessMiles?: number;
  earnings: ShiftEarning[];
  expenseDrafts: ShiftExpenseDraft[];
}

export interface ShiftSummary {
  id: string;
  date: string;
  startedAt: string;
  endedAt: string;
  hoursWorked?: number;
  totalEarnings: number;
  taxToSetAside: number;
  mileageClaim: number;
  expensesTotal: number;
  realProfit: number;
  businessMiles: number;
  fuelLiters: number;
  insights: string[];
  weekEarnings: number;
  weekTaxToSetAside: number;
  weekKept: number;
  workDayCount: number;
}
