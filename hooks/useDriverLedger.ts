import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  ActiveWorkSession,
  ActiveWorkSessionExpenseDraft,
  CompletedShiftSummary,
  DailyWorkLog,
  Expense,
  ExpenseCategory,
  ProviderSplit,
  Settings,
  Trip,
} from '../types';
import * as Sentry from '../src/sentry';
import { trackEvent } from '../services/analyticsService';
import { sanitizeExpenseForStorage } from '../services/syncTransforms';
import { generateInsights } from '../utils/insights';
import { todayUK, ukWeekStart } from '../utils/ukDate';

const nowIso = () => new Date(Date.now()).toISOString();
const DELETED_IDS_KEY = 'driver_deleted_ids';

export type DeletedIdsState = {
  workLogs: string[];
  mileageLogs: string[];
  expenses: string[];
  shifts: string[];
};

type UseDriverLedgerOptions = {
  trips: Trip[];
  setTrips: Dispatch<SetStateAction<Trip[]>>;
  expenses: Expense[];
  setExpenses: Dispatch<SetStateAction<Expense[]>>;
  dailyLogs: DailyWorkLog[];
  setDailyLogs: Dispatch<SetStateAction<DailyWorkLog[]>>;
  activeSession: ActiveWorkSession | null;
  setActiveSession: Dispatch<SetStateAction<ActiveWorkSession | null>>;
  setCompletedShiftSummary: Dispatch<SetStateAction<CompletedShiftSummary | null>>;
  settings: Settings;
};

type LedgerManualShiftPayload = {
  date: string;
  provider: string;
  hoursWorked: number;
  revenue: number;
  expenses: ActiveWorkSessionExpenseDraft[];
  startOdometer?: number;
  endOdometer?: number;
  notes?: string;
  providerSplits?: ProviderSplit[];
};

const createEmptyDeletedIds = (): DeletedIdsState => ({
  workLogs: [],
  mileageLogs: [],
  expenses: [],
  shifts: [],
});

const loadDeletedIds = (): DeletedIdsState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_IDS_KEY) ?? '{}') as Partial<DeletedIdsState>;
    return {
      workLogs: Array.isArray(parsed.workLogs) ? parsed.workLogs : [],
      mileageLogs: Array.isArray(parsed.mileageLogs) ? parsed.mileageLogs : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
    };
  } catch {
    return createEmptyDeletedIds();
  }
};

const persistDeletedIds = (next: DeletedIdsState) => {
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(next));
};

const getFuelLiters = (expenses: Array<Pick<Expense, 'category' | 'liters'>>) =>
  expenses
    .filter((expense) => expense.category === ExpenseCategory.FUEL)
    .reduce((sum, expense) => sum + (expense.liters ?? 0), 0);

const copyEnergyFields = <T extends Pick<Expense, 'energyQuantity' | 'energyUnit' | 'liters'>>(expense: T) => ({
  energyQuantity: expense.energyQuantity,
  energyUnit: expense.energyUnit,
  liters: expense.liters,
});

