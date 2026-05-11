# Ledger vs. Evidence — Storage Architecture Design

**Date:** 2026-05-10
**Status:** Proposed

## Summary

Replace the current "last-write-wins" data model with a **Ledger vs. Evidence** architecture. Incoming data from any source (manual entry, OCR, API integrations) is treated as **Evidence** — observations that something happened. The database reconciles evidence into a **Ledger** — the resolved canonical truth. This survives the transition from manual/OCR to full API integration without breaking the data model.

## Motivation

Three converging forces make the current model unsustainable:

1. **Future API integrations** — Uber, Deliveroo, Bolt APIs will push shift data directly
2. **OCR/receipt ingestion** — screenshot extraction will auto-populate shifts and expenses
3. **Multi-device reconciliation** — a driver may log on phone and tablet simultaneously

Currently all three would silently overwrite each other. The evidence model surfaces conflicts instead of hiding them.

## Core Schema

### Evidence Tables (incoming observations)

**shift_evidence**

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Client-generated UUID |
| account_id | TEXT | Device account |
| date | TEXT | Shift date (YYYY-MM-DD) |
| source_type | TEXT | `manual`, `ocr`, `api` |
| source_detail | TEXT | e.g., `uber_api`, `deliveroo_ocr` |
| confidence | REAL | 0.0–1.0 |
| platform | TEXT | Provider label |
| hours_worked | REAL | |
| earnings | REAL | |
| started_at | TEXT | ISO 8601 |
| ended_at | TEXT | ISO 8601 |
| start_odometer | REAL | |
| end_odometer | REAL | |
| business_miles | REAL | |
| fuel_liters | REAL | |
| job_count | INTEGER | |
| notes | TEXT | |
| provider_splits | TEXT | JSON array of {provider, revenue, jobCount} |
| raw_payload | TEXT | Original unprocessed data (JSON) |
| created_at | TEXT | |
| resolved_to_ledger_id | TEXT | NULL until promoted |
| dispute_status | TEXT | NULL, `pending`, `resolved` |

**expense_evidence**

Same pattern. Fields mirror the expenses ledger table plus: `source_type`, `source_detail`, `confidence`, `raw_payload`, `resolved_to_ledger_id`, `dispute_status`.

**mileage_evidence**

Same pattern. Fields mirror the trips ledger table plus: `source_type`, `source_detail`, `confidence`, `raw_payload`, `resolved_to_ledger_id`, `dispute_status`.

### Ledger Tables (resolved truth)

Current tables (`shifts`, `expenses`, `mileage_logs`) become the ledger. Each gains three columns:

| Column | Type | Notes |
|--------|------|-------|
| resolved_from_evidence | TEXT | JSON array of evidence IDs that contributed |
| last_resolved_at | TEXT | ISO 8601 timestamp of last resolution |
| user_override | INTEGER | 0 or 1 — did the user manually set this? |

`mileage_logs` is renamed to `trips` for clarity. `work_logs` is fully absorbed by `shifts` (this migration is already partially complete in the current schema).

## Confidence Model

| Source | Default Score | Behavior |
|--------|--------------|----------|
| API integration (Uber, Bolt, Deliveroo) | 0.95 | Auto-promotes unless conflicting evidence exists |
| OCR extraction (screenshot/receipt) | 0.70 | Held 24h for corroboration; auto-promotes if unchallenged |
| Manual entry | 0.50 | Held until another source corroborates or user explicitly confirms |
| User explicit confirmation | 1.00 | Permanent override — survives all future imports |

## Reconciliation Rules

Applied in order:

1. **Same-source dedup** — Evidence from the same `(source_type, source_detail, date)` replaces the previous record from that source. No dispute created.
2. **High-confidence auto-promote** — Evidence with confidence >= 0.95 AND no conflicting evidence with confidence difference <= 0.3 → auto-promote to ledger.
3. **Confidence gap auto-resolve** — Two records with confidence difference > 0.3 → higher confidence wins, auto-promote.
4. **Dispute creation** — Two or more records with confidence difference <= 0.3 → create dispute (`dispute_status: 'pending'`), user must resolve.
5. **User override permanence** — User-set values (confidence 1.0) are never overwritten by automated sources. New evidence still stored for audit but auto-resolves to the user's ledger entry.

### Example

