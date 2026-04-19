# Tasks: Sync Reliability

> **For Codex:** Execute tasks in strict order. Mark each sub-task `[x]` as you complete it. Run the verification command before moving to the next task. Commit after every numbered task. Do NOT modify design.md or requirements.md.
>
> **CRITICAL:** Tasks 1–8 are Worker-side. Apply D1 migrations and deploy the Worker BEFORE starting Task 9 (client-side changes). The live app has 64 real devices — the Worker must be backward-compatible with old clients.

---

## Phase 1: D1 Migrations

### Task 1: Create 0000_baseline.sql

**File to create:** `workers/sync-api/migrations/0000_baseline.sql`

- [x] 1.1 Read `workers/sync-api/src/routes/sync.ts` to confirm the exact column names used in push handler INSERT statements for `users`, `work_logs`, `mileage_logs`, `expenses`, `settings`.

- [x] 1.2 Create `workers/sync-api/migrations/0000_baseline.sql`:

```sql
-- Baseline schema for core sync tables.
-- Uses CREATE TABLE IF NOT EXISTS — safe to apply to existing databases.

CREATE TABLE IF NOT EXISTS users (
  device_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_sync INTEGER
);

CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  platform TEXT,
  hours REAL,
  earnings REAL,
  notes TEXT,
  updated_at INTEGER,
  PRIMARY KEY (id, device_id)
);

CREATE TABLE IF NOT EXISTS mileage_logs (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  miles REAL,
  trip_type TEXT,
  linked_work_id TEXT,
  updated_at INTEGER,
  PRIMARY KEY (id, device_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT,
  description TEXT,
  amount REAL,
  tax_deductible INTEGER DEFAULT 1,
  has_image INTEGER DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (id, device_id)
);

CREATE TABLE IF NOT EXISTS settings (
  device_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER
);
```

Note: HMRC expense columns (scope, business_use_percent, etc.) are NOT included here — they are added by migration 0004.

- [x] 1.3 Commit:
```bash
git add workers/sync-api/migrations/0000_baseline.sql
git commit -m "feat: add baseline D1 migration for core sync tables"
```

---

### Task 2: Create 0005_shifts_account_uniqueness.sql

**File to create:** `workers/sync-api/migrations/0005_shifts_account_uniqueness.sql`

- [x] 2.1 Read `workers/sync-api/migrations/0004_entity_model_refactor.sql` to confirm the exact column list for `shifts` and `shift_earnings`.

- [x] 2.2 Create `workers/sync-api/migrations/0005_shifts_account_uniqueness.sql` using the table-copy pattern (D1 does not support DROP CONSTRAINT):

```sql
-- Recreate shifts with composite PRIMARY KEY (id, account_id).
-- Adds updated_at column.

CREATE TABLE IF NOT EXISTS shifts_new (
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  primary_platform TEXT,
  hours_worked REAL,
  total_earnings REAL NOT NULL DEFAULT 0,
  started_at TEXT,
  ended_at TEXT,
  start_odometer REAL,
  end_odometer REAL,
  business_miles REAL,
  personal_gap_miles REAL,
  gps_miles REAL,
  mileage_source TEXT,
  start_lat REAL,
  start_lng REAL,
  end_lat REAL,
  end_lng REAL,
  fuel_liters REAL,
  job_count INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  PRIMARY KEY (id, account_id)
);

INSERT OR IGNORE INTO shifts_new
  SELECT id, account_id, date, status, primary_platform, hours_worked, total_earnings,
         started_at, ended_at, start_odometer, end_odometer, business_miles, personal_gap_miles,
         gps_miles, mileage_source, start_lat, start_lng, end_lat, end_lng, fuel_liters,
         job_count, notes, created_at, NULL
  FROM shifts;

DROP TABLE shifts;
ALTER TABLE shifts_new RENAME TO shifts;

-- Recreate shift_earnings with composite PRIMARY KEY (id, account_id).

CREATE TABLE IF NOT EXISTS shift_earnings_new (
  id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  amount REAL NOT NULL,
  job_count INTEGER,
  PRIMARY KEY (id, account_id)
);

INSERT OR IGNORE INTO shift_earnings_new SELECT * FROM shift_earnings;
DROP TABLE shift_earnings;
ALTER TABLE shift_earnings_new RENAME TO shift_earnings;
```

