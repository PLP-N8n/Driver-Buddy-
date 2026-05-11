import { jsonErr, jsonOk } from '../lib/json';
import { getAuthenticatedAccountId } from '../lib/auth';
import { checkRateLimit } from '../lib/rateLimit';

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  RECEIPTS?: R2Bucket;
  EXTRA_ALLOWED_ORIGINS?: string;
}

interface D1Result<T> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

type ReceiptBucket = R2Bucket & {
  list: (options?: { prefix?: string; cursor?: string }) => Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
};

type SyncPayload = {
  workLogs?: Array<Record<string, unknown>>;
  mileageLogs?: Array<Record<string, unknown>>;
  expenses?: Array<Record<string, unknown>>;
  shifts?: Array<Record<string, unknown>>;
  shiftEarnings?: Array<Record<string, unknown>>;
  settings?: unknown;
  deletedIds?: DeletedIds;
  evidence?: SyncEvidence;
};

type SyncEvidence = {
  shifts?: Array<Record<string, unknown>>;
  expenses?: Array<Record<string, unknown>>;
  mileage?: Array<Record<string, unknown>>;
};

type DeletedIds = {
  workLogs?: string[];
  mileageLogs?: string[];
  expenses?: string[];
  shifts?: string[];
};

const MAX_SYNC_BODY_BYTES = 10 * 1024 * 1024;
const MAX_SYNC_ROWS_PER_ENTITY = 5_000;
const MAX_SYNC_STRING_LENGTH = 10_000;
const MAX_SYNC_ID_LENGTH = 128;

function validateSyncPayload(body: SyncPayload): { ok: true } | { ok: false; reason: string } {
  const totalRows =
    (body.workLogs?.length ?? 0) +
    (body.mileageLogs?.length ?? 0) +
    (body.expenses?.length ?? 0) +
    (body.shifts?.length ?? 0) +
    (body.shiftEarnings?.length ?? 0);

  if (totalRows > MAX_SYNC_ROWS_PER_ENTITY * 5) {
    return { ok: false, reason: 'sync payload too large' };
  }

  for (const key of ['workLogs', 'mileageLogs', 'expenses', 'shifts', 'shiftEarnings'] as const) {
    const rows = body[key] ?? [];
    if (rows.length > MAX_SYNC_ROWS_PER_ENTITY) {
      return { ok: false, reason: `too many ${key}` };
    }
  }

  const stringFields = ['notes', 'description', 'category', 'platform', 'status', 'primary_platform', 'mileage_source'];
  for (const rows of [body.workLogs, body.mileageLogs, body.expenses, body.shifts, body.shiftEarnings]) {
    if (!rows) continue;
    for (const row of rows) {
      for (const field of stringFields) {
        const value = row[field];
        if (typeof value === 'string' && value.length > MAX_SYNC_STRING_LENGTH) {
          return { ok: false, reason: `field ${field} exceeds max length` };
        }
      }
      const id = row.id ?? row.shift_id;
      if (typeof id === 'string' && id.length > MAX_SYNC_ID_LENGTH) {
        return { ok: false, reason: 'id exceeds max length' };
      }
    }
  }

  return { ok: true };
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

const asStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  return String(value);
};

const asRequiredId = (value: unknown): string => {
  const normalized = asStringOrNull(value);
  return normalized ?? '';
};

const asFlag = (value: unknown, fallback = false) => (value ? 1 : fallback ? 1 : 0);

const asResolvedFromEvidence = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return '[]';
};

const asNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }

  return null;
};

const asUpdatedAt = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
};

const getRowUpdatedAt = (row: Record<string, unknown>, fallback: number): number =>
  asUpdatedAt(row.updatedAt ?? row.updated_at, fallback);

function getSettingsUpdatedAt(settings: unknown, fallback: number): number {
  if (!settings || typeof settings !== 'object') return fallback;
  return asUpdatedAt((settings as { updatedAt?: unknown; updated_at?: unknown }).updatedAt ?? (settings as { updated_at?: unknown }).updated_at, fallback);
}

