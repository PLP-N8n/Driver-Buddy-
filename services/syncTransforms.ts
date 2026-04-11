import { DailyWorkLog, Expense, ExpenseCategory, ProviderSplit, Settings, SyncPullPayload, Trip } from '../types';
import * as Sentry from '../src/sentry';
import { saveImage } from './imageStore';

type SyncTripMeta = {
  startLocation: string;
  endLocation: string;
  startOdometer: number;
  endOdometer: number;
  notes: string;
  purpose: Trip['purpose'];
};

type SyncWorkLogMeta = {
  notes?: string;
  fuelLiters?: number;
  jobCount?: number;
  milesDriven?: number;
  linkedTripId?: string;
  expensesTotal?: number;
  startedAt?: string;
  endedAt?: string;
  providerSplits?: ProviderSplit[];
};

type SyncExpenseMeta = {
  description: string;
  isVatClaimable?: boolean;
  liters?: number;
  receiptId?: string;
  receiptUrl?: string;
};

const isTripPurpose = (value: string | null | undefined): value is Trip['purpose'] =>
  value === 'Business' || value === 'Personal' || value === 'Commute';
const isExpenseCategory = (value: string | null | undefined): value is Expense['category'] =>
  !!value && Object.values(ExpenseCategory).includes(value as ExpenseCategory);
const parseSyncMeta = <T,>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
};

export const sanitizeExpenseForStorage = (expense: Expense): Expense => {
  const { receiptUrl: _receiptUrl, ...rest } = expense;
  const storedReceiptUrl =
    typeof expense.receiptUrl === 'string' &&
    expense.receiptUrl.length > 0 &&
    !expense.receiptUrl.startsWith('data:') &&
    !expense.receiptUrl.startsWith('blob:')
      ? expense.receiptUrl
      : undefined;

  return {
    ...rest,
    receiptUrl: storedReceiptUrl,
    hasReceiptImage: expense.hasReceiptImage ?? Boolean(expense.receiptId || expense.receiptUrl),
  };
};

export const prepareExpensesForLocalState = async (storedExpenses: Expense[]): Promise<Expense[]> => {
  const preparedExpenses: Expense[] = [];

  for (const expense of storedExpenses) {
    const hasInlineImage = typeof expense.receiptUrl === 'string' && expense.receiptUrl.startsWith('data:');

    if (hasInlineImage) {
      try {
        const inlineReceiptUrl = expense.receiptUrl;
        if (!inlineReceiptUrl) continue;

        const blob = await fetch(inlineReceiptUrl).then((response) => response.blob());
        await saveImage(expense.id, blob);
      } catch (error) {
        Sentry.captureException(error);
        console.error('Failed to migrate receipt image to IndexedDB', error);
      }
    }

    preparedExpenses.push(
      sanitizeExpenseForStorage({
        ...expense,
        hasReceiptImage: expense.hasReceiptImage ?? Boolean(expense.receiptId || expense.receiptUrl),
      })
    );
  }

  return preparedExpenses;
};

export const buildSyncPayload = (trips: Trip[], expenses: Expense[], dailyLogs: DailyWorkLog[], settings: Settings) => ({
  workLogs: dailyLogs.map((log) => ({
    id: log.id,
    date: log.date,
    platform: log.provider,
    hours: log.hoursWorked,
    earnings: log.revenue,
    notes: JSON.stringify({
      notes: log.notes,
      fuelLiters: log.fuelLiters,
      jobCount: log.jobCount,
      milesDriven: log.milesDriven,
      linkedTripId: log.linkedTripId,
      expensesTotal: log.expensesTotal,
      startedAt: log.startedAt,
      endedAt: log.endedAt,
      providerSplits: log.providerSplits,
    } satisfies SyncWorkLogMeta),
  })),
  mileageLogs: trips.map((trip) => ({
    id: trip.id,
    date: trip.date,
    description: JSON.stringify({
      startLocation: trip.startLocation,
      endLocation: trip.endLocation,
      startOdometer: trip.startOdometer,
      endOdometer: trip.endOdometer,
      notes: trip.notes,
      purpose: trip.purpose,
    } satisfies SyncTripMeta),
    miles: trip.totalMiles,
    tripType: trip.purpose,
    linkedWorkId: null,
  })),
  expenses: expenses.map((expense) => ({
    id: expense.id,
    date: expense.date,
    category: expense.category,
    description: JSON.stringify({
      description: expense.description,
      isVatClaimable: expense.isVatClaimable,
      liters: expense.liters,
      receiptId: expense.receiptId,
      receiptUrl: expense.receiptUrl,
    } satisfies SyncExpenseMeta),
    amount: expense.amount,
    taxDeductible: true,
    hasImage: Boolean(expense.hasReceiptImage || expense.receiptId || expense.receiptUrl),
  })),
  settings,
});

