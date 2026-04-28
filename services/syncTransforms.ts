import { DailyWorkLog, EnergyQuantityUnit, Expense, ExpenseCategory, ProviderSplit, Settings, SyncPullPayload, Trip } from '../types';
import * as Sentry from '../src/sentry';
import { migrateDailyWorkLog } from '../shared/migrations/migrateShift';
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
  energyQuantity?: number;
  energyUnit?: EnergyQuantityUnit;
  liters?: number;
  receiptId?: string;
  receiptUrl?: string;
};

type SyncDeletedIds = {
  workLogs?: string[];
  mileageLogs?: string[];
  expenses?: string[];
  shifts?: string[];
};

type SyncShiftPushItem = {
  id: string;
  date: string;
  status: string;
  primary_platform?: string;
  hours_worked?: number;
  total_earnings: number;
  started_at?: string;
  ended_at?: string;
  start_odometer?: number;
  end_odometer?: number;
  business_miles?: number;
  fuel_liters?: number;
  job_count?: number;
  notes?: string;
  updatedAt?: string;
};

type SyncShiftEarningPushItem = {
  id: string;
  shift_id: string;
  platform: string;
  amount: number;
  job_count?: number;
};

type SyncShiftPullRow = NonNullable<SyncPullPayload['shifts']>[number];

type SyncShiftEarningPullRow = NonNullable<SyncPullPayload['shiftEarnings']>[number];

const isTripPurpose = (value: string | null | undefined): value is Trip['purpose'] =>
  value === 'Business' || value === 'Personal' || value === 'Commute';
const isExpenseCategory = (value: string | null | undefined): value is Expense['category'] =>
  !!value && Object.values(ExpenseCategory).includes(value as ExpenseCategory);
const isEnergyQuantityUnit = (value: string | null | undefined): value is EnergyQuantityUnit =>
  value === 'litre' || value === 'kWh';
const parseSyncMeta = <T,>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
};

const toOptionalNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const formatPlatformLabel = (value: string | null | undefined) => {
  switch (value) {
    case 'amazon_flex':
      return 'Amazon Flex';
    case 'just_eat':
      return 'Just Eat';
    case 'deliveroo':
      return 'Deliveroo';
    case 'uber':
      return 'Uber';
    case 'bolt':
      return 'Bolt';
    case 'other':
      return 'Other';
    default:
      return value ?? 'Other';
  }
};

const toSyncTimestamp = (updatedAt: string | undefined, fallbackDate: string): string =>
  updatedAt ?? `${fallbackDate}T12:00:00.000Z`;

export const sanitizeExpenseForStorage = <T extends Expense>(expense: T): T => {
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
  } as T;
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

export const buildSyncPayload = (
  trips: Trip[],
  expenses: Expense[],
  dailyLogs: DailyWorkLog[],
  settings: Settings,
  deletedIds?: SyncDeletedIds
) => {
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  const shifts = dailyLogs.map((log) => migrateDailyWorkLog(log, log.linkedTripId ? tripsById.get(log.linkedTripId) : undefined));
  const shiftRows: SyncShiftPushItem[] = shifts.map((shift) => ({
    id: shift.id,
    date: shift.date,
    status: shift.status,
    primary_platform: shift.primaryPlatform,
    hours_worked: shift.hoursWorked,
    total_earnings: shift.totalEarnings,
    started_at: shift.startedAt,
    ended_at: shift.endedAt,
    start_odometer: shift.startOdometer,
    end_odometer: shift.endOdometer,
    business_miles: shift.businessMiles,
    fuel_liters: shift.fuelLiters,
    job_count: shift.jobCount,
    notes: shift.notes,
    updatedAt: toSyncTimestamp(dailyLogs.find((log) => log.id === shift.id)?.updatedAt, shift.date),
  }));
  const shiftEarningRows: SyncShiftEarningPushItem[] = shifts.flatMap((shift) =>
    shift.earnings.map((earning) => ({
      id: earning.id,
      shift_id: shift.id,
      platform: earning.platform,
      amount: earning.amount,
      job_count: earning.jobCount,
    }))
  );

  return {
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
      updatedAt: toSyncTimestamp(log.updatedAt, log.date),
    })),
    shifts: shiftRows,
    shiftEarnings: shiftEarningRows,
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
      updatedAt: toSyncTimestamp(trip.updatedAt, trip.date),
    })),
    expenses: expenses.map((expense) => ({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      description: JSON.stringify({
        description: expense.description,
        isVatClaimable: expense.isVatClaimable,
        energyQuantity: expense.energyQuantity,
        energyUnit: expense.energyUnit,
        liters: expense.liters,
        receiptId: expense.receiptId,
        receiptUrl: expense.receiptUrl,
      } satisfies SyncExpenseMeta),
      amount: expense.amount,
      taxDeductible: true,
      hasImage: Boolean(expense.hasReceiptImage || expense.receiptId || expense.receiptUrl),
      scope: expense.scope,
      businessUsePercent: expense.businessUsePercent,
      deductibleAmount: expense.deductibleAmount,
      nonDeductibleAmount: expense.nonDeductibleAmount,
      vehicleExpenseType: expense.vehicleExpenseType,
      taxTreatment: expense.taxTreatment,
      linkedShiftId: expense.linkedShiftId,
      sourceType: expense.sourceType,
      reviewStatus: expense.reviewStatus,
      updatedAt: toSyncTimestamp(expense.updatedAt, expense.date),
    })),
    settings,
    deletedIds,
  };
};