type ExpenseScope = 'business' | 'personal' | 'mixed';
type TaxTreatment = 'deductible' | 'partially_deductible' | 'blocked_under_simplified' | 'non_deductible';
type VehicleExpenseType = 'running_cost' | 'separately_allowable' | 'non_vehicle' | 'personal_only';
type ClaimMethod = 'SIMPLIFIED' | 'ACTUAL';

const vehicleRunningCostCategories = new Set([
  'Fuel',
  'Public Charging',
  'Home Charging',
  'Repairs & Maintenance',
  'Insurance',
  'Vehicle Tax',
  'MOT',
  'Cleaning',
]);

const separatelyAllowableCategories = new Set(['Parking/Tolls']);

const asClaimMethod = (settings: unknown): ClaimMethod => {
  if (!settings || typeof settings !== 'object') return 'SIMPLIFIED';
  const value = (settings as { claimMethod?: unknown }).claimMethod;
  return value === 'ACTUAL' ? 'ACTUAL' : 'SIMPLIFIED';
};

const asExpenseScope = (value: unknown): ExpenseScope | null => {
  if (value === 'business' || value === 'personal' || value === 'mixed') return value;
  return null;
};

const asTaxTreatment = (value: unknown): TaxTreatment | null => {
  if (
    value === 'deductible' ||
    value === 'partially_deductible' ||
    value === 'blocked_under_simplified' ||
    value === 'non_deductible'
  ) {
    return value;
  }
  return null;
};

const asVehicleExpenseType = (value: unknown): VehicleExpenseType | null => {
  if (value === 'running_cost' || value === 'separately_allowable' || value === 'non_vehicle' || value === 'personal_only') {
    return value;
  }
  return null;
};

const getVehicleExpenseType = (category: string): VehicleExpenseType => {
  if (vehicleRunningCostCategories.has(category)) return 'running_cost';
  if (separatelyAllowableCategories.has(category)) return 'separately_allowable';
  return 'non_vehicle';
};

const getTaxTreatment = (vehicleExpenseType: VehicleExpenseType, scope: ExpenseScope, claimMethod: ClaimMethod): TaxTreatment => {
  if (scope === 'personal') return 'non_deductible';
  if (vehicleExpenseType === 'running_cost' && claimMethod === 'SIMPLIFIED') return 'blocked_under_simplified';
  if (scope === 'mixed') return 'partially_deductible';
  return 'deductible';
};

const clampBusinessUsePercent = (value: number | null, scope: ExpenseScope) => {
  if (scope === 'personal') return 0;
  if (value === null) return scope === 'mixed' ? 50 : 100;
  return Math.min(100, Math.max(0, value));
};

const readExpenseMeta = (row: Record<string, unknown>): { isVatClaimable?: boolean } => {
  const description = asStringOrNull(row.description);
  if (!description) return {};

  try {
    const parsed = JSON.parse(description) as { isVatClaimable?: unknown };
    return { isVatClaimable: parsed.isVatClaimable === true };
  } catch {
    return {};
  }
};

const calculateDeductibleAmounts = (
  amount: number,
  isVatClaimable: boolean,
  taxTreatment: TaxTreatment,
  businessUsePercent: number
) => {
  const taxBasisAmount = isVatClaimable ? amount / 1.2 : amount;
  if (taxTreatment === 'non_deductible' || taxTreatment === 'blocked_under_simplified') {
    return { deductibleAmount: 0, nonDeductibleAmount: taxBasisAmount };
  }
  if (taxTreatment === 'partially_deductible') {
    const deductibleAmount = (taxBasisAmount * businessUsePercent) / 100;
    return { deductibleAmount, nonDeductibleAmount: taxBasisAmount - deductibleAmount };
  }
  return { deductibleAmount: taxBasisAmount, nonDeductibleAmount: 0 };
};

