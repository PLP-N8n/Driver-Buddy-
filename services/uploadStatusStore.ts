const DB_NAME = 'drivertax-upload-status';
const DB_VERSION = 1;
const STORE_NAME = 'receipt-upload-status';

export type ReceiptUploadStatus = 'pending' | 'uploading' | 'synced' | 'failed' | 'local-only';

export type ReceiptUploadStatusRow = {
  expenseId: string;
  status: ReceiptUploadStatus;
  lastAttemptAt: number;
  errorReason?: string;
  suppressRetryUntil?: number;
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeUploadStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'expenseId' });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getStatus(expenseId: string): Promise<ReceiptUploadStatusRow | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(expenseId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function setStatus(
  expenseId: string,
  partial: Partial<Omit<ReceiptUploadStatusRow, 'expenseId'>>
): Promise<ReceiptUploadStatusRow> {
  const current = await getStatus(expenseId);
  const next: ReceiptUploadStatusRow = {
    expenseId,
    status: partial.status ?? current?.status ?? 'pending',
    lastAttemptAt: partial.lastAttemptAt ?? current?.lastAttemptAt ?? Date.now(),
    errorReason: partial.errorReason ?? current?.errorReason,
    suppressRetryUntil: partial.suppressRetryUntil ?? current?.suppressRetryUntil,
  };

  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emitChange();
  return next;
}

export async function listAll(): Promise<ReceiptUploadStatusRow[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function listByStatus(status: ReceiptUploadStatus): Promise<ReceiptUploadStatusRow[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('status').getAll(status);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function clearStatus(expenseId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(expenseId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  emitChange();
}