- [x] 2.3 Commit:
```bash
git add workers/sync-api/migrations/0005_shifts_account_uniqueness.sql
git commit -m "feat: add composite PK migration for shifts and shift_earnings"
```

---

### Task 3: Create 0006_tombstones.sql

**File to create:** `workers/sync-api/migrations/0006_tombstones.sql`

- [x] 3.1 Create `workers/sync-api/migrations/0006_tombstones.sql`:

```sql
-- Tombstones table for tracking deleted records across devices.
-- entity_type values: 'work_log', 'mileage_log', 'expense', 'shift'

CREATE TABLE IF NOT EXISTS tombstones (
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (id, account_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_tombstones_account ON tombstones(account_id);
```

- [x] 3.2 Commit:
```bash
git add workers/sync-api/migrations/0006_tombstones.sql
git commit -m "feat: add tombstones D1 migration"
```

---

## Phase 2: Worker Changes

### Task 4: Update checkRateLimit to accept maxAttempts

**File to modify:** `workers/sync-api/src/lib/rateLimit.ts`

- [x] 4.1 Read `workers/sync-api/src/lib/rateLimit.ts` in full.

- [x] 4.2 Add `maxAttempts = 10` as a fourth parameter to `checkRateLimit`. Replace the hardcoded `MAX_ATTEMPTS` comparison with the parameter:

```ts
export async function checkRateLimit(
  request: Request,
  endpoint: string,
  db: D1Database,
  maxAttempts = 10
): Promise<{ limited: boolean }> {
  // ... existing logic, replacing MAX_ATTEMPTS with maxAttempts
}
```