const classifyExpenseRow = (row: Record<string, unknown>, claimMethod: ClaimMethod) => {
  const category = asStringOrNull(row.category) ?? '';
  const scope = asExpenseScope(row.scope) ?? 'business';
  const businessUsePercent = clampBusinessUsePercent(
    asNumberOrNull(row.businessUsePercent ?? row.business_use_percent),
    scope
  );
  const vehicleExpenseType = asVehicleExpenseType(row.vehicleExpenseType ?? row.vehicle_expense_type) ?? getVehicleExpenseType(category);
  const incomingTaxTreatment = asTaxTreatment(row.taxTreatment ?? row.tax_treatment);
  const taxTreatment = incomingTaxTreatment ?? getTaxTreatment(vehicleExpenseType, scope, claimMethod);
  const amount = asNumberOrNull(row.amount) ?? 0;
  const meta = readExpenseMeta(row);
  const calculated = calculateDeductibleAmounts(amount, Boolean(meta.isVatClaimable), taxTreatment, businessUsePercent);
  const incomingDeductibleAmount = asNumberOrNull(row.deductibleAmount ?? row.deductible_amount);
  const incomingNonDeductibleAmount = asNumberOrNull(row.nonDeductibleAmount ?? row.non_deductible_amount);

  return {
    scope,
    businessUsePercent,
    deductibleAmount: incomingTaxTreatment ? incomingDeductibleAmount ?? calculated.deductibleAmount : calculated.deductibleAmount,
    nonDeductibleAmount: incomingTaxTreatment ? incomingNonDeductibleAmount ?? calculated.nonDeductibleAmount : calculated.nonDeductibleAmount,
    vehicleExpenseType,
    taxTreatment,
  };
};

async function isStaleShift(env: Env, accountId: string, shiftId: string, incomingUpdatedAt: number): Promise<boolean> {
  const existing = await env.DB.prepare('SELECT updated_at FROM shifts WHERE id = ? AND account_id = ?')
    .bind(shiftId, accountId)
    .first();
  const existingUpdatedAt = asUpdatedAt((existing as { updated_at?: unknown } | null)?.updated_at, 0);
  return existingUpdatedAt > incomingUpdatedAt;
}

