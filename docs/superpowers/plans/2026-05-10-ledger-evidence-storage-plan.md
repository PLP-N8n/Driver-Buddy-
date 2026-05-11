# Ledger vs. Evidence Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage-only persistence with an IndexedDB-backed "Ledger vs. Evidence" architecture where incoming data from manual entry, OCR, and API integrations is treated as evidence observations that get reconciled into a canonical ledger.

**Architecture:** Three new evidence tables (`shift_evidence`, `expense_evidence`, `mileage_evidence`) feed into evolved ledger tables (`shifts`, `expenses`, `trips`) via a confidence-weighted reconciliation engine. Client and Worker both run the same deterministic rules. Client optimistically reconciles locally; Worker is authoritative on pull. All local storage moves from 7 localStorage keys to a single IndexedDB database (`driver_buddy`) with 8 object stores.

**Tech Stack:** TypeScript, IndexedDB (via `idb` library), React 19, Vitest, Cloudflare D1

**Source spec:** `docs/superpowers/specs/2026-05-10-ledger-evidence-storage-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `types.ts` | Add `EvidenceRecord`, `EvidenceSource`, `ConfidenceScore`, `DisputeStatus` types |
| `services/storage.ts` (new) | IndexedDB wrapper — open, put, getAll, clear |
| `services/reconciliation.ts` (new) | Confidence-weighted evidence → ledger promotion engine |
| `services/__tests__/storage.test.ts` (new) | IndexedDB wrapper tests |
| `services/__tests__/reconciliation.test.ts` (new) | Reconciliation rule tests |
| `hooks/useHydration.ts` | Add IndexedDB migration from localStorage |
| `hooks/useStorage.ts` (new) | Replaces `usePersistence` — async IndexedDB writes |
| `components/AppShell.tsx` | Swap `usePersistence` → `useStorage`, wire dispute indicator |
| `components/DisputeSheet.tsx` (new) | Bottom sheet for resolving evidence disputes |
| `components/EvidenceTrail.tsx` (new) | Provenance display for ledger entries |
| `components/dashboard/DashboardScreen.tsx` | Empty state: show restore option when backup code exists |
| `workers/sync-api/migrations/0010_evidence_tables.sql` (new) | D1 migration for evidence tables + ledger columns |
| `workers/sync-api/src/routes/sync.ts` | Updated push/pull handlers with evidence support |

---

### Task 1: Add Evidence Types to types.ts

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add evidence type definitions**

Add after the `SyncPullPayload` interface (around line 318):

```typescript
// ── Evidence / Ledger types ──────────────────────────────────────────

export type EvidenceSource = 'manual' | 'ocr' | 'api';

export interface EvidenceRecord {
  id: string;
  account_id?: string;
  source_type: EvidenceSource;
  source_detail: string; // e.g. "uber_api", "deliveroo_ocr", "user_entry"
  confidence: number;    // 0.0 – 1.0
  raw_payload?: string;  // original unprocessed JSON
  created_at: string;
  resolved_to_ledger_id?: string | null;
  dispute_status?: 'pending' | 'resolved' | null;
}

export interface ShiftEvidence extends EvidenceRecord {
  date: string;
  platform?: string;
  hours_worked?: number;
  earnings?: number;
  started_at?: string;
  ended_at?: string;
  start_odometer?: number;
  end_odometer?: number;
  business_miles?: number;
  fuel_liters?: number;
  job_count?: number;
  notes?: string;
  provider_splits?: ProviderSplit[];
}

export interface ExpenseEvidence extends EvidenceRecord {
  date: string;
  category?: ExpenseCategory;
  amount?: number;
  description?: string;
  receipt_id?: string;
  scope?: ExpenseScope;
  business_use_percent?: number;
  vehicle_expense_type?: VehicleExpenseType;
  tax_treatment?: TaxTreatment;
  linked_shift_id?: string;
}

export interface MileageEvidence extends EvidenceRecord {
  date: string;
  start_location?: string;
  end_location?: string;
  start_odometer?: number;
  end_odometer?: number;
  total_miles?: number;
  purpose?: TripPurpose;
  path?: Coordinate[];
  notes?: string;
  linked_shift_id?: string;
}

// Ledger metadata columns (added to existing tables)
export interface LedgerMeta {
  resolved_from_evidence?: string[];  // JSON array of evidence IDs
  last_resolved_at?: string;
  user_override?: boolean;
}
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: PASS (these are additive types, no existing code references them)

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat: add evidence and ledger types for Ledger vs. Evidence model"
```

---

### Task 2: Add idb Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install idb library**

```bash
npm install idb
```

- [ ] **Step 2: Verify installation**

```
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add idb library for IndexedDB wrapper"
```

---

### Task 3: Create IndexedDB Storage Wrapper

**Files:**
- Create: `services/storage.ts`
- Create: `services/__tests__/storage.test.ts`

- [ ] **Step 1: Write failing tests for storage wrapper**

Create `services/__tests__/storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDriverBuddyDB, putShift, getAllShifts, putEvidence, getUnresolvedEvidence } from '../storage';
import type { ShiftEvidence } from '../../types';

const DB_NAME = 'driver_buddy_test';

beforeEach(async () => {
  // Ensure clean state
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
});

