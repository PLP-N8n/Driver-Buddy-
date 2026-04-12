import { jsonErr, jsonOk } from '../lib/json';
import { getAuthenticatedAccountId } from '../lib/auth';

export interface Env {
  DB: D1Database;
  RECEIPT_SECRET: string;
}

type SyncPayload = {
  workLogs?: Array<Record<string, unknown>>;
  mileageLogs?: Array<Record<string, unknown>>;
  expenses?: Array<Record<string, unknown>>;
  settings?: unknown;
};

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export async function handleSyncPush(request: Request, env: Env): Promise<Response> {
  const body = await readJson<SyncPayload>(request);
  if (!body) return jsonErr(request, 'invalid json');

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401);

  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO users (device_id, created_at, last_sync) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync = ?'
  ).bind(accountId, now, now, now).run();

  for (const row of body.workLogs ?? []) {
    await env.DB.prepare(
      'INSERT INTO work_logs (id, device_id, date, platform, hours, earnings, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, platform=excluded.platform, hours=excluded.hours, earnings=excluded.earnings, notes=excluded.notes, updated_at=excluded.updated_at'
    ).bind(row.id, accountId, row.date, row.platform ?? null, row.hours ?? null, row.earnings ?? null, row.notes ?? null, now).run();
  }

  for (const row of body.mileageLogs ?? []) {
    await env.DB.prepare(
      'INSERT INTO mileage_logs (id, device_id, date, description, miles, trip_type, linked_work_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, description=excluded.description, miles=excluded.miles, trip_type=excluded.trip_type, linked_work_id=excluded.linked_work_id, updated_at=excluded.updated_at'
    ).bind(row.id, accountId, row.date, row.description ?? null, row.miles ?? null, row.tripType ?? null, row.linkedWorkId ?? null, now).run();
  }

  for (const row of body.expenses ?? []) {
    await env.DB.prepare(
      'INSERT INTO expenses (id, device_id, date, category, description, amount, tax_deductible, has_image, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, device_id) DO UPDATE SET date=excluded.date, category=excluded.category, description=excluded.description, amount=excluded.amount, tax_deductible=excluded.tax_deductible, has_image=excluded.has_image, updated_at=excluded.updated_at'
    ).bind(row.id, accountId, row.date, row.category ?? null, row.description ?? null, row.amount ?? null, row.taxDeductible ? 1 : 0, row.hasImage ? 1 : 0, now).run();
  }

  if (body.settings !== undefined) {
    await env.DB.prepare(
      'INSERT INTO settings (device_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at'
    ).bind(accountId, JSON.stringify(body.settings), now).run();
  }

  return jsonOk(request, { ok: true, serverTime: now, synced_at: now });
}

export async function handleSyncPull(request: Request, env: Env): Promise<Response> {
  if (request.method === 'POST') {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return jsonErr(request, 'invalid json');
  }

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401);

  const [workLogs, mileageLogs, expenses, settings] = await Promise.all([
    env.DB.prepare('SELECT * FROM work_logs WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM mileage_logs WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT * FROM expenses WHERE device_id = ?').bind(accountId).all(),
    env.DB.prepare('SELECT data FROM settings WHERE device_id = ?').bind(accountId).first(),
  ]);

  return jsonOk(request, {
    workLogs: workLogs.results ?? [],
    mileageLogs: mileageLogs.results ?? [],
    expenses: expenses.results ?? [],
    settings: settings?.data ? JSON.parse(String(settings.data)) : null,
    serverTime: Date.now(),
  });
}

export async function handleSyncDeleteAccount(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Content-Type')?.includes('application/json')) {
    const body = await readJson<Record<string, unknown>>(request);
    if (!body) return jsonErr(request, 'invalid json');
  }

  const accountId = await getAuthenticatedAccountId(request, env);
  if (!accountId) return jsonErr(request, 'unauthorized', 401);

  await Promise.all([
    env.DB.prepare('DELETE FROM work_logs WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM mileage_logs WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM expenses WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM settings WHERE device_id = ?').bind(accountId).run(),
    env.DB.prepare('DELETE FROM users WHERE device_id = ?').bind(accountId).run(),
  ]);

  return jsonOk(request, { ok: true, deleted: true });
}