export async function handleSyncPush(request: Request, env: Env): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'sync', env.DB, 60);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_SYNC_BODY_BYTES) {
    return jsonErr(request, 'payload too large', 413, env);
  }

  const body = await readJson<SyncPayload>(request);
  if (!body) return jsonErr(request, 'invalid json', 400, env);

  const validation = validateSyncPayload(body);
  if (!validation.ok) {
    return jsonErr(request, validation.reason, 400, env);
  }

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  const now = Date.now();
  const claimMethod = asClaimMethod(body.settings);
  await env.DB.prepare(
    'INSERT INTO users (device_id, created_at, last_sync) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync = ?'
  ).bind(accountId, now, now, now).run();

  for (const row of body.workLogs ?? []) {
    const updatedAt = getRowUpdatedAt(row, now);
    await env.DB.prepare(
      'INSERT INTO work_logs (id, device_id, date, platform, hours, earnings, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, platform=excluded.platform, hours=excluded.hours, earnings=excluded.earnings, notes=excluded.notes, updated_at=excluded.updated_at WHERE work_logs.updated_at IS NULL OR excluded.updated_at >= work_logs.updated_at'
    ).bind(row.id, accountId, row.date, row.platform ?? null, row.hours ?? null, row.earnings ?? null, row.notes ?? null, updatedAt).run();
  }

  for (const row of body.mileageLogs ?? []) {
    const updatedAt = getRowUpdatedAt(row, now);
    await env.DB.prepare(
      'INSERT INTO mileage_logs (id, device_id, date, description, miles, trip_type, linked_work_id, resolved_from_evidence, last_resolved_at, user_override, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, description=excluded.description, miles=excluded.miles, trip_type=excluded.trip_type, linked_work_id=excluded.linked_work_id, resolved_from_evidence=excluded.resolved_from_evidence, last_resolved_at=excluded.last_resolved_at, user_override=excluded.user_override, updated_at=excluded.updated_at WHERE mileage_logs.updated_at IS NULL OR excluded.updated_at >= mileage_logs.updated_at'
    ).bind(row.id, accountId, row.date, row.description ?? null, row.miles ?? null, row.tripType ?? null, row.linkedWorkId ?? null, asResolvedFromEvidence(row.resolvedFromEvidence ?? row.resolved_from_evidence), asStringOrNull(row.lastResolvedAt ?? row.last_resolved_at), asFlag(row.userOverride ?? row.user_override), updatedAt).run();
  }

  for (const row of body.expenses ?? []) {
    const updatedAt = getRowUpdatedAt(row, now);
    const taxClassification = classifyExpenseRow(row, claimMethod);
    await env.DB.prepare(
      'INSERT INTO expenses (id, device_id, date, category, description, amount, tax_deductible, has_image, scope, business_use_percent, deductible_amount, non_deductible_amount, vehicle_expense_type, tax_treatment, linked_shift_id, source_type, review_status, resolved_from_evidence, last_resolved_at, user_override, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, category=excluded.category, description=excluded.description, amount=excluded.amount, tax_deductible=excluded.tax_deductible, has_image=excluded.has_image, scope=excluded.scope, business_use_percent=excluded.business_use_percent, deductible_amount=excluded.deductible_amount, non_deductible_amount=excluded.non_deductible_amount, vehicle_expense_type=excluded.vehicle_expense_type, tax_treatment=excluded.tax_treatment, linked_shift_id=excluded.linked_shift_id, source_type=excluded.source_type, review_status=excluded.review_status, resolved_from_evidence=excluded.resolved_from_evidence, last_resolved_at=excluded.last_resolved_at, user_override=excluded.user_override, updated_at=excluded.updated_at WHERE expenses.updated_at IS NULL OR excluded.updated_at >= expenses.updated_at'
    ).bind(
      row.id,
      accountId,
      row.date,
      row.category ?? null,
      row.description ?? null,
      row.amount ?? null,
      asFlag(row.taxDeductible, true),
      asFlag(row.hasImage),
      taxClassification.scope,
      taxClassification.businessUsePercent,
      taxClassification.deductibleAmount,
      taxClassification.nonDeductibleAmount,
      taxClassification.vehicleExpenseType,
      taxClassification.taxTreatment,
      asStringOrNull(row.linkedShiftId),
      asStringOrNull(row.sourceType) ?? 'manual',
      asStringOrNull(row.reviewStatus) ?? 'confirmed',
      asResolvedFromEvidence(row.resolvedFromEvidence ?? row.resolved_from_evidence),
      asStringOrNull(row.lastResolvedAt ?? row.last_resolved_at),
      asFlag(row.userOverride ?? row.user_override),
      updatedAt
    ).run();
  }

  const upsertedShiftIds = new Set<string>();

  for (const row of body.shifts ?? []) {
    const shiftId = asRequiredId(row.id);
    if (!shiftId) continue;

    const updatedAt = getRowUpdatedAt(row, now);
    if (await isStaleShift(env, accountId, shiftId, updatedAt)) continue;

    upsertedShiftIds.add(shiftId);

    await env.DB.prepare(
      'INSERT INTO shifts (id, account_id, date, status, primary_platform, hours_worked, total_earnings, started_at, ended_at, start_odometer, end_odometer, business_miles, personal_gap_miles, gps_miles, mileage_source, start_lat, start_lng, end_lat, end_lng, fuel_liters, job_count, notes, resolved_from_evidence, last_resolved_at, user_override, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM shifts WHERE id = ? AND account_id = ?), datetime(\'now\')), ?) ON CONFLICT(id, account_id) DO UPDATE SET date=excluded.date, status=excluded.status, primary_platform=excluded.primary_platform, hours_worked=excluded.hours_worked, total_earnings=excluded.total_earnings, started_at=excluded.started_at, ended_at=excluded.ended_at, start_odometer=excluded.start_odometer, end_odometer=excluded.end_odometer, business_miles=excluded.business_miles, personal_gap_miles=excluded.personal_gap_miles, gps_miles=excluded.gps_miles, mileage_source=excluded.mileage_source, start_lat=excluded.start_lat, start_lng=excluded.start_lng, end_lat=excluded.end_lat, end_lng=excluded.end_lng, fuel_liters=excluded.fuel_liters, job_count=excluded.job_count, notes=excluded.notes, resolved_from_evidence=excluded.resolved_from_evidence, last_resolved_at=excluded.last_resolved_at, user_override=excluded.user_override, updated_at=excluded.updated_at'
    ).bind(
      shiftId,
      accountId,
      row.date,
      asStringOrNull(row.status) ?? 'completed',
      asStringOrNull(row.primary_platform),
      row.hours_worked ?? null,
      row.total_earnings ?? 0,
      asStringOrNull(row.started_at),
      asStringOrNull(row.ended_at),
      row.start_odometer ?? null,
      row.end_odometer ?? null,
      row.business_miles ?? null,
      row.personal_gap_miles ?? null,
      row.gps_miles ?? null,
      asStringOrNull(row.mileage_source),
      row.start_lat ?? null,
      row.start_lng ?? null,
      row.end_lat ?? null,
      row.end_lng ?? null,
      row.fuel_liters ?? null,
      row.job_count ?? null,
      asStringOrNull(row.notes),
      asResolvedFromEvidence(row.resolvedFromEvidence ?? row.resolved_from_evidence),
      asStringOrNull(row.lastResolvedAt ?? row.last_resolved_at),
      asFlag(row.userOverride ?? row.user_override),
      shiftId,
      accountId,
      updatedAt
    ).run();
  }

  const shiftEarningsByShiftId = new Map<string, Array<Record<string, unknown>>>();

  for (const row of body.shiftEarnings ?? []) {
    const shiftId = asRequiredId(row.shift_id);
    if (!shiftId) continue;

    const existing = shiftEarningsByShiftId.get(shiftId) ?? [];
    existing.push(row);
    shiftEarningsByShiftId.set(shiftId, existing);
  }

  for (const shiftId of upsertedShiftIds) {
    await env.DB.prepare('DELETE FROM shift_earnings WHERE shift_id = ? AND account_id = ?').bind(shiftId, accountId).run();

    for (const row of shiftEarningsByShiftId.get(shiftId) ?? []) {
      await env.DB.prepare(
        'INSERT INTO shift_earnings (id, shift_id, account_id, platform, amount, job_count) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id, account_id) DO UPDATE SET shift_id=excluded.shift_id, platform=excluded.platform, amount=excluded.amount, job_count=excluded.job_count'
      ).bind(
        row.id,
        shiftId,
        accountId,
        asStringOrNull(row.platform) ?? 'other',
        row.amount ?? 0,
        row.job_count ?? null
      ).run();
    }
  }

  if (body.settings !== undefined) {
    const updatedAt = getSettingsUpdatedAt(body.settings, now);
    await env.DB.prepare(
      'INSERT INTO settings (device_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE settings.updated_at IS NULL OR excluded.updated_at >= settings.updated_at'
    ).bind(accountId, JSON.stringify(body.settings), updatedAt).run();
  }

  // Process evidence records
  const evidence = body.evidence;
  if (evidence) {
    for (const row of evidence.shifts ?? []) {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO shift_evidence (id, account_id, date, source_type, source_detail, confidence, platform, hours_worked, earnings, started_at, ended_at, start_odometer, end_odometer, business_miles, fuel_liters, job_count, notes, provider_splits, raw_payload, created_at, resolved_to_ledger_id, dispute_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        asRequiredId(row.id),
        accountId,
        row.date ?? null,
        asStringOrNull(row.source_type) ?? 'manual',
        asStringOrNull(row.source_detail) ?? '',
        asNumberOrNull(row.confidence) ?? 0.5,
        asStringOrNull(row.platform),
        asNumberOrNull(row.hours_worked),
        asNumberOrNull(row.earnings),
        asStringOrNull(row.started_at),
        asStringOrNull(row.ended_at),
        asNumberOrNull(row.start_odometer),
        asNumberOrNull(row.end_odometer),
        asNumberOrNull(row.business_miles),
        asNumberOrNull(row.fuel_liters),
        asNumberOrNull(row.job_count),
        asStringOrNull(row.notes),
        asStringOrNull(row.provider_splits),
        asStringOrNull(row.raw_payload),
        asStringOrNull(row.created_at) ?? new Date(now).toISOString(),
        asStringOrNull(row.resolved_to_ledger_id),
        asStringOrNull(row.dispute_status)
      ).run();
    }

    for (const row of evidence.expenses ?? []) {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO expense_evidence (id, account_id, date, source_type, source_detail, confidence, category, amount, description, receipt_id, scope, business_use_percent, vehicle_expense_type, tax_treatment, linked_shift_id, raw_payload, created_at, resolved_to_ledger_id, dispute_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        asRequiredId(row.id),
        accountId,
        row.date ?? null,
        asStringOrNull(row.source_type) ?? 'manual',
        asStringOrNull(row.source_detail) ?? '',
        asNumberOrNull(row.confidence) ?? 0.5,
        asStringOrNull(row.category),
        asNumberOrNull(row.amount),
        asStringOrNull(row.description),
        asStringOrNull(row.receipt_id),
        asStringOrNull(row.scope),
        asNumberOrNull(row.business_use_percent),
        asStringOrNull(row.vehicle_expense_type),
        asStringOrNull(row.tax_treatment),
        asStringOrNull(row.linked_shift_id),
        asStringOrNull(row.raw_payload),
        asStringOrNull(row.created_at) ?? new Date(now).toISOString(),
        asStringOrNull(row.resolved_to_ledger_id),
        asStringOrNull(row.dispute_status)
      ).run();
    }

    for (const row of evidence.mileage ?? []) {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO mileage_evidence (id, account_id, date, source_type, source_detail, confidence, start_location, end_location, start_odometer, end_odometer, total_miles, purpose, path, notes, linked_shift_id, raw_payload, created_at, resolved_to_ledger_id, dispute_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        asRequiredId(row.id),
        accountId,
        row.date ?? null,
        asStringOrNull(row.source_type) ?? 'manual',
        asStringOrNull(row.source_detail) ?? '',
        asNumberOrNull(row.confidence) ?? 0.5,
        asStringOrNull(row.start_location),
        asStringOrNull(row.end_location),
        asNumberOrNull(row.start_odometer),
        asNumberOrNull(row.end_odometer),
        asNumberOrNull(row.total_miles),
        asStringOrNull(row.purpose),
        asStringOrNull(row.path),
        asStringOrNull(row.notes),
        asStringOrNull(row.linked_shift_id),
        asStringOrNull(row.raw_payload),
        asStringOrNull(row.created_at) ?? new Date(now).toISOString(),
        asStringOrNull(row.resolved_to_ledger_id),
        asStringOrNull(row.dispute_status)
      ).run();
    }
  }

  const { deletedIds } = body;
  if (deletedIds) {
    const entityTypeMap: Record<keyof DeletedIds, string> = {
      workLogs: 'work_log',
      mileageLogs: 'mileage_log',
      expenses: 'expense',
      shifts: 'shift',
    };

    for (const [key, ids] of Object.entries(deletedIds) as [keyof DeletedIds, string[] | undefined][]) {
      if (!ids?.length) continue;

      const entityType = entityTypeMap[key];
      await Promise.all(
        ids.map((id) =>
          env.DB.prepare(
            `INSERT INTO tombstones (id, account_id, entity_type, deleted_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id, account_id, entity_type) DO NOTHING`
          ).bind(id, accountId, entityType, now).run()
        )
      );
    }
  }

  return jsonOk(request, { ok: true, serverTime: now, synced_at: now }, 200, env);
}