function mergeRecordsByDate<T extends { id: string; date: string; updatedAt?: string }>(
  localRecords: T[],
  pulledRecords: T[]
): T[] {
  const merged = new Map(localRecords.map((record) => [record.id, record]));
  const timestamp = (value: string | undefined) => {
    if (!value) return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  for (const record of pulledRecords) {
    const existing = merged.get(record.id);
    if (!existing) {
      merged.set(record.id, record);
      continue;
    }

    if (record.updatedAt && existing.updatedAt) {
      const recordTime = timestamp(record.updatedAt);
      const existingTime = timestamp(existing.updatedAt);
      if (recordTime != null && existingTime != null && recordTime > existingTime) {
        merged.set(record.id, record);
      }
    } else if (record.date >= existing.date) {
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
      updatedAt: row.updated_at ?? undefined,
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
      updatedAt: row.updated_at ?? undefined,
    };
  }));

export const applyPulledShiftWorkLogs = (
  shiftRows: SyncShiftPullRow[],
  shiftEarningRows: SyncShiftEarningPullRow[] = [],
  localLogs: DailyWorkLog[] = []
): DailyWorkLog[] => {
  const earningsByShiftId = new Map<string, ProviderSplit[]>();

  for (const row of shiftEarningRows) {
    const existing = earningsByShiftId.get(row.shift_id) ?? [];
    existing.push({
      provider: formatPlatformLabel(row.platform),
      revenue: Number(row.amount ?? 0),
      ...(toOptionalNumber(row.job_count) !== undefined ? { jobCount: Number(row.job_count) } : {}),
    });
    earningsByShiftId.set(row.shift_id, existing);
  }

  return mergeRecordsByDate(localLogs, shiftRows.map((shiftRow) => {
    const providerSplits = earningsByShiftId.get(shiftRow.id);
    const primaryProvider = shiftRow.primary_platform ?? providerSplits?.[0]?.provider ?? 'Synced shift';

    return {
      id: shiftRow.id,
      date: shiftRow.date,
      provider: primaryProvider,
      hoursWorked: Number(shiftRow.hours_worked ?? 0),
      revenue: Number(shiftRow.total_earnings ?? 0),
      notes: shiftRow.notes ?? undefined,
      fuelLiters: toOptionalNumber(shiftRow.fuel_liters),
      jobCount: toOptionalNumber(shiftRow.job_count),
      milesDriven: toOptionalNumber(shiftRow.business_miles),
      startedAt: shiftRow.started_at ?? undefined,
      endedAt: shiftRow.ended_at ?? undefined,
      providerSplits: providerSplits?.length ? providerSplits : undefined,
      updatedAt: shiftRow.updated_at ?? undefined,
    };
  }));
};

export const applyPulledExpenses = (
  rows: NonNullable<SyncPullPayload['expenses']>,
  localExpenses: Expense[] = []
): Expense[] =>
  mergeRecordsByDate(localExpenses, rows.map((row) => {
    const meta = parseSyncMeta<SyncExpenseMeta>(row.description);
    const legacyLiters = toOptionalNumber(meta?.liters);
    const energyQuantity = toOptionalNumber(meta?.energyQuantity) ?? legacyLiters;
    const energyUnit = isEnergyQuantityUnit(meta?.energyUnit) ? meta.energyUnit : energyQuantity !== undefined ? 'litre' : undefined;
    const businessUsePercent = toOptionalNumber(row.businessUsePercent ?? row.business_use_percent);
    const deductibleAmount = toOptionalNumber(row.deductibleAmount ?? row.deductible_amount);
    const nonDeductibleAmount = toOptionalNumber(row.nonDeductibleAmount ?? row.non_deductible_amount);
    const linkedShiftId = row.linkedShiftId !== undefined ? row.linkedShiftId : row.linked_shift_id;
    const sourceType = row.sourceType ?? row.source_type;
    const reviewStatus = row.reviewStatus ?? row.review_status;
    const taxTreatment = row.taxTreatment ?? row.tax_treatment;
    const vehicleExpenseType = row.vehicleExpenseType ?? row.vehicle_expense_type;

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
      energyQuantity,
      energyUnit,
      liters: legacyLiters,
      ...(row.scope != null ? { scope: row.scope } : {}),
      ...(businessUsePercent !== undefined ? { businessUsePercent } : {}),
      ...(deductibleAmount !== undefined ? { deductibleAmount } : {}),
      ...(nonDeductibleAmount !== undefined ? { nonDeductibleAmount } : {}),
      ...(vehicleExpenseType != null ? { vehicleExpenseType } : {}),
      ...(taxTreatment != null ? { taxTreatment } : {}),
      ...(linkedShiftId !== undefined ? { linkedShiftId } : {}),
      ...(sourceType != null ? { sourceType } : {}),
      ...(reviewStatus != null ? { reviewStatus } : {}),
      updatedAt: row.updated_at ?? undefined,
    });
  }));