export function useDriverLedger({
  trips,
  setTrips,
  expenses,
  setExpenses,
  dailyLogs,
  setDailyLogs,
  activeSession,
  setActiveSession,
  setCompletedShiftSummary,
  settings,
}: UseDriverLedgerOptions) {
  const [deletedIds, setDeletedIds] = useState<DeletedIdsState>(() => loadDeletedIds());

  const appendDeletedId = (key: keyof DeletedIdsState, id: string) => {
    setDeletedIds((current) => {
      if (current[key].includes(id)) {
        return current;
      }

      const next = { ...current, [key]: [...current[key], id] };
      persistDeletedIds(next);
      return next;
    });
  };

  const appendDeletedDailyLogId = (id: string) => {
    setDeletedIds((current) => {
      const workLogs = current.workLogs.includes(id) ? current.workLogs : [...current.workLogs, id];
      const shifts = current.shifts.includes(id) ? current.shifts : [...current.shifts, id];
      if (workLogs === current.workLogs && shifts === current.shifts) {
        return current;
      }

      const next = { ...current, workLogs, shifts };
      persistDeletedIds(next);
      return next;
    });
  };

  const clearDeletedIds = () => {
    setDeletedIds((current) => {
      if (!current.workLogs.length && !current.mileageLogs.length && !current.expenses.length && !current.shifts.length) {
        return current;
      }

      const next = createEmptyDeletedIds();
      persistDeletedIds(next);
      return next;
    });
  };

  const addTrip = (trip: Trip) => {
    setTrips((current) => [...current, { ...trip, updatedAt: nowIso() }]);
    trackEvent('trip_logged');
  };

  const deleteTrip = (id: string) => {
    setTrips((current) => current.filter((trip) => trip.id !== id));
    appendDeletedId('mileageLogs', id);
    trackEvent('trip_deleted');
  };

  const updateTrip = (id: string, updates: Partial<Trip>) =>
    setTrips((current) => current.map((trip) => (trip.id === id ? { ...trip, ...updates, updatedAt: nowIso() } : trip)));

  const addExpense = (expense: Expense) => {
    setExpenses((current) => {
      const next = [...current, { ...expense, updatedAt: nowIso() }];
      localStorage.setItem('driver_expenses', JSON.stringify(next.map(sanitizeExpenseForStorage)));
      return next;
    });
    trackEvent('expense_added', { category: expense.category });
  };

  const deleteExpense = (id: string) => {
    setExpenses((current) => {
      const next = current.filter((expense) => expense.id !== id);
      localStorage.setItem('driver_expenses', JSON.stringify(next.map(sanitizeExpenseForStorage)));
      return next;
    });
    appendDeletedId('expenses', id);
    trackEvent('expense_deleted');
  };

  const updateExpense = (expense: Expense) =>
    setExpenses((current) => {
      const next = current.map((item) => (item.id === expense.id ? { ...expense, updatedAt: nowIso() } : item));
      localStorage.setItem('driver_expenses', JSON.stringify(next.map(sanitizeExpenseForStorage)));
      return next;
    });

  const addDailyLog = (log: DailyWorkLog) => {
    setDailyLogs((current) => [...current, { ...log, updatedAt: nowIso() }]);
    trackEvent('shift_logged', { platform: log.provider });
  };

  const removeSubsumedLogs = (date: string, splits: ProviderSplit[]) => {
    for (const split of splits) {
      const match = dailyLogs.find(
        (log) =>
          log.date === date &&
          log.provider === split.provider &&
          Math.abs(log.revenue - split.revenue) < 0.01 &&
          !log.providerSplits?.length
      );
      if (match) deleteDailyLog(match.id);
    }
  };

  const deleteDailyLog = (id: string) => {
    setDailyLogs((current) => current.filter((log) => log.id !== id));
    appendDeletedDailyLogId(id);
    trackEvent('shift_deleted');
  };

  const updateDailyLog = (log: DailyWorkLog) =>
    setDailyLogs((current) => current.map((item) => (item.id === log.id ? { ...log, updatedAt: nowIso() } : item)));

  const calculateMileageClaim = (miles: number) => {
    const totalBusinessMiles = trips.filter((trip) => trip.purpose === 'Business').reduce((sum, trip) => sum + trip.totalMiles, 0);
    const remainingAtPrimaryRate = Math.max(0, 10000 - totalBusinessMiles);
    const milesAtPrimaryRate = Math.min(miles, remainingAtPrimaryRate);
    const milesAtSecondaryRate = Math.max(0, miles - milesAtPrimaryRate);
    return milesAtPrimaryRate * settings.businessRateFirst10k + milesAtSecondaryRate * settings.businessRateAfter10k;
  };

  const startActiveSession = ({ provider, startOdometer }: { provider: string; startOdometer?: number }) => {
    Sentry.addBreadcrumb({ category: 'shift', message: 'shift_started' });
    trackEvent('shift_started', { date: todayUK() });
    setCompletedShiftSummary(null);
    setActiveSession({
      id: `${Date.now()}_session`,
      date: todayUK(),
      startedAt: nowIso(),
      provider,
      startOdometer,
      expenses: [],
    });
  };

  const updateActiveSession = (updates: Partial<ActiveWorkSession>) =>
    setActiveSession((current) => (current ? { ...current, ...updates } : current));

  const finalizeActiveSession = (session: ActiveWorkSession): CompletedShiftSummary => {
    Sentry.addBreadcrumb({ category: 'shift', message: 'shift_completed' });
    trackEvent('shift_completed', { date: session.date });
    const endedAt = nowIso();
    const updatedAt = nowIso();
    const revenue = Number(session.revenue ?? 0);
    const miles = Number(session.miles ?? 0);
    const sessionExpenses = session.expenses ?? [];
    const expensesTotal = sessionExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const fuelLiters = getFuelLiters(sessionExpenses);
    const taxToSetAside = revenue * (settings.taxSetAsidePercent / 100);
    const mileageClaim = calculateMileageClaim(miles);
    const realProfit = revenue - taxToSetAside - expensesTotal;
    const durationMs = Math.max(new Date(endedAt).getTime() - new Date(session.startedAt).getTime(), 0);
    const hoursWorked = Math.max(0.1, durationMs / (1000 * 60 * 60));
    const logId = `${Date.now()}_log`;

    let linkedTripId: string | undefined;
    let linkedTripForInsights: Trip | null = null;
    if (miles > 0) {
      const derivedStartOdometer =
        session.startOdometer ??
        (settings.financialYearStartOdometer
          ? settings.financialYearStartOdometer + trips.reduce((sum, trip) => sum + trip.totalMiles, 0)
          : 0);

      linkedTripId = `${Date.now()}_trip`;
      linkedTripForInsights = {
        id: linkedTripId,
        date: session.date,
        startLocation: 'Work Day Start',
        endLocation: 'Work Day End',
        startOdometer: Number(derivedStartOdometer.toFixed(1)),
        endOdometer: Number((derivedStartOdometer + miles).toFixed(1)),
        totalMiles: miles,
        purpose: 'Business',
        notes: 'Auto-created from Work Day',
        updatedAt,
      };
      addTrip(linkedTripForInsights);
    }

    sessionExpenses.forEach((expense) => {
      addExpense({
        id: expense.id,
        date: session.date,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        ...copyEnergyFields(expense),
        updatedAt,
      });
    });

    const completedLog: DailyWorkLog = {
      id: logId,
      date: session.date,
      provider: session.provider || 'Work Day',
      hoursWorked: Number(hoursWorked.toFixed(2)),
      revenue,
      fuelLiters: fuelLiters > 0 ? Number(fuelLiters.toFixed(2)) : undefined,
      expensesTotal: expensesTotal > 0 ? Number(expensesTotal.toFixed(2)) : 0,
      notes: 'Captured from the Driver Buddy shift flow',
      milesDriven: miles > 0 ? Number(miles.toFixed(1)) : 0,
      linkedTripId,
      startedAt: session.startedAt,
      endedAt,
      providerSplits: session.providerSplits,
      updatedAt,
    };

    if (completedLog.providerSplits?.length) {
      removeSubsumedLogs(completedLog.date, completedLog.providerSplits);
    }
    addDailyLog(completedLog);

    const allLogs = [...dailyLogs, completedLog];
    const weekStart = ukWeekStart(session.date, settings.workWeekStartDay);
    const weekLogs = allLogs.filter((log) => ukWeekStart(log.date, settings.workWeekStartDay) === weekStart);
    const weekRevenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);
    const weekTaxToSetAside = weekRevenue * (settings.taxSetAsidePercent / 100);
    const weekExpenses = weekLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
    const weekKept = weekRevenue - weekTaxToSetAside - weekExpenses;

    setActiveSession(null);

    return {
      id: `${Date.now()}_summary`,
      shiftId: logId,
      date: session.date,
      startedAt: session.startedAt,
      endedAt,
      hoursWorked: Number(hoursWorked.toFixed(2)),
      revenue,
      taxToSetAside,
      mileageClaim,
      expensesTotal,
      realProfit,
      miles,
      fuelLiters,
      insights: generateInsights(
        completedLog,
        allLogs,
        settings,
        linkedTripForInsights ? [...trips, linkedTripForInsights] : trips,
        expenses
      ),
      weekRevenue,
      weekTaxToSetAside,
      weekKept,
      workDayCount: allLogs.length,
    };
  };

  const saveManualShift = (payload: LedgerManualShiftPayload): CompletedShiftSummary => {
    trackEvent('shift_completed', { date: payload.date, mode: 'manual' });
    if (payload.date < todayUK()) {
      trackEvent('log_backfilled', { date: payload.date });
    }

    const startedAt = new Date(`${payload.date}T09:00:00`).toISOString();
    const endedAt = new Date(new Date(startedAt).getTime() + payload.hoursWorked * 60 * 60 * 1000).toISOString();
    const updatedAt = nowIso();
    const expensesTotal = payload.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const fuelLiters = getFuelLiters(payload.expenses);
    const miles =
      payload.startOdometer != null && payload.endOdometer != null
        ? Math.max(0, payload.endOdometer - payload.startOdometer)
        : 0;
    const taxToSetAside = payload.revenue * (settings.taxSetAsidePercent / 100);
    const mileageClaim = calculateMileageClaim(miles);
    const realProfit = payload.revenue - taxToSetAside - expensesTotal;

    let linkedTripId: string | undefined;
    let linkedTripForInsights: Trip | null = null;
    if (miles > 0) {
      linkedTripId = `${Date.now()}_trip`;
      linkedTripForInsights = {
        id: linkedTripId,
        date: payload.date,
        startLocation: 'Manual shift start',
        endLocation: 'Manual shift end',
        startOdometer: payload.startOdometer ?? 0,
        endOdometer: payload.endOdometer ?? (payload.startOdometer ?? 0) + miles,
        totalMiles: miles,
        purpose: 'Business',
        notes: 'Auto-created from quick add shift',
        updatedAt,
      };
      addTrip(linkedTripForInsights);
    }

    payload.expenses.forEach((expense) => {
      addExpense({
        id: expense.id,
        date: payload.date,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        ...copyEnergyFields(expense),
        updatedAt,
      });
    });

    const logId = `${Date.now()}_manual_log`;
    const completedLog: DailyWorkLog = {
      id: logId,
      date: payload.date,
      provider: payload.provider,
      hoursWorked: payload.hoursWorked,
      revenue: payload.revenue,
      fuelLiters: fuelLiters > 0 ? Number(fuelLiters.toFixed(2)) : undefined,
      expensesTotal: expensesTotal > 0 ? Number(expensesTotal.toFixed(2)) : 0,
      notes: payload.notes,
      milesDriven: miles > 0 ? Number(miles.toFixed(1)) : 0,
      linkedTripId,
      startedAt,
      endedAt,
      providerSplits: payload.providerSplits,
      updatedAt,
    };

    if (completedLog.providerSplits?.length) {
      removeSubsumedLogs(completedLog.date, completedLog.providerSplits);
    }
    addDailyLog(completedLog);

    const allLogs = [...dailyLogs, completedLog];
    const weekStart = ukWeekStart(payload.date, settings.workWeekStartDay);
    const weekLogs = allLogs.filter((log) => ukWeekStart(log.date, settings.workWeekStartDay) === weekStart);
    const weekRevenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);
    const weekTaxToSetAside = weekRevenue * (settings.taxSetAsidePercent / 100);
    const weekExpenses = weekLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
    const weekKept = weekRevenue - weekTaxToSetAside - weekExpenses;

    return {
      id: `${Date.now()}_manual_summary`,
      shiftId: logId,
      date: payload.date,
      startedAt,
      endedAt,
      hoursWorked: Number(payload.hoursWorked.toFixed(2)),
      revenue: payload.revenue,
      taxToSetAside,
      mileageClaim,
      expensesTotal,
      realProfit,
      miles,
      fuelLiters,
      insights: generateInsights(
        completedLog,
        allLogs,
        settings,
        linkedTripForInsights ? [...trips, linkedTripForInsights] : trips,
        expenses
      ),
      weekRevenue,
      weekTaxToSetAside,
      weekKept,
      workDayCount: allLogs.length,
    };
  };

  return {
    deletedIds,
    clearDeletedIds,
    addTrip,
    deleteTrip,
    updateTrip,
    addExpense,
    deleteExpense,
    updateExpense,
    addDailyLog,
    deleteDailyLog,
    updateDailyLog,
    startActiveSession,
    updateActiveSession,
    finalizeActiveSession,
    saveManualShift,
  };
}