export async function handleSyncPull(request: Request, env: Env): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'sync', env.DB, 60);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  let since: string | null = null;

  if (request.method === 'POST') {
    const body = await readJson<{ since?: unknown }>(request);
    if (!body) return jsonErr(request, 'invalid json', 400, env);
    since = asStringOrNull(body.since);
  }

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  const evidenceQueries: Promise<D1Result<Record<string, unknown>>>[] = [];

  if (since) {
    evidenceQueries.push(
      env.DB.prepare('SELECT * FROM shift_evidence WHERE account_id = ? AND created_at >= ? ORDER BY created_at ASC').bind(accountId, since).all() as Promise<D1Result<Record<string, unknown>>>,
      env.DB.prepare('SELECT * FROM expense_evidence WHERE account_id = ? AND created_at >= ? ORDER BY created_at ASC').bind(accountId, since).all() as Promise<D1Result<Record<string, unknown>>>,
      env.DB.prepare('SELECT * FROM mileage_evidence WHERE account_id = ? AND created_at >= ? ORDER BY created_at ASC').bind(accountId, since).all() as Promise<D1Result<Record<string, unknown>>>
    );
  } else {
    evidenceQueries.push(
      env.DB.prepare('SELECT * FROM shift_evidence WHERE account_id = ? ORDER BY created_at ASC').bind(accountId).all() as Promise<D1Result<Record<string, unknown>>>,
      env.DB.prepare('SELECT * FROM expense_evidence WHERE account_id = ? ORDER BY created_at ASC').bind(accountId).all() as Promise<D1Result<Record<string, unknown>>>,
      env.DB.prepare('SELECT * FROM mileage_evidence WHERE account_id = ? ORDER BY created_at ASC').bind(accountId).all() as Promise<D1Result<Record<string, unknown>>>
    );
  }

  const [workLogs, mileageLogs, expenses, shifts, shiftEarnings, settings, tombstonesResult, shiftEvidence, expenseEvidence, mileageEvidence] = await Promise.all([
    env.DB.prepare('SELECT * FROM work_logs WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM mileage_logs WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM expenses WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM shifts WHERE account_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM shift_earnings WHERE account_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT data FROM settings WHERE device_id = ?').bind(accountId).first(),
    env.DB.prepare('SELECT id, entity_type FROM tombstones WHERE account_id = ?').bind(accountId).all(),
    ...evidenceQueries,
  ]);

  const tombstones = (tombstonesResult.results ?? []) as Array<{ id: string; entity_type: string }>;
  const deletedIds = {
    workLogs: tombstones.filter((tombstone) => tombstone.entity_type === 'work_log').map((tombstone) => tombstone.id),
    mileageLogs: tombstones
      .filter((tombstone) => tombstone.entity_type === 'mileage_log')
      .map((tombstone) => tombstone.id),
    expenses: tombstones.filter((tombstone) => tombstone.entity_type === 'expense').map((tombstone) => tombstone.id),
    shifts: tombstones.filter((tombstone) => tombstone.entity_type === 'shift').map((tombstone) => tombstone.id),
  };

  return jsonOk(request, {
    workLogs: workLogs.results ?? [],
    mileageLogs: mileageLogs.results ?? [],
    expenses: expenses.results ?? [],
    shifts: shifts.results ?? [],
    shiftEarnings: shiftEarnings.results ?? [],
    deletedIds,
    settings: settings?.data ? JSON.parse(String(settings.data)) : null,
    evidence: {
      shifts: (shiftEvidence as D1Result<Record<string, unknown>>).results ?? [],
      expenses: (expenseEvidence as D1Result<Record<string, unknown>>).results ?? [],
      mileage: (mileageEvidence as D1Result<Record<string, unknown>>).results ?? [],
    },
    serverTime: Date.now(),
  }, 200, env);
}

export async function handleSyncDeleteAccount(request: Request, env: Env): Promise<Response> {
  const { limited } = await checkRateLimit(request, 'sync', env.DB, 60);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  if (request.headers.get('Content-Type')?.includes('application/json')) {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return jsonErr(request, 'invalid json', 400, env);
  }

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  await Promise.all([
    env.DB.prepare('DELETE FROM work_logs WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM mileage_logs WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM expenses WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM shift_evidence WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM expense_evidence WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM mileage_evidence WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM device_secrets WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM account_devices WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM plaid_connections WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM plaid_transactions WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM tombstones WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM shift_earnings WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM shifts WHERE account_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM settings WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM users WHERE device_id = ?').bind(accountId).run(),
  ]);

  if (env.RECEIPTS) {
    const receipts = env.RECEIPTS as ReceiptBucket;
    const prefix = `receipts/${accountId}/`;
    let cursor: string | undefined;

    do {
      const listed = await receipts.list({ prefix, cursor });
      if (listed.objects.length > 0) {
        await Promise.all(listed.objects.map((obj) => receipts.delete(obj.key)));
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  return jsonOk(request, { ok: true, deleted: true }, 200, env);
}
