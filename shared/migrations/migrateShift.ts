import type { Shift, ActiveShift, ShiftEarning, Platform } from '../types/shift';
import type { DailyWorkLog, ActiveWorkSession, Trip } from '../../types';

/**
 * Convert a legacy DailyWorkLog to the canonical Shift type.
 * Optionally merges in an associated Trip for odometer fields.
 * Safe to call on already-migrated data - if the record has a `status` field it is returned as-is.
 */
export function migrateDailyWorkLog(log: DailyWorkLog, linkedTrip?: Trip): Shift {
  // Already migrated
  if ('status' in log && 'earnings' in log) return log as unknown as Shift;

  const earnings: ShiftEarning[] = (log.providerSplits ?? []).map((ps, i) => ({
    id: `${log.id}-earning-${i}`,
    shiftId: log.id,
    platform: normalisePlatform(ps.provider),
    amount: ps.revenue,
    jobCount: ps.jobCount,
  }));

  return {
    id: log.id,
    date: log.date,
    status: 'completed',
    primaryPlatform: log.provider,
    hoursWorked: log.hoursWorked,
    totalEarnings: log.revenue,
    earnings,
    startedAt: log.startedAt,
    endedAt: log.endedAt,
    startOdometer: linkedTrip?.startOdometer,
    endOdometer: linkedTrip?.endOdometer,
    businessMiles: log.milesDriven ?? linkedTrip?.totalMiles,
    fuelLiters: log.fuelLiters,
    expensesTotal: log.expensesTotal,
    jobCount: log.jobCount,
    notes: log.notes,
  };
}

/**
 * Convert a legacy ActiveWorkSession to the canonical ActiveShift type.
 */
export function migrateActiveWorkSession(session: ActiveWorkSession): ActiveShift {
  if ('expenseDrafts' in session) return session as unknown as ActiveShift;

  const earnings: ShiftEarning[] = (session.providerSplits ?? []).map((ps, i) => ({
    id: `${session.id}-earning-${i}`,
    shiftId: session.id,
    platform: normalisePlatform(ps.provider),
    amount: ps.revenue,
  }));

  return {
    id: session.id,
    date: session.date,
    startedAt: session.startedAt,
    primaryPlatform: session.provider,
    startOdometer: session.startOdometer,
    totalEarnings: session.revenue,
    businessMiles: session.miles,
    earnings,
    expenseDrafts: (session.expenses ?? []).map((e) => ({
      id: e.id,
      category: e.category,
      amount: e.amount,
      liters: e.liters,
      description: e.description,
    })),
  };
}

function normalisePlatform(provider: string | undefined): Platform {
  const map: Record<string, Platform> = {
    uber: 'uber',
    'uber eats': 'uber',
    deliveroo: 'deliveroo',
    'just eat': 'just_eat',
    'amazon flex': 'amazon_flex',
    bolt: 'bolt',
  };
  return map[provider?.toLowerCase() ?? ''] ?? 'other';
}
