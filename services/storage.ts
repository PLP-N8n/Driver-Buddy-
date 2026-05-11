import { openDB, type IDBPDatabase } from 'idb';
import type { ShiftEvidence, ExpenseEvidence, MileageEvidence } from '../types';

const DB_VERSION = 1;

export function openDriverBuddyDB(name = 'driver_buddy') {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('shifts')) {
        db.createObjectStore('shifts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('expenses')) {
        db.createObjectStore('expenses', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('trips')) {
        db.createObjectStore('trips', { keyPath: 'id' });
      }
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

export type EvidenceStoreName = 'shift_evidence' | 'expense_evidence' | 'mileage_evidence';

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

export function deleteDatabase(name = 'driver_buddy'): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