```
08:00  Manual:   4.0h, £60.00 on Uber    [0.50]
09:00  OCR:      3.5h, £55.00 on Uber    [0.70]
       → Confidence diff = 0.20 (<= 0.3) → DISPUTE CREATED

12:00  API:      3.75h, £58.50 on Uber   [0.95]
       → API (0.95) vs OCR (0.70): diff = 0.25 (<= 0.3) → still disputed
       → API (0.95) vs manual (0.50): diff = 0.45 (> 0.3) → API beats manual
       → But OCR is still in play. Re-evaluate with all three:
         API (0.95) and OCR (0.70) both exist, diff 0.25 → dispute
       → User sees: "API says 3.75h/£58.50, OCR says 3.5h/£55. Manual says 4h/£60."
       → User taps API → confidence set to 1.0, promoted to ledger.
```

## IndexedDB Local Storage

Single database `driver_buddy` with eight object stores:

```
shift_evidence      (key: id, index: resolved_to_ledger_id)
expense_evidence    (key: id, index: resolved_to_ledger_id)
mileage_evidence    (key: id, index: resolved_to_ledger_id)
shifts              (key: id)
expenses            (key: id)
trips               (key: id)
settings            (key: "singleton")
player_stats        (key: "singleton")
```

Active session and completed shift summary remain ephemeral React state — not persisted.

### localStorage Migration

On first load after deployment:

1. Read all 7 localStorage keys (`driver_trips`, `driver_expenses`, `driver_daily_logs`, etc.)
2. Convert each record to the appropriate evidence or ledger store
3. Existing records become ledger entries with `resolved_from_evidence: []`, `user_override: false`
4. Set `_migrated_v1` flag in IndexedDB
5. Clear migrated localStorage keys

Migration is one-way and non-destructive (localStorage keys are cleared only after successful IndexedDB write).

## Sync Protocol Changes

### Push (client → Worker)

```
POST /sync/push
{
  evidence: {
    shifts: [...],      // unresolved evidence (resolved_to_ledger_id IS NULL)
    expenses: [...],
    mileage: [...]
  },
  ledger: {
    shifts: [...],      // ledger changes since last_sync_at
    expenses: [...],
    trips: [...],
    settings: {...}
  },
  last_sync_at: "2026-05-10T08:00:00Z"
}
```

Worker response:

```json
{
  "promoted": { "shifts": ["id1"], "expenses": [], "trips": [] },
  "disputes": [{ "entity": "shift", "date": "2026-05-09", "evidence_ids": ["e1", "e2"] }],
  "corrections": { "shifts": [...], "expenses": [...], "trips": [...] },
  "server_time": "2026-05-10T12:00:00Z"
}
```

### Pull (Worker → client)

```
GET /sync/pull?since=2026-05-10T08:00:00Z
```

Returns full ledger state + unresolved evidence since the given timestamp. Client replaces local ledger with server ledger (Worker is authoritative) and surfaces any disputes.

## UI Integration

### Dispute Resolution

Disputed entries show an amber badge: "Review needed." Tapping opens a bottom sheet listing each evidence record with source icon, values, and confidence. User selects one or enters their own. Selection promotes that evidence to confidence 1.0 and resolves the dispute.

### Evidence Trail

Each ledger entry shows its provenance: "Based on Uber API (95% confidence). 2 other sources agree within 5%." For user-overridden entries: "Manually set by you — won't be changed by imports."

### Empty State (new users)

When zero shifts exist AND a backup code is present in storage, show "Restore from cloud" alongside "Log your first shift."

## Edge Cases

**Offline evidence storm.** Driver enters multiple shifts and receipts while offline. All sit locally in IndexedDB. On reconnect, push sends everything in batch. Worker reconciles and returns results. Client updates ledger in a single merge — no UI flicker.

**Worker unreachable for days.** Client continues local reconciliation. When Worker returns, its reconciliation is authoritative. Client corrects to match. User sees a one-time "Updated from cloud" banner.

**Duplicate evidence from same source.** OCR engine runs twice on the same screenshot. Same-source dedup catches it — newer replaces older, no dispute.

**API contradicts old user override.** User override (confidence 1.0) is permanent. API evidence is stored for audit but auto-resolves to the user's ledger entry without creating a dispute.

## Implementation Notes

- `usePersistence` evolves to `useStorage` — same debounced write pattern (500ms), async IndexedDB puts instead of sync localStorage sets
- Use `idb` library (2KB) for clean IndexedDB promises — already a transitive dependency
- Migration runs inside `useHydration` — happens once before any component renders
- Worker reconciliation is deterministic — same rules, same inputs → same output. This guarantees client and server converge.
- All three evidence types (shifts, expenses, mileage) use the same reconciliation engine with entity-specific field diffing