- [x] 4.3 Verify existing callers in `workers/sync-api/src/routes/auth.ts` still compile (they don't pass `maxAttempts`, so the default applies).

- [x] 4.4 Commit:
```bash
git add workers/sync-api/src/lib/rateLimit.ts
git commit -m "refactor: add maxAttempts param to checkRateLimit"
```

---

### Task 5: Apply rate limiting to sync and other routes

**Files to modify:** `workers/sync-api/src/routes/sync.ts`, `workers/sync-api/src/routes/feedback.ts`, `workers/sync-api/src/routes/receipts.ts`

- [x] 5.1 Read `workers/sync-api/src/routes/sync.ts`, `workers/sync-api/src/routes/feedback.ts`, and `workers/sync-api/src/routes/receipts.ts` in full.

- [x] 5.2 In `sync.ts`, add `import { checkRateLimit } from '../lib/rateLimit';` if not already imported. At the TOP of `handleSyncPush`, `handleSyncPull`, and `handleSyncDeleteAccount` (before the auth check), add:
```ts
const { limited } = await checkRateLimit(request, 'sync', env.DB, 60);
if (limited) return new Response(JSON.stringify({ error: 'too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
```

- [x] 5.3 In `feedback.ts`, add rate limit check (10 req/min default) at the top of the handler. Ensure `env.DB` is accessible (add `DB: D1Database` to the `Env` interface in feedback.ts if needed).

- [x] 5.4 In `receipts.ts`:
  - Add `DB: D1Database` to the `Env` interface
  - Add rate limit check (10 req/min) to `handleRequestUpload`, `handleGetReceipt`, `handleDeleteReceipt`, and `handleMigrateLegacy`

- [x] 5.5 Commit:
```bash
git add workers/sync-api/src/routes/sync.ts workers/sync-api/src/routes/feedback.ts workers/sync-api/src/routes/receipts.ts
git commit -m "feat: apply rate limiting to sync, receipts, and feedback routes"
```

---

### Task 6: Update Worker push handler — composite PK upserts + tombstones

**File to modify:** `workers/sync-api/src/routes/sync.ts`

- [x] 6.1 Read `workers/sync-api/src/routes/sync.ts` in full, focusing on the shifts upsert SQL (~lines 90–124) and the shift_earnings upsert (~lines 126–152).

- [x] 6.2 Update the shifts INSERT SQL to use `ON CONFLICT(id, account_id)` and remove `account_id` from the SET clause (it is part of the PK and cannot be updated):

The SET clause should update all mutable fields but NOT `id`, `account_id`, or `created_at`.

- [x] 6.3 Update the shift_earnings INSERT SQL similarly: `ON CONFLICT(id, account_id)` and remove `account_id` from the SET clause.

- [x] 6.4 Extend the Worker-side `SyncPayload` type (or the inline destructuring) to include optional `deletedIds`:
```ts
type DeletedIds = {
  workLogs?: string[];
  mileageLogs?: string[];
  expenses?: string[];
  shifts?: string[];
};
```

- [x] 6.5 After the existing upserts in `handleSyncPush`, add tombstone recording:
```ts
const { deletedIds } = body;
if (deletedIds) {
  const now = Date.now();
  const entityTypeMap: Record<keyof typeof deletedIds, string> = {
    workLogs: 'work_log',
    mileageLogs: 'mileage_log',
    expenses: 'expense',
    shifts: 'shift',
  };
  for (const [key, ids] of Object.entries(deletedIds) as [keyof typeof deletedIds, string[]][]) {
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
```

- [x] 6.6 Commit:
```bash
git add workers/sync-api/src/routes/sync.ts
git commit -m "feat: update shifts upsert to composite PK and record tombstones on push"
```

---

### Task 7: Update Worker pull handler to return tombstones

**File to modify:** `workers/sync-api/src/routes/sync.ts`

- [x] 7.1 Locate `handleSyncPull` in `sync.ts`. Find the `Promise.all` block that fetches `work_logs`, `mileage_logs`, `expenses`, `shifts`, `shift_earnings`, `settings`.

- [x] 7.2 Add a tombstones query to the `Promise.all`:
```ts
env.DB.prepare(`SELECT id, entity_type FROM tombstones WHERE account_id = ?`).bind(accountId).all()
```

- [x] 7.3 Transform the tombstones result into the `deletedIds` response shape:
```ts
const tombstones = tombstonesResult.results ?? [];
const deletedIds = {
  workLogs: tombstones.filter((t) => t.entity_type === 'work_log').map((t) => t.id as string),
  mileageLogs: tombstones.filter((t) => t.entity_type === 'mileage_log').map((t) => t.id as string),
  expenses: tombstones.filter((t) => t.entity_type === 'expense').map((t) => t.id as string),
  shifts: tombstones.filter((t) => t.entity_type === 'shift').map((t) => t.id as string),
};
```

- [x] 7.4 Include `deletedIds` in the JSON response alongside `workLogs`, `mileageLogs`, etc.

- [x] 7.5 Commit:
```bash
git add workers/sync-api/src/routes/sync.ts
git commit -m "feat: include tombstones in sync pull response"
```

---

### Task 8: Apply D1 migrations and deploy Worker

> BLOCKED 2026-04-19: `npx wrangler whoami` failed with `spawn EPERM` in `workers/sync-api`. Per spec instruction 9, stop here and have Gayatri handle the Wrangler migration/deploy steps.

- [x] 8.1 Apply all pending migrations to production D1:
```bash
cd workers/sync-api
npx wrangler d1 migrations apply drivertax-sync --remote
```
Expected: migrations 0000, 0005, 0006 applied (0001–0004 already applied).

- [x] 8.2 Deploy the updated Worker:
```bash
npx wrangler deploy
```
Expected: deploy succeeds.

- [ ] 8.3 Smoke test: open the live app on a device, trigger a sync, confirm it still works (no errors in Sentry, sync status returns to idle).

---

## Phase 3: Client-side Changes

### Task 9: Extend SyncPullPayload and add updatedAt to entity types

**File to modify:** `types.ts`

- [x] 9.1 Read `types.ts` in full, focusing on `Trip`, `DailyWorkLog`, `Expense`, and `SyncPullPayload`.

- [x] 9.2 Add `updatedAt?: string` to `Trip`, `DailyWorkLog`, and `Expense` interfaces.

- [x] 9.3 Extend `SyncPullPayload` with:
```ts
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
```

- [x] 9.4 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```

- [x] 9.5 Commit:
```bash
git add types.ts
git commit -m "feat: add updatedAt to entity types and extend SyncPullPayload"
```

---

### Task 10: Map updated_at in applyPulled* functions

**File to modify:** `services/syncTransforms.ts`

- [x] 10.1 Read `services/syncTransforms.ts` in full.

- [x] 10.2 In `applyPulledWorkLogs`: when constructing the `DailyWorkLog` object from the DB row, add `updatedAt: row.updated_at ?? undefined`.

- [x] 10.3 In `applyPulledTrips`: when constructing the `Trip` object, add `updatedAt: row.updated_at ?? undefined`.

- [x] 10.4 In `applyPulledExpenses`: when constructing the `Expense` object, add `updatedAt: row.updated_at ?? undefined`.

- [x] 10.5 In `applyPulledShiftWorkLogs`: when constructing each `DailyWorkLog` from a shift row, add `updatedAt: shiftRow.updated_at ?? undefined`.

- [x] 10.6 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```

- [x] 10.7 Commit:
```bash
git add services/syncTransforms.ts
git commit -m "feat: map updated_at to updatedAt in applyPulled functions"
```

---

### Task 11: Update mergeRecordsByDate for updatedAt-aware conflict resolution

**File to modify:** `services/syncTransforms.ts`

- [x] 11.1 Find `mergeRecordsByDate` in `services/syncTransforms.ts`.

- [x] 11.2 Update the generic type constraint from `T extends { id: string; date: string }` to `T extends { id: string; date: string; updatedAt?: string }`.

- [x] 11.3 Update the conflict resolution logic inside the loop:
```ts
for (const record of pulledRecords) {
  const existing = merged.get(record.id);
  if (!existing) {
    merged.set(record.id, record);
    continue;
  }
  // Prefer updatedAt if both records have it (ISO strings compare correctly)
  if (record.updatedAt && existing.updatedAt) {
    if (record.updatedAt > existing.updatedAt) {
      merged.set(record.id, record);
    }
  } else {
    // Fallback: existing date comparison behaviour
    if (record.date >= existing.date) {
      merged.set(record.id, record);
    }
  }
}
```

- [x] 11.4 Run tests:
```bash
npx vitest run services/syncTransforms.test.ts
```
Expected: all existing tests pass.

- [x] 11.5 Commit:
```bash
git add services/syncTransforms.ts
git commit -m "refactor: use updatedAt for conflict resolution in mergeRecordsByDate"
```

---

### Task 12: Fix mergePulledData to process shifts and tombstones

**File to modify:** `services/syncService.ts`

- [x] 12.1 Read `services/syncService.ts` in full, focusing on `mergePulledData` (~lines 211–220).

- [x] 12.2 Add `import { applyPulledShiftWorkLogs } from './syncTransforms';` (or confirm it is already imported).

- [x] 12.3 Replace `mergePulledData` with:
```ts
export function mergePulledData(
  localState: MergedSyncState,
  pulledData: SyncPullPayload
): MergedSyncState {
  // Merge legacy work_logs first, then overlay shifts (more authoritative)
  const workLogsFromLegacy = applyPulledWorkLogs(pulledData.workLogs ?? [], localState.dailyLogs);
  const mergedDailyLogs = pulledData.shifts?.length
    ? applyPulledShiftWorkLogs(pulledData.shifts, pulledData.shiftEarnings ?? [], workLogsFromLegacy)
    : workLogsFromLegacy;

  // Apply tombstone deletions
  const deletedWorkLogIds = new Set([
    ...(pulledData.deletedIds?.workLogs ?? []),
    ...(pulledData.deletedIds?.shifts ?? []),
  ]);
  const deletedMileageIds = new Set(pulledData.deletedIds?.mileageLogs ?? []);
  const deletedExpenseIds = new Set(pulledData.deletedIds?.expenses ?? []);

  return {
    trips: applyPulledTrips(pulledData.mileageLogs ?? [], localState.trips)
      .filter((t) => !deletedMileageIds.has(t.id)),
    dailyLogs: mergedDailyLogs
      .filter((l) => !deletedWorkLogIds.has(l.id)),
    expenses: applyPulledExpenses(pulledData.expenses ?? [], localState.expenses)
      .filter((e) => !deletedExpenseIds.has(e.id)),
    settings: pulledData.settings
      ? normalizeSettings({ ...localState.settings, ...pulledData.settings })
      : localState.settings,
  };
}
```

- [x] 12.4 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```

- [x] 12.5 Run tests:
```bash
npx vitest run
```

- [ ] 12.6 Commit:
```bash
git add services/syncService.ts
git commit -m "feat: merge pulled shifts and apply tombstone deletions in mergePulledData"
```

---

### Task 13: Client-side tombstone state management

**Files to modify:** `services/syncTransforms.ts`, `App.tsx`

- [ ] 13.1 Read `App.tsx` — find the delete handlers (`handleDeleteTrip` or equivalent, `handleDeleteExpense`, `handleDeleteDailyLog` or equivalent). Also find where `buildSyncPayload` is called (likely in `useSyncOrchestrator` or `App.tsx`).

- [ ] 13.2 Update `buildSyncPayload` in `services/syncTransforms.ts` to accept and include `deletedIds`:

Add `deletedIds` as an optional last parameter:
```ts
export const buildSyncPayload = (
  trips: Trip[],
  expenses: Expense[],
  dailyLogs: DailyWorkLog[],
  settings: Settings,
  deletedIds?: { workLogs?: string[]; mileageLogs?: string[]; expenses?: string[]; shifts?: string[] }
) => {
  return {
    // ... existing fields ...
    deletedIds,
  };
};
```

- [ ] 13.3 In `App.tsx` (or whichever file manages app state), add a `deletedIds` state with localStorage persistence:

```ts
const DELETED_IDS_KEY = 'driver_deleted_ids';

const loadDeletedIds = () => {
  try {
    return JSON.parse(localStorage.getItem(DELETED_IDS_KEY) ?? '{}');
  } catch { return {}; }
};

const [deletedIds, setDeletedIds] = useState<{
  workLogs: string[]; mileageLogs: string[]; expenses: string[]; shifts: string[];
}>(() => ({
  workLogs: [],
  mileageLogs: [],
  expenses: [],
  shifts: [],
  ...loadDeletedIds(),
}));
```

- [ ] 13.4 In each delete handler, push the id to the appropriate array and persist:

```ts
// handleDeleteTrip / handleDeleteMileageLog:
setDeletedIds((prev) => {
  const next = { ...prev, mileageLogs: [...prev.mileageLogs, id] };
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(next));
  return next;
});

