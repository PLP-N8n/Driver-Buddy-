import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openDriverBuddyDB, putShift, getAllShifts, putEvidence, getUnresolvedEvidence } from './storage';
import type { ShiftEvidence } from '../types';

const DB_NAME = 'driver_buddy_test';

beforeEach(async () => {
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