describe('storage', () => {
  it('opens the database and creates all object stores', async () => {
    const db = await openDriverBuddyDB(DB_NAME);
    expect(db.objectStoreNames).toContain('shifts');
    expect(db.objectStoreNames).toContain('shift_evidence');
    expect(db.objectStoreNames).toContain('expenses');
    expect(db.objectStoreNames).toContain('expense_evidence');
    expect(db.objectStoreNames).toContain('trips');
    expect(db.objectStoreNames).toContain('mileage_evidence');
    expect(db.objectStoreNames).toContain('settings');
    expect(db.objectStoreNames).toContain('player_stats');
    db.close();
  });

  it('puts and retrieves a shift', async () => {
    const db = await openDriverBuddyDB(DB_NAME);
    await putShift(db, { id: 's1', date: '2026-05-10', total_earnings: 50 });
    const all = await getAllShifts(db);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('s1');
    db.close();
  });

  it('stores evidence and retrieves unresolved records', async () => {
    const db = await openDriverBuddyDB(DB_NAME);

    const resolved: ShiftEvidence = {
      id: 'e1', source_type: 'manual', source_detail: 'user', confidence: 0.5,
      created_at: new Date().toISOString(), date: '2026-05-10',
      resolved_to_ledger_id: 's1',
    };
    const unresolved: ShiftEvidence = {
      id: 'e2', source_type: 'ocr', source_detail: 'screenshot', confidence: 0.7,
      created_at: new Date().toISOString(), date: '2026-05-10',
      resolved_to_ledger_id: null,
    };

    await putEvidence(db, 'shift_evidence', resolved);
    await putEvidence(db, 'shift_evidence', unresolved);

    const unresolvedOnly = await getUnresolvedEvidence(db, 'shift_evidence');
    expect(unresolvedOnly).toHaveLength(1);
    expect(unresolvedOnly[0]?.id).toBe('e2');
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest --configLoader native run --config vitest.runtime.config.mjs services/__tests__/storage.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement storage wrapper**

Create `services/storage.ts`:

```typescript
import { openDB, type IDBPDatabase } from 'idb';
import type { ShiftEvidence, ExpenseEvidence, MileageEvidence } from '../types';

const DB_VERSION = 1;

export function openDriverBuddyDB(name = 'driver_buddy') {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      // Ledger stores
      if (!db.objectStoreNames.contains('shifts')) {
        db.createObjectStore('shifts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('expenses')) {
        db.createObjectStore('expenses', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }

      // Evidence stores (with resolved_to_ledger_id index)
      if (!db.objectStoreNames.contains('shift_evidence')) {
        const store = db.createObjectStore('shift_evidence', { keyPath: 'id' });
        store.createIndex('resolved_idx', 'resolved_to_ledger_id');
      }
      if (!db.objectStoreNames.contains('expense_evidence')) {
        const store = db.createObjectStore('expense_evidence', { keyPath: 'id' });
        store.createIndex('resolved_idx', 'resolved_to_ledger_id');
      }
      if (!db.objectStoreNames.contains('mileage_evidence')) {
        const store = db.createObjectStore('mileage_evidence', { keyPath: 'id' });
        store.createIndex('resolved_idx', 'resolved_to_ledger_id');
      }

      // Settings and stats (singleton stores)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
      if (!db.objectStoreNames.contains('player_stats')) {
        db.createObjectStore('player_stats');
      }
    },
  });
}

// ── Ledger helpers ──────────────────────────────────────────────────

export function putShift(db: IDBPDatabase, shift: Record<string, unknown>) {
  return db.put('shifts', shift);
}

export function getAllShifts(db: IDBPDatabase) {
  return db.getAll('shifts');
}

export function putExpense(db: IDBPDatabase, expense: Record<string, unknown>) {
  return db.put('expenses', expense);
}

export function getAllExpenses(db: IDBPDatabase) {
  return db.getAll('expenses');
}

export function putTrip(db: IDBPDatabase, trip: Record<string, unknown>) {
  return db.put('trips', trip);
}

export function getAllTrips(db: IDBPDatabase) {
  return db.getAll('trips');
}

// ── Evidence helpers ─────────────────────────────────────────────────

type EvidenceStoreName = 'shift_evidence' | 'expense_evidence' | 'mileage_evidence';

export function putEvidence(
  db: IDBPDatabase,
  storeName: EvidenceStoreName,
  evidence: ShiftEvidence | ExpenseEvidence | MileageEvidence,
) {
  return db.put(storeName, evidence);
}

export async function getUnresolvedEvidence(
  db: IDBPDatabase,
  storeName: EvidenceStoreName,
): Promise<(ShiftEvidence | ExpenseEvidence | MileageEvidence)[]> {
  const all = await db.getAll(storeName);
  return all.filter((e) => !e.resolved_to_ledger_id);
}

export function getAllEvidence(db: IDBPDatabase, storeName: EvidenceStoreName) {
  return db.getAll(storeName);
}

// ── Settings & stats ─────────────────────────────────────────────────

export function putSetting(db: IDBPDatabase, key: string, value: unknown) {
  return db.put('settings', value, key);
}

export function getSetting<T>(db: IDBPDatabase, key: string): Promise<T | undefined> {
  return db.get('settings', key) as Promise<T | undefined>;
}

export function putPlayerStats(db: IDBPDatabase, stats: unknown) {
  return db.put('player_stats', stats, 'singleton');
}

export function getPlayerStats<T>(db: IDBPDatabase): Promise<T | undefined> {
  return db.get('player_stats', 'singleton') as Promise<T | undefined>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest --configLoader native run --config vitest.runtime.config.mjs services/__tests__/storage.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add services/storage.ts services/__tests__/storage.test.ts
git commit -m "feat: add IndexedDB storage wrapper with evidence and ledger stores"
```

---

### Task 4: Create Reconciliation Engine

**Files:**
- Create: `services/reconciliation.ts`
- Create: `services/__tests__/reconciliation.test.ts`

- [ ] **Step 1: Write failing tests for reconciliation**

Create `services/__tests__/reconciliation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reconcileShiftEvidence } from '../reconciliation';
import type { ShiftEvidence } from '../../types';

function makeEvidence(overrides: Partial<ShiftEvidence> & { id: string }): ShiftEvidence {
  return {
    source_type: 'manual',
    source_detail: 'user',
    confidence: 0.5,
    created_at: '2026-05-10T08:00:00Z',
    date: '2026-05-10',
    hours_worked: 4,
    earnings: 60,
    ...overrides,
  };
}

describe('reconcileShiftEvidence', () => {
  it('auto-promotes high-confidence evidence with no conflicts', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'api', source_detail: 'uber_api', confidence: 0.95, hours_worked: 3.75, earnings: 58.50 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('promoted');
    expect(result.ledgerEntry?.hours_worked).toBe(3.75);
    expect(result.ledgerEntry?.total_earnings).toBe(58.50);
  });

  it('creates dispute when two records have similar confidence', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'manual', source_detail: 'user', confidence: 0.5, hours_worked: 4, earnings: 60 }),
      makeEvidence({ id: 'e2', source_type: 'ocr', source_detail: 'screenshot', confidence: 0.7, hours_worked: 3.5, earnings: 55 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('disputed');
    expect(result.disputeCandidates).toHaveLength(2);
  });

  it('auto-resolves when confidence gap is large enough', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'manual', source_detail: 'user', confidence: 0.5, hours_worked: 4, earnings: 60 }),
      makeEvidence({ id: 'e2', source_type: 'api', source_detail: 'uber_api', confidence: 0.95, hours_worked: 3.75, earnings: 58.50 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('promoted');
    expect(result.ledgerEntry?.hours_worked).toBe(3.75);
  });

  it('deduplicates same-source evidence (newest wins)', () => {
    const evidence: ShiftEvidence[] = [
      makeEvidence({ id: 'e1', source_type: 'ocr', source_detail: 'screenshot', confidence: 0.7, created_at: '2026-05-10T09:00:00Z', hours_worked: 3.5, earnings: 55 }),
      makeEvidence({ id: 'e2', source_type: 'ocr', source_detail: 'screenshot', confidence: 0.7, created_at: '2026-05-10T10:00:00Z', hours_worked: 3.75, earnings: 58 }),
    ];

    const result = reconcileShiftEvidence(evidence);
    expect(result.status).toBe('promoted');
    expect(result.ledgerEntry?.hours_worked).toBe(3.75);
    expect(result.ledgerEntry?.total_earnings).toBe(58);
  });

  it('returns idle for empty evidence', () => {
    const result = reconcileShiftEvidence([]);
    expect(result.status).toBe('idle');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest --configLoader native run --config vitest.runtime.config.mjs services/__tests__/reconciliation.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement reconciliation engine**

Create `services/reconciliation.ts`:

```typescript
import type { ShiftEvidence, ExpenseEvidence, MileageEvidence } from '../types';

// ── Shared ───────────────────────────────────────────────────────────

interface BaseEvidence {
  id: string;
  source_type: string;
  source_detail: string;
  confidence: number;
  created_at: string;
  date: string;
  dispute_status?: string | null;
}

type ReconciliationResult =
  | { status: 'idle' }
  | { status: 'promoted'; ledgerEntry: Record<string, unknown>; resolvedEvidenceIds: string[] }
  | { status: 'disputed'; disputeCandidates: BaseEvidence[] };

const CONFIDENCE_GAP_THRESHOLD = 0.3;

function deduplicateBySource<T extends BaseEvidence>(evidence: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const e of evidence) {
    const key = `${e.source_type}|${e.source_detail}|${e.date}`;
    const existing = byKey.get(key);
    if (!existing || e.created_at > existing.created_at) {
      byKey.set(key, e);
    }
  }
  return [...byKey.values()];
}

function getDefaultConfidence(sourceType: string): number {
  switch (sourceType) {
    case 'api': return 0.95;
    case 'ocr': return 0.70;
    case 'manual': return 0.50;
    default: return 0.5;
  }
}

// Apply default confidence if not explicitly set
function normalizeConfidence<T extends BaseEvidence>(e: T): T {
  if (e.confidence === 0 || e.confidence == null) {
    return { ...e, confidence: getDefaultConfidence(e.source_type) };
  }
  return e;
}

// ── Generic reconciler ───────────────────────────────────────────────

function reconcile<T extends BaseEvidence>(
  evidence: T[],
  buildLedgerEntry: (winner: T) => Record<string, unknown>,
): ReconciliationResult {
  if (evidence.length === 0) return { status: 'idle' };

  const deduped = deduplicateBySource(evidence.map(normalizeConfidence));

  if (deduped.length === 1) {
    const single = deduped[0]!;
    if (single.confidence >= 0.95) {
      return {
        status: 'promoted',
        ledgerEntry: buildLedgerEntry(single),
        resolvedEvidenceIds: [single.id],
      };
    }
    // Single piece of low-confidence evidence — not enough to promote yet
    return { status: 'idle' };
  }

  // Sort by confidence descending
  deduped.sort((a, b) => b.confidence - a.confidence);
  const highest = deduped[0]!;

  // Check if any pair is close enough to dispute
  const hasClosePeer = deduped.some(
    (e) => e.id !== highest.id && (highest.confidence - e.confidence) <= CONFIDENCE_GAP_THRESHOLD,
  );

  if (hasClosePeer) {
    return {
      status: 'disputed',
      disputeCandidates: deduped.filter(
        (e) => (highest.confidence - e.confidence) <= CONFIDENCE_GAP_THRESHOLD,
      ),
    };
  }

  return {
    status: 'promoted',
    ledgerEntry: buildLedgerEntry(highest),
    resolvedEvidenceIds: deduped.map((e) => e.id),
  };
}

// ── Shift reconciliation ─────────────────────────────────────────────

export function reconcileShiftEvidence(evidence: ShiftEvidence[]): ReconciliationResult {
  return reconcile(evidence, (winner) => ({
    date: winner.date,
    primary_platform: winner.platform,
    hours_worked: winner.hours_worked,
    total_earnings: winner.earnings,
    started_at: winner.started_at,
    ended_at: winner.ended_at,
    start_odometer: winner.start_odometer,
    end_odometer: winner.end_odometer,
    business_miles: winner.business_miles,
    fuel_liters: winner.fuel_liters,
    job_count: winner.job_count,
    notes: winner.notes,
    provider_splits: JSON.stringify(winner.provider_splits ?? null),
    status: 'completed',
  }));
}

// ── Expense reconciliation ───────────────────────────────────────────

export function reconcileExpenseEvidence(evidence: ExpenseEvidence[]): ReconciliationResult {
  return reconcile(evidence, (winner) => ({
    date: winner.date,
    category: winner.category,
    amount: winner.amount,
    description: winner.description,
    receipt_id: winner.receipt_id,
    scope: winner.scope,
    business_use_percent: winner.business_use_percent,
    vehicle_expense_type: winner.vehicle_expense_type,
    tax_treatment: winner.tax_treatment,
    linked_shift_id: winner.linked_shift_id,
  }));
}

// ── Mileage reconciliation ───────────────────────────────────────────

export function reconcileMileageEvidence(evidence: MileageEvidence[]): ReconciliationResult {
  return reconcile(evidence, (winner) => ({
    date: winner.date,
    start_location: winner.start_location,
    end_location: winner.end_location,
    start_odometer: winner.start_odometer,
    end_odometer: winner.end_odometer,
    total_miles: winner.total_miles,
    purpose: winner.purpose,
    notes: winner.notes,
    linked_shift_id: winner.linked_shift_id,
    path: winner.path ? JSON.stringify(winner.path) : undefined,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest --configLoader native run --config vitest.runtime.config.mjs services/__tests__/reconciliation.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add services/reconciliation.ts services/__tests__/reconciliation.test.ts
git commit -m "feat: add reconciliation engine with confidence-weighted voting"
```

---

### Task 5: localStorage → IndexedDB Migration in useHydration

**Files:**
- Modify: `hooks/useHydration.ts`

- [ ] **Step 1: Add migration logic to useHydration**

Replace the `hydrateStoredData` function's logic. After reading all localStorage keys, write them to IndexedDB and set a migration flag:

Add import at top of file:

```typescript
import { openDriverBuddyDB, putShift, putExpense, putTrip, putSetting, putPlayerStats } from '../services/storage';
```

Add migration constant:

```typescript
const IDB_MIGRATED_KEY = 'idb_migrated_v1';
```

Replace the body of `hydrateStoredData` (lines 68-116). The function should now:

1. Read all localStorage keys as before
2. Open IndexedDB
3. If `_migrated_v1` flag is NOT in IndexedDB:
   - Convert `savedLogs` → ledger shift entries (each with `resolved_from_evidence: []`, `user_override: false`)
   - Convert `savedTrips` → ledger trip entries
   - Convert `savedExpenses` → ledger expense entries
   - Write all to IndexedDB object stores
   - Write settings and player stats as singletons
   - Set `_migrated_v1` flag
   - Clear legacy localStorage keys
4. Read current state FROM IndexedDB (not localStorage) for component state

```typescript
const hydrateStoredData = async (): Promise<string[]> => {
  const warnings: string[] = [];
  const savedTrips = parseStoredJson<Trip[]>('driver_trips');
  const savedExpenses = parseStoredJson<Expense[]>('driver_expenses');
  const savedLogs = parseStoredJson<DailyWorkLog[]>('driver_daily_logs');
  const savedActiveSession = parseStoredJson<ActiveWorkSession>('driver_active_session');
  const savedCompletedShiftSummary = parseStoredJson<CompletedShiftSummary>('driver_completed_shift_summary');
  const savedSettings = parseStoredJson<StoredSettings>('driver_settings');
  const savedStats = parseStoredJson<PlayerStats>('driver_player_stats');

  if (cancelled) return warnings;

  const db = await openDriverBuddyDB();
  const alreadyMigrated = await db.get('settings', IDB_MIGRATED_KEY);

  if (!alreadyMigrated) {
    // Migrate daily logs → shifts ledger
    const logs = Array.isArray(savedLogs) ? savedLogs : [];
    for (const log of logs) {
      await putShift(db, {
        id: log.id,
        date: log.date,
        status: 'completed',
        primary_platform: log.provider,
        hours_worked: log.hoursWorked,
        total_earnings: log.revenue,
        started_at: log.startedAt,
        ended_at: log.endedAt,
        fuel_liters: log.fuelLiters,
        job_count: log.jobCount,
        business_miles: log.milesDriven,
        notes: log.notes,
        provider_splits: log.providerSplits ? JSON.stringify(log.providerSplits) : null,
        resolved_from_evidence: '[]',
        last_resolved_at: new Date().toISOString(),
        user_override: 0,
      });
    }

    // Migrate trips → trips ledger
    const trips = Array.isArray(savedTrips) ? savedTrips : [];
    for (const trip of trips) {
      await putTrip(db, {
        ...trip,
        resolved_from_evidence: '[]',
        last_resolved_at: new Date().toISOString(),
        user_override: 0,
      });
    }

    // Migrate expenses → expenses ledger
    const expenses = Array.isArray(savedExpenses)
      ? migrateLegacyExpenses(savedExpenses, savedSettings?.claimMethod ?? 'SIMPLIFIED')
      : [];
    for (const expense of expenses) {
      await putExpense(db, {
        ...expense,
        resolved_from_evidence: '[]',
        last_resolved_at: new Date().toISOString(),
        user_override: 0,
      });
    }

    // Write settings and stats
    if (savedSettings) await putSetting(db, 'data', normalizeSettings(savedSettings));
    if (savedStats) await putPlayerStats(db, savedStats);

    // Mark migrated and clear localStorage
    await putSetting(db, IDB_MIGRATED_KEY, '1');

    try {
      localStorage.removeItem('driver_trips');
      localStorage.removeItem('driver_expenses');
      localStorage.removeItem('driver_daily_logs');
      localStorage.removeItem('driver_settings');
      localStorage.removeItem('driver_player_stats');
    } catch {
      // localStorage clear is best-effort
    }
  }

  // Populate state from IndexedDB
  if (cancelled) return warnings;

  const idbShifts = await db.getAll('shifts');
  const idbTrips = await db.getAll('trips');
  const idbExpenses = await db.getAll('expenses');
  const idbSettings = await db.get('settings', 'data');
  const idbStats = await db.get('player_stats', 'singleton');

  if (!cancelled) {
    setDailyLogs(idbShifts.map((s: any) => ({
      id: s.id,
      date: s.date,
      provider: s.primary_platform ?? 'Unknown',
      hoursWorked: s.hours_worked ?? 0,
      revenue: s.total_earnings ?? 0,
      notes: s.notes,
      fuelLiters: s.fuel_liters,
      jobCount: s.job_count,
      milesDriven: s.business_miles,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      providerSplits: typeof s.provider_splits === 'string' ? JSON.parse(s.provider_splits) : undefined,
    })));
    setTrips(idbTrips as Trip[]);
    setExpenses(idbExpenses as Expense[]);
    if (idbSettings) setSettings(normalizeSettings(idbSettings as StoredSettings));
    if (idbStats) setPlayerStats(idbStats as PlayerStats);
  }

  if (savedActiveSession && !cancelled) setActiveSession(savedActiveSession);
  if (savedCompletedShiftSummary && !cancelled) setCompletedShiftSummary(savedCompletedShiftSummary);

  return warnings;
};
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Compile and run tests to check no regression**

```
Remove-Item -Recurse -Force .tmp-vitest -ErrorAction SilentlyContinue
npx tsc --project tsconfig.vitest.json
npx vitest --configLoader native run --config vitest.runtime.config.mjs 2>&1 | Select-String -Pattern "Test Files|Tests"
```

Expected: no new failures beyond pre-existing 3 missedShiftInference tests

- [ ] **Step 4: Commit**

```bash
git add hooks/useHydration.ts
git commit -m "feat: add localStorage-to-IndexedDB migration in hydration"
```

---

### Task 6: Create useStorage Hook (replaces usePersistence)

**Files:**
- Create: `hooks/useStorage.ts`

- [ ] **Step 1: Create useStorage hook**

Create `hooks/useStorage.ts`:

```typescript
import { useEffect, useMemo, useRef } from 'react';
import { debounce } from 'es-toolkit';
import type { IDBPDatabase } from 'idb';
import { openDriverBuddyDB, putShift, putExpense, putTrip, putSetting, putPlayerStats } from '../services/storage';
import { sanitizeExpenseForStorage } from '../services/syncTransforms';
import { migrateDailyWorkLog } from '../shared/migrations/migrateShift';
import type {
  ActiveWorkSession,
  AppTab,
  CompletedShiftSummary,
  DailyWorkLog,
  Expense,
  PlayerStats,
  Settings,
  Trip,
} from '../types';

type UseStorageParams = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  activeSession: ActiveWorkSession | null;
  completedShiftSummary: CompletedShiftSummary | null;
  settings: Settings;
  playerStats: PlayerStats;
  activeTab: AppTab;
};

export function useStorage({
  trips,
  expenses,
  dailyLogs,
  settings,
  playerStats,
  activeTab,
}: UseStorageParams) {
  const dbRef = useRef<IDBPDatabase | null>(null);

  // Initialize DB connection
  useEffect(() => {
    openDriverBuddyDB().then((db) => { dbRef.current = db; });
    return () => {
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  const persistShifts = useMemo(
    () => debounce(async (nextLogs: DailyWorkLog[], db: IDBPDatabase | null) => {
      if (!db) return;
      // Map all DailyWorkLogs through migrateDailyWorkLog for consistency
      for (const log of nextLogs) {
        const shiftEntry = migrateDailyWorkLog(log);
        await putShift(db, { ...shiftEntry, id: log.id });
      }
    }, 500),
    [],
  );

  const persistExpenses = useMemo(
    () => debounce(async (nextExpenses: Expense[], db: IDBPDatabase | null) => {
      if (!db) return;
      for (const expense of nextExpenses) {
        await putExpense(db, sanitizeExpenseForStorage(expense));
      }
    }, 500),
    [],
  );

  const persistTrips = useMemo(
    () => debounce(async (nextTrips: Trip[], db: IDBPDatabase | null) => {
      if (!db) return;
      for (const trip of nextTrips) {
        await putTrip(db, trip);
      }
    }, 500),
    [],
  );

  const persistSettings = useMemo(
    () => debounce(async (nextSettings: Settings, db: IDBPDatabase | null) => {
      if (!db) return;
      await putSetting(db, 'data', nextSettings);
    }, 500),
    [],
  );

  const persistPlayerStats = useMemo(
    () => debounce(async (nextStats: PlayerStats, db: IDBPDatabase | null) => {
      if (!db) return;
      await putPlayerStats(db, nextStats);
    }, 500),
    [],
  );

  useEffect(() => {
    persistShifts(dailyLogs, dbRef.current);
  }, [dailyLogs, persistShifts]);

  useEffect(() => {
    persistExpenses(expenses, dbRef.current);
  }, [expenses, persistExpenses]);

  useEffect(() => {
    persistTrips(trips, dbRef.current);
  }, [trips, persistTrips]);

  useEffect(() => {
    persistSettings(settings, dbRef.current);
  }, [settings, persistSettings]);

  useEffect(() => {
    persistPlayerStats(playerStats, dbRef.current);
  }, [playerStats, persistPlayerStats]);

  // Flush on unmount
  useEffect(() => () => {
    persistShifts.flush();
    persistExpenses.flush();
    persistTrips.flush();
    persistSettings.flush();
    persistPlayerStats.flush();
  }, [persistShifts, persistExpenses, persistTrips, persistSettings, persistPlayerStats]);

  // Track settings visited
  useEffect(() => {
    if (activeTab === 'settings' && dbRef.current) {
      putSetting(dbRef.current, 'dtpro_settings_visited', 'true');
    }
  }, [activeTab]);
}
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add hooks/useStorage.ts
git commit -m "feat: add useStorage hook replacing localStorage with IndexedDB"
```

---

### Task 7: Wire useStorage into AppShell

**Files:**
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Swap usePersistence for useStorage**

Replace the import:

```typescript
// Remove:
import { usePersistence } from '../hooks/usePersistence';
// Add:
import { useStorage } from '../hooks/useStorage';
```

Replace the hook call (around line 350, search for `usePersistence(`):

```typescript
useStorage({
  trips,
  expenses,
  dailyLogs,
  activeSession,
  completedShiftSummary,
  settings,
  playerStats,
  activeTab,
});
```

Remove the `activeSession` and `completedShiftSummary` localStorage effects that were inside `usePersistence` — those are now handled by the hook.

- [ ] **Step 2: Run typecheck and tests**

```
npm run typecheck
npm run test:unit
```

Expected: PASS, no new test failures

- [ ] **Step 3: Commit**

```bash
git add components/AppShell.tsx
git commit -m "refactor: swap usePersistence for useStorage (IndexedDB)"
```

---

### Task 8: Create Worker D1 Migration for Evidence Tables

**Files:**
- Create: `workers/sync-api/migrations/0010_evidence_tables.sql`

- [ ] **Step 1: Write migration SQL**

Create `workers/sync-api/migrations/0010_evidence_tables.sql`:

```sql
-- Evidence tables for Ledger vs. Evidence storage model.
-- Stores incoming observations from manual, OCR, and API sources.

CREATE TABLE IF NOT EXISTS shift_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'ocr', 'api')),
  source_detail TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  platform TEXT,
  hours_worked REAL,
  earnings REAL,
  started_at TEXT,
  ended_at TEXT,
  start_odometer REAL,
  end_odometer REAL,
  business_miles REAL,
  fuel_liters REAL,
  job_count INTEGER,
  notes TEXT,
  provider_splits TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_to_ledger_id TEXT,
  dispute_status TEXT
);

CREATE TABLE IF NOT EXISTS expense_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'ocr', 'api')),
  source_detail TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  category TEXT,
  amount REAL,
  description TEXT,
  receipt_id TEXT,
  scope TEXT,
  business_use_percent REAL,
  vehicle_expense_type TEXT,
  tax_treatment TEXT,
  linked_shift_id TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_to_ledger_id TEXT,
  dispute_status TEXT
);

CREATE TABLE IF NOT EXISTS mileage_evidence (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'ocr', 'api')),
  source_detail TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  start_location TEXT,
  end_location TEXT,
  start_odometer REAL,
  end_odometer REAL,
  total_miles REAL,
  purpose TEXT,
  path TEXT,
  notes TEXT,
  linked_shift_id TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_to_ledger_id TEXT,
  dispute_status TEXT
);

-- Add ledger metadata columns to existing tables
ALTER TABLE shifts ADD COLUMN resolved_from_evidence TEXT NOT NULL DEFAULT '[]';
ALTER TABLE shifts ADD COLUMN last_resolved_at TEXT;
ALTER TABLE shifts ADD COLUMN user_override INTEGER NOT NULL DEFAULT 0;

ALTER TABLE expenses ADD COLUMN resolved_from_evidence TEXT NOT NULL DEFAULT '[]';
ALTER TABLE expenses ADD COLUMN last_resolved_at TEXT;
ALTER TABLE expenses ADD COLUMN user_override INTEGER NOT NULL DEFAULT 0;

ALTER TABLE mileage_logs ADD COLUMN resolved_from_evidence TEXT NOT NULL DEFAULT '[]';
ALTER TABLE mileage_logs ADD COLUMN last_resolved_at TEXT;
ALTER TABLE mileage_logs ADD COLUMN user_override INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply migration to local D1 (if configured)**

```
npx wrangler d1 execute driver_buddy_db --file workers/sync-api/migrations/0010_evidence_tables.sql --local
```

- [ ] **Step 3: Run Worker type-check**

```
npm --prefix workers/sync-api run type-check
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add workers/sync-api/migrations/0010_evidence_tables.sql
git commit -m "feat: add evidence tables and ledger metadata columns D1 migration"
```

---

### Task 9: Update Worker Sync Routes for Evidence

**Files:**
- Modify: `workers/sync-api/src/routes/sync.ts`

- [ ] **Step 1: Update push handler to accept evidence**

The push route should accept the new evidence payload shape. Add evidence handling to the existing push handler:

```typescript
// In the push handler, after parsing body:
const { evidence, ledger, last_sync_at } = body as {
  evidence?: {
    shifts?: ShiftEvidence[];
    expenses?: ExpenseEvidence[];
    mileage?: MileageEvidence[];
  };
  ledger?: {
    shifts?: any[];
    expenses?: any[];
    trips?: any[];
    settings?: any;
  };
  last_sync_at?: string;
};

// Store incoming evidence
if (evidence?.shifts) {
  for (const e of evidence.shifts) {
    await db.prepare(
      `INSERT OR REPLACE INTO shift_evidence (id, account_id, date, source_type, source_detail, confidence, platform, hours_worked, earnings, started_at, ended_at, start_odometer, end_odometer, business_miles, fuel_liters, job_count, notes, provider_splits, raw_payload, created_at, resolved_to_ledger_id, dispute_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(e.id, accountId, e.date, e.source_type, e.source_detail, e.confidence, e.platform ?? null, e.hours_worked ?? null, e.earnings ?? null, e.started_at ?? null, e.ended_at ?? null, e.start_odometer ?? null, e.end_odometer ?? null, e.business_miles ?? null, e.fuel_liters ?? null, e.job_count ?? null, e.notes ?? null, e.provider_splits ? JSON.stringify(e.provider_splits) : null, e.raw_payload ?? null, e.created_at, e.resolved_to_ledger_id ?? null, e.dispute_status ?? null).run();
  }
}

// Same for expense_evidence and mileage_evidence...

// Store ledger updates (existing logic)
if (ledger?.shifts) {
  for (const s of ledger.shifts) {
    await db.prepare(
      `INSERT OR REPLACE INTO shifts (id, account_id, date, status, primary_platform, hours_worked, total_earnings, started_at, ended_at, start_odometer, end_odometer, business_miles, fuel_liters, job_count, notes, provider_splits, created_at, updated_at, resolved_from_evidence, last_resolved_at, user_override)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(s.id, accountId, s.date, s.status ?? 'completed', s.primary_platform ?? null, s.hours_worked ?? null, s.total_earnings, s.started_at ?? null, s.ended_at ?? null, s.start_odometer ?? null, s.end_odometer ?? null, s.business_miles ?? null, s.fuel_liters ?? null, s.job_count ?? null, s.notes ?? null, s.provider_splits ?? null, s.created_at ?? new Date().toISOString(), s.updated_at ?? new Date().toISOString(), s.resolved_from_evidence ?? '[]', s.last_resolved_at ?? null, s.user_override ?? 0).run();
  }
}
```

- [ ] **Step 2: Update pull handler to include evidence**

Add evidence queries to the pull response:

```typescript
// After existing queries, add:
const evidenceShifts = await db.prepare(
  `SELECT * FROM shift_evidence WHERE account_id = ? AND created_at > ?`
).bind(accountId, since).all();

const evidenceExpenses = await db.prepare(
  `SELECT * FROM expense_evidence WHERE account_id = ? AND created_at > ?`
).bind(accountId, since).all();

const evidenceMileage = await db.prepare(
  `SELECT * FROM mileage_evidence WHERE account_id = ? AND created_at > ?`
).bind(accountId, since).all();

// Include in response
return Response.json({
  ...existingResponse,
  evidence: {
    shifts: evidenceShifts.results,
    expenses: evidenceExpenses.results,
    mileage: evidenceMileage.results,
  },
});
```

- [ ] **Step 3: Run Worker type-check**

```
npm --prefix workers/sync-api run type-check
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add workers/sync-api/src/routes/sync.ts
git commit -m "feat: add evidence push/pull support to Worker sync routes"
```

---

### Task 10: Create DisputeSheet Component

**Files:**
- Create: `components/DisputeSheet.tsx`

- [ ] **Step 1: Create the dispute resolution bottom sheet**

Create `components/DisputeSheet.tsx`:

```typescript
import React, { useRef } from 'react';
import { Check, Edit3, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { EvidenceRecord } from '../types';

interface DisputeSheetProps {
  open: boolean;
  onClose: () => void;
  entityType: 'shift' | 'expense' | 'mileage';
  date: string;
  candidates: EvidenceRecord[];
  onResolve: (selectedEvidenceId: string) => void;
  onCustomOverride: () => void;
}

const sourceLabels: Record<string, string> = {
  manual: 'Manual entry',
  ocr: 'OCR (screenshot)',
  api: 'API import',
};

export const DisputeSheet: React.FC<DisputeSheetProps> = ({
  open,
  onClose,
  entityType,
  date,
  candidates,
  onResolve,
  onCustomOverride,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(sheetRef, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        ref={sheetRef}
        className="w-full max-w-md rounded-t-2xl bg-surface-raised p-6 pb-safe"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Resolve ${entityType} dispute for ${date}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Resolve {entityType} — {date}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-400">
          Multiple sources disagree. Select the correct entry or enter your own.
        </p>

        <div className="space-y-2">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => onResolve(candidate.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
                <Check className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">
                  {sourceLabels[candidate.source_type] ?? candidate.source_type}
                </p>
                <p className="text-xs text-slate-400">
                  Confidence: {Math.round(candidate.confidence * 100)}% · {candidate.source_detail}
                </p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onCustomOverride}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-left transition-colors hover:bg-amber-500/10"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <Edit3 className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">Enter my own</p>
            <p className="text-xs text-slate-400">Your entry wins permanently</p>
          </div>
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/DisputeSheet.tsx
git commit -m "feat: add DisputeSheet component for evidence conflict resolution"
```

---

### Task 11: Create EvidenceTrail Component

**Files:**
- Create: `components/EvidenceTrail.tsx`

- [ ] **Step 1: Create the evidence trail display**

Create `components/EvidenceTrail.tsx`:

```typescript
import React from 'react';
import { Info } from 'lucide-react';

interface EvidenceTrailProps {
  resolvedFromEvidence?: string[];
  lastResolvedAt?: string;
  userOverride?: boolean;
}

export const EvidenceTrail: React.FC<EvidenceTrailProps> = ({
  resolvedFromEvidence,
  lastResolvedAt,
  userOverride,
}) => {
  if (userOverride) {
    return (
      <p className="flex items-center gap-1 text-xs text-amber-400">
        <Info className="h-3 w-3" />
        Manually set by you — won't be changed by imports
      </p>
    );
  }

  const count = resolvedFromEvidence?.length ?? 0;
  if (count === 0) return null;

  return (
    <p className="flex items-center gap-1 text-xs text-slate-500">
      <Info className="h-3 w-3" />
      {count === 1
        ? 'Based on 1 source'
        : `Based on ${count} sources`}
      {lastResolvedAt && ` · Last verified ${new Date(lastResolvedAt).toLocaleDateString('en-GB')}`}
    </p>
  );
};
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/EvidenceTrail.tsx
git commit -m "feat: add EvidenceTrail component for showing data provenance"
```

---

### Task 12: Update Dashboard Empty State for Restore

**Files:**
- Modify: `components/dashboard/DashboardScreen.tsx`

- [ ] **Step 1: Check for backup code in empty state**

Find the empty state render (around line 934). Add a check for an existing backup code:

```typescript
import { getBackupCode } from '../../services/deviceId';

// In the empty state section, after "Log your first shift":
{workDays.length === 0 && (
  <div className="...">
    {/* existing empty state */}

    {getBackupCode() && (
      <button
        type="button"
        onClick={() => onNavigate('settings')}
        className="mt-3 text-sm text-indigo-400 underline underline-offset-2"
      >
        Restore from cloud backup
      </button>
    )}
  </div>
)}
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/DashboardScreen.tsx
git commit -m "feat: show restore option in empty state when backup code exists"
```

---

### Task 13: Integration — Wire DisputeSheet into AppShell

**Files:**
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Add dispute state and wire DisputeSheet**

Add imports:

```typescript
import { DisputeSheet } from './DisputeSheet';
import { EvidenceTrail } from './EvidenceTrail';
import { getAllEvidence, getUnresolvedEvidence } from '../services/storage';
import { reconcileShiftEvidence } from '../services/reconciliation';
```

Add dispute state near other state declarations:

```typescript
const [disputeOpen, setDisputeOpen] = useState(false);
const [disputeData, setDisputeData] = useState<{
  entityType: 'shift' | 'expense' | 'mileage';
  date: string;
  candidates: EvidenceRecord[];
} | null>(null);
```

Add a `useEffect` to check for disputes on hydration and after sync pull:

```typescript
useEffect(() => {
  if (!hasHydrated) return;
  openDriverBuddyDB().then(async (db) => {
    const unresolved = await getUnresolvedEvidence(db, 'shift_evidence');
    // Also check for disputes (multiple unresolved for same date)
    const byDate = new Map<string, EvidenceRecord[]>();
    for (const e of unresolved) {
      const existing = byDate.get(e.date) ?? [];
      existing.push(e);
      byDate.set(e.date, existing);
    }
    for (const [date, evidence] of byDate) {
      if (evidence.length >= 2) {
        setDisputeData({ entityType: 'shift', date, candidates: evidence });
        setDisputeOpen(true);
        break; // Show one dispute at a time
      }
    }
  });
}, [hasHydrated]);
```

Render `DisputeSheet` in the component tree (near the end, alongside other modals/sheets):

```typescript
{disputeData && (
  <DisputeSheet
    open={disputeOpen}
    onClose={() => setDisputeOpen(false)}
    entityType={disputeData.entityType}
    date={disputeData.date}
    candidates={disputeData.candidates}
    onResolve={async (evidenceId) => {
      // Mark selected evidence as resolved, promote to ledger
      const db = await openDriverBuddyDB();
      await putEvidence(db, 'shift_evidence', {
        ...disputeData.candidates.find(c => c.id === evidenceId)!,
        resolved_to_ledger_id: evidenceId,
        dispute_status: 'resolved',
        confidence: 1.0,
      });
      setDisputeOpen(false);
      setDisputeData(null);
    }}
    onCustomOverride={() => {
      setDisputeOpen(false);
      // Navigate to manual entry
      setActiveTab('worklog');
    }}
  />
)}
```

- [ ] **Step 2: Run typecheck and tests**

```
npm run typecheck
npm run test:unit
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/AppShell.tsx
git commit -m "feat: wire DisputeSheet and evidence checking into AppShell"
```

---

### Task 14: Final Integration Test & Verification

**Files:**
- Verify all files compile and tests pass

- [ ] **Step 1: Full clean build and test run**

```bash
Remove-Item -Recurse -Force .tmp-vitest -ErrorAction SilentlyContinue
npm run typecheck
npx tsc --project tsconfig.vitest.json
npx vitest --configLoader native run --config vitest.runtime.config.mjs
```

Expected: PASS — all tests passing except pre-existing 3 `missedShiftInference` failures

- [ ] **Step 2: Worker type-check**

```bash
npm --prefix workers/sync-api run type-check
```

Expected: PASS

- [ ] **Step 3: Build frontend**

```bash
npm run build
```

Expected: PASS — build succeeds

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Ledger vs. Evidence storage migration"
```

---

## Completion Checklist

- [ ] 8 new files created
- [ ] 5 existing files modified
- [ ] localStorage migration path tested and verified
- [ ] Reconciliation engine covered by 5 tests
- [ ] Storage wrapper covered by 3 tests
- [ ] Full test suite passes (no regressions beyond pre-existing 3 failures)
- [ ] Worker type-check passes
- [ ] Frontend build succeeds