// handleDeleteExpense:
setDeletedIds((prev) => {
  const next = { ...prev, expenses: [...prev.expenses, id] };
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(next));
  return next;
});

// handleDeleteDailyLog / handleDeleteWorkLog:
setDeletedIds((prev) => {
  const next = {
    ...prev,
    workLogs: [...prev.workLogs, id],
    shifts: [...prev.shifts, id],
  };
  localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(next));
  return next;
});
```

- [ ] 13.5 Pass `deletedIds` to `buildSyncPayload` wherever it is called. Confirm the call site (likely `hooks/useSyncOrchestrator.ts` or `App.tsx`) and add the argument.

- [ ] 13.6 After a successful push in `syncService.ts`, clear the local `deletedIds`. The push success callback or event emission is in `push()` (~line 164). Add a mechanism to clear: the simplest approach is to pass a `onPushSuccess` callback or expose a `clearDeletedIds` function that the push caller invokes. If `push()` doesn't support this cleanly, add a `clearDeletedIdsAfterPush` export to a small utility that `App.tsx` / the orchestrator can call.

- [ ] 13.7 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```

- [ ] 13.8 Commit:
```bash
git add services/syncTransforms.ts App.tsx hooks/useSyncOrchestrator.ts
git commit -m "feat: track deleted record ids as tombstones and include in push payload"
```

