import { buildAuthHeaders } from './sessionManager';
import { deleteReceiptOPFS, getReceiptOPFS, saveReceiptOPFS } from './opfsStore';
import { setStatus } from './uploadStatusStore';

const DB_NAME = 'drivertax-images';
const DB_VERSION = 1;
const STORE_NAME = 'receipt-images';

function getStoredReceiptReference(id: string): { receiptId?: string; receiptUrl?: string } | null {
  try {
    const rawValue = localStorage.getItem('driver_expenses');
    if (!rawValue) return null;

    const expenses = JSON.parse(rawValue) as Array<{ id: string; receiptId?: string; receiptUrl?: string }>;
    const expense = expenses.find((item) => item.id === id);
    return expense ?? null;
  } catch {
    return null;
  }
}

async function fetchBlobFromUrl(url: string): Promise<Blob | null> {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveImage(id: string, blob: Blob): Promise<void> {
  const savedToOPFS = await saveReceiptOPFS(id, blob);
  if (savedToOPFS) return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, blob, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function storeReceipt(blob: Blob, key: string = crypto.randomUUID()): Promise<string> {
  await saveImage(key, blob);
  return key;
}

export async function getImage(id: string): Promise<Blob | null> {
  const opfsBlob = await getReceiptOPFS(id);
  if (opfsBlob) return opfsBlob;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

export const getReceipt = getImage;

export async function getImageWithRemoteFallback(id: string, receiptUrl?: string): Promise<Blob | null> {
  const localBlob = await getImage(id);
  if (localBlob) return localBlob;

  const storedReference = getStoredReceiptReference(id);
  const remoteReceiptId = storedReference?.receiptId;
  const legacyReceiptUrl = receiptUrl ?? storedReference?.receiptUrl;

  let remoteBlob: Blob | null = null;

  if (remoteReceiptId && isR2UploadConfigured()) {
    remoteBlob = await readRemoteReceipt(remoteReceiptId);
  }

  if (!remoteBlob && legacyReceiptUrl) {
    remoteBlob = await fetchBlobFromUrl(legacyReceiptUrl);
  }

  if (!remoteBlob) return null;

  await saveImage(id, remoteBlob);
  return remoteBlob;
}

export async function deleteImage(id: string): Promise<void> {
  await deleteReceiptOPFS(id);

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const deleteReceipt = deleteImage;

export async function getAllImageIds(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

export function isR2UploadConfigured(): boolean {
  return !!import.meta.env.VITE_SYNC_WORKER_URL;
}

export async function requestReceiptUpload(
  blob: Blob,
  expenseId: string,
  filename: string
): Promise<{ receiptId?: string; status: 'synced' | 'local-only' | 'failed'; errorReason?: string } | null> {
  const workerUrl = import.meta.env.VITE_SYNC_WORKER_URL;
  if (!workerUrl) return null;

  const auth = await buildAuthHeaders();
  if (!auth.ok) return null;
  const headers = auth.headers;

  await setStatus(expenseId, { status: 'uploading', lastAttemptAt: Date.now(), errorReason: undefined });

  try {
    const res = await fetch(`${workerUrl}/api/receipts/request-upload`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        contentType: blob.type || 'image/jpeg',
      }),
    });

    if (res.status === 503) {
      await setStatus(expenseId, {
        status: 'local-only',
        lastAttemptAt: Date.now(),
        errorReason: 'presigned_urls_unavailable',
        suppressRetryUntil: Date.now() + 86_400_000,
      });
      return { status: 'local-only', errorReason: 'presigned_urls_unavailable' };
    }

    if (!res.ok) {
      const errorReason = `http_${res.status}`;
      await setStatus(expenseId, { status: 'failed', lastAttemptAt: Date.now(), errorReason });
      return { status: 'failed', errorReason };
    }

    const { uploadUrl, key } = (await res.json()) as { uploadUrl?: string; key?: string };
    if (!uploadUrl || !key) {
      await setStatus(expenseId, { status: 'failed', lastAttemptAt: Date.now(), errorReason: 'missing_upload_url' });
      return { status: 'failed', errorReason: 'missing_upload_url' };
    }

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
      },
      body: blob,
    });

    if (!uploadRes.ok) {
      const errorReason = `upload_http_${uploadRes.status}`;
      await setStatus(expenseId, { status: 'failed', lastAttemptAt: Date.now(), errorReason });
      return { status: 'failed', errorReason };
    }

    await setStatus(expenseId, { status: 'synced', lastAttemptAt: Date.now(), errorReason: undefined, suppressRetryUntil: undefined });
    return { receiptId: key, status: 'synced' };
  } catch {
    await setStatus(expenseId, { status: 'failed', lastAttemptAt: Date.now(), errorReason: 'network' });
    return { status: 'failed', errorReason: 'network' };
  }
}

export async function readRemoteReceipt(receiptId: string): Promise<Blob | null> {
  const workerUrl = import.meta.env.VITE_SYNC_WORKER_URL;
  if (!workerUrl) return null;

  const auth = await buildAuthHeaders();
  if (!auth.ok) return null;
  const headers = auth.headers;

  const encodedKey = encodeURIComponent(receiptId);
  const res = await fetch(`${workerUrl}/api/receipts/${encodedKey}`, {
    headers,
  });

  if (!res.ok) return null;

  const contentType = res.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { url?: string };
    if (!data.url) return null;

    const blobRes = await fetch(data.url);
    if (!blobRes.ok) return null;
    return await blobRes.blob();
  }

  return await res.blob();
}

export async function deleteRemoteReceipt(receiptId: string): Promise<void> {
  const workerUrl = import.meta.env.VITE_SYNC_WORKER_URL;
  if (!workerUrl) return;

  const auth = await buildAuthHeaders();
  if (!auth.ok) return;
  const headers = auth.headers;

  const encodedKey = encodeURIComponent(receiptId);
  await fetch(`${workerUrl}/api/receipts/${encodedKey}`, {
    method: 'DELETE',
    headers,
  });
}

export async function migrateLegacyReceipt(legacyUrl: string): Promise<string | null> {
  const workerUrl = import.meta.env.VITE_SYNC_WORKER_URL;
  if (!workerUrl) return null;

  const auth = await buildAuthHeaders();
  if (!auth.ok) return null;
  const headers = auth.headers;

  try {
    const res = await fetch(`${workerUrl}/api/receipts/migrate-legacy`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ legacyUrl }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { key: string };
    return data.key;
  } catch {
    return null;
  }
}