function mergeRecordsByDate<T extends { id: string; date: string }>(localRecords: T[], pulledRecords: T[]): T[] {
  const merged = new Map(localRecords.map((record) => [record.id, record]));

  for (const record of pulledRecords) {
    const existing = merged.get(record.id);
    if (!existing || record.date >= existing.date) {
      merged.set(record.id, record);
    }
  }

  return [...merged.values()];
}

export const applyPulledTrips = (
  rows: NonNullable<SyncPullPayload['mileageLogs']>,
  localTrips: Trip[] = []
): Trip[] =>
  mergeRecordsByDate(localTrips, rows.map((row) => {
    const meta = parseSyncMeta<SyncTripMeta>(row.description);
    const totalMiles = Number(row.miles ?? 0);
    const purpose = isTripPurpose(row.trip_type) ? row.trip_type : meta?.purpose ?? 'Business';
    const startOdometer = Number(meta?.startOdometer ?? 0);
    const endOdometer = Number(meta?.endOdometer ?? startOdometer + totalMiles);

    return {
      id: row.id,
      date: row.date,
      startLocation: meta?.startLocation ?? 'Synced trip',
      endLocation: meta?.endLocation ?? '',
      startOdometer,
      endOdometer,
      totalMiles,
      purpose,
      notes: meta?.notes ?? row.description ?? '',
    };
  }));

export const applyPulledWorkLogs = (
  rows: NonNullable<SyncPullPayload['workLogs']>,
  localLogs: DailyWorkLog[] = []
): DailyWorkLog[] =>
  mergeRecordsByDate(localLogs, rows.map((row) => {
    const meta = parseSyncMeta<SyncWorkLogMeta>(row.notes);

    return {
      id: row.id,
      date: row.date,
      provider: row.platform ?? 'Synced work log',
      hoursWorked: Number(row.hours ?? 0),
      revenue: Number(row.earnings ?? 0),
      notes: meta?.notes,
      fuelLiters: meta?.fuelLiters,
      jobCount: meta?.jobCount,
      milesDriven: meta?.milesDriven,
      linkedTripId: meta?.linkedTripId,
      expensesTotal: meta?.expensesTotal,
      startedAt: meta?.startedAt,
      endedAt: meta?.endedAt,
      providerSplits: meta?.providerSplits,
    };
  }));

export const applyPulledExpenses = (
  rows: NonNullable<SyncPullPayload['expenses']>,
  localExpenses: Expense[] = []
): Expense[] =>
  mergeRecordsByDate(localExpenses, rows.map((row) => {
    const meta = parseSyncMeta<SyncExpenseMeta>(row.description);

    return sanitizeExpenseForStorage({
      id: row.id,
      date: row.date,
      category: isExpenseCategory(row.category) ? row.category : ExpenseCategory.OTHER,
      amount: Number(row.amount ?? 0),
      description: meta?.description ?? row.description ?? '',
      receiptId: meta?.receiptId,
      receiptUrl: meta?.receiptUrl,
      hasReceiptImage: Boolean(row.has_image || meta?.receiptId || meta?.receiptUrl),
      isVatClaimable: Boolean(meta?.isVatClaimable),
      liters: meta?.liters,
    });
  }));
