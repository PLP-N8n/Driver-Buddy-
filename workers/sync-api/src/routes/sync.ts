import { jsonErr, jsonOk } from '../lib/json';
import { getAuthenticatedAccountId } from '../lib/auth';
import { checkRateLimit } from '../lib/rateLimit';

export interface Env {
  DB: D1Database;
  RECEIPT_SECRET: string;
  RECEIPTS?: R2Bucket;
  EXTRA_ALLOWED_ORIGINS?: string;
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
};

type DeletedIds = {
  workLogs?: string[];
  mileageLogs?: string[];
  expenses?: string[];
  shifts?: string[];
};

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

  const body = await readJson<SyncPayload>(request);
  if (!body) return jsonErr(request, 'invalid json', 400, env);

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  const now = Date.now();
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
      'INSERT INTO mileage_logs (id, device_id, date, description, miles, trip_type, linked_work_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, description=excluded.description, miles=excluded.miles, trip_type=excluded.trip_type, linked_work_id=excluded.linked_work_id, updated_at=excluded.updated_at WHERE mileage_logs.updated_at IS NULL OR excluded.updated_at >= mileage_logs.updated_at'
    ).bind(row.id, accountId, row.date, row.description ?? null, row.miles ?? null, row.tripType ?? null, row.linkedWorkId ?? null, updatedAt).run();
  }

  for (const row of body.expenses ?? []) {
    const updatedAt = getRowUpdatedAt(row, now);
    await env.DB.prepare(
      'INSERT INTO expenses (id, device_id, date, category, description, amount, tax_deductible, has_image, scope, business_use_percent, deductible_amount, non_deductible_amount, vehicle_expense_type, tax_treatment, linked_shift_id, source_type, review_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, category=excluded.category, description=excluded.description, amount=excluded.amount, tax_deductible=excluded.tax_deductible, has_image=excluded.has_image, scope=excluded.scope, business_use_percent=excluded.business_use_percent, deductible_amount=excluded.deductible_amount, non_deductible_amount=excluded.non_deductible_amount, vehicle_expense_type=excluded.vehicle_expense_type, tax_treatment=excluded.tax_treatment, linked_shift_id=excluded.linked_shift_id, source_type=excluded.source_type, review_status=excluded.review_status, updated_at=excluded.updated_at WHERE expenses.updated_at IS NULL OR excluded.updated_at >= expenses.updated_at'
    ).bind(
      row.id,
      accountId,
      row.date,
      row.category ?? null,
      row.description ?? null,
      row.amount ?? null,
      asFlag(row.taxDeductible, true),
      asFlag(row.hasImage),
      asStringOrNull(row.scope) ?? 'business',
      row.businessUsePercent ?? 100,
      row.deductibleAmount ?? 0,
      row.nonDeductibleAmount ?? 0,
      asStringOrNull(row.vehicleExpenseType) ?? 'non_vehicle',
      asStringOrNull(row.taxTreatment) ?? 'deductible',
      asStringOrNull(row.linkedShiftId),
      asStringOrNull(row.sourceType) ?? 'manual',
      asStringOrNull(row.reviewStatus) ?? 'confirmed',
      updatedAt
    ).run();
  }

  const shiftIds = new Set<string>();

  for (const row of body.shifts ?? []) {
    const shiftId = asRequiredId(row.id);
    if (!shiftId) continue;

    const updatedAt = getRowUpdatedAt(row, now);
    if (await isStaleShift(env, accountId, shiftId, updatedAt)) continue;

    shiftIds.add(shiftId);

    await env.DB.prepare(
      'INSERT INTO shifts (id, account_id, date, status, primary_platform, hours_worked, total_earnings, started_at, ended_at, start_odometer, end_odometer, business_miles, personal_gap_miles, gps_miles, mileage_source, start_lat, start_lng, end_lat, end_lng, fuel_liters, job_count, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM shifts WHERE id = ? AND account_id = ?), datetime(\'now\')), ?) ON CONFLICT(id, account_id) DO UPDATE SET date=excluded.date, status=excluded.status, primary_platform=excluded.primary_platform, hours_worked=excluded.hours_worked, total_earnings=excluded.total_earnings, started_at=excluded.started_at, ended_at=excluded.ended_at, start_odometer=excluded.start_odometer, end_odometer=excluded.end_odometer, business_miles=excluded.business_miles, personal_gap_miles=excluded.personal_gap_miles, gps_miles=excluded.gps_miles, mileage_source=excluded.mileage_source, start_lat=excluded.start_lat, start_lng=excluded.start_lng, end_lat=excluded.end_lat, end_lng=excluded.end_lng, fuel_liters=excluded.fuel_liters, job_count=excluded.job_count, notes=excluded.notes, updated_at=excluded.updated_at'
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

  for (const shiftId of shiftIds) {
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

  if (request.method === 'POST') {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return jsonErr(request, 'invalid json', 400, env);
  }

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401, env);

  const [workLogs, mileageLogs, expenses, shifts, shiftEarnings, settings, tombstonesResult] = await Promise.all([
    env.DB.prepare('SELECT * FROM work_logs WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM mileage_logs WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM expenses WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM shifts WHERE account_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM shift_earnings WHERE account_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT data FROM settings WHERE device_id = ?').bind(accountId).first(),
    env.DB.prepare('SELECT id, entity_type FROM tombstones WHERE account_id = ?').bind(accountId).all(),
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