---

### Task 14: Populate updatedAt on record writes in App.tsx

**File to modify:** `App.tsx`

- [ ] 14.1 Read `App.tsx` — identify all handlers that create or update `Trip`, `DailyWorkLog`, or `Expense` objects. Look for patterns like `{ id: ..., date: ..., provider: ..., revenue: ... }` object literals.

- [ ] 14.2 For every such object literal (create or update), add `updatedAt: new Date().toISOString()`. For updates that spread an existing record, add `updatedAt: new Date().toISOString()` to the spread result.

- [ ] 14.3 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```

- [ ] 14.4 Run all tests:
```bash
npx vitest run
```
Expected: all tests pass.

- [ ] 14.5 Commit:
```bash
git add App.tsx
git commit -m "feat: set updatedAt on all entity writes"
```

---

## Phase 4: Final Verification and Deploy

### Task 15: Final verification and deploy

- [ ] 15.1 Run full unit test suite:
```bash
npx vitest run
```
Expected: all tests pass, 0 failures.

- [ ] 15.2 Run TypeScript compile check:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] 15.3 Run production build:
```bash
npm run build
```
Expected: build succeeds.

- [ ] 15.4 Deploy to Cloudflare Pages:
```bash
npx wrangler pages deploy dist --project-name drivertax --commit-dirty=true
```
Expected: deploy succeeds.
