import { beforeEach, describe, expect, it, vi } from 'vitest';

const receiptStore = new Map<string, Blob>();

function createFakeIndexedDB() {
  const imageRows = new Map<string, { id: string; blob: Blob; savedAt: number }>();

  return {
    open: vi.fn(() => {
      const request: {
        error?: Error | null;
        onsuccess?: (() => void) | null;
        onerror?: (() => void) | null;
        onupgradeneeded?: ((event: { target: { result: { createObjectStore: () => void; objectStoreNames: { contains: () => boolean } } } }) => void) | null;
        result?: {
          createObjectStore: () => void;
          objectStoreNames: { contains: () => boolean };
          transaction: () => {
            error: null;
            oncomplete?: (() => void) | null;
            onerror?: (() => void) | null;
            objectStore: () => {
              delete: (id: string) => void;
              get: (id: string) => { error?: Error | null; onsuccess?: (() => void) | null; onerror?: (() => void) | null; result?: { id: string; blob: Blob; savedAt: number } };
              getAllKeys: () => { error?: Error | null; onsuccess?: (() => void) | null; onerror?: (() => void) | null; result?: string[] };
              put: (value: { id: string; blob: Blob; savedAt: number }) => void;
            };
          };
        };
      } = {};

      request.result = {
        createObjectStore: () => undefined,
        objectStoreNames: {
          contains: () => true,
        },
        transaction: () => {
          const tx: {
            error: null;
            oncomplete?: (() => void) | null;
            onerror?: (() => void) | null;
            objectStore: () => {
              delete: (id: string) => void;
              get: (id: string) => { error?: Error | null; onsuccess?: (() => void) | null; onerror?: (() => void) | null; result?: { id: string; blob: Blob; savedAt: number } };
              getAllKeys: () => { error?: Error | null; onsuccess?: (() => void) | null; onerror?: (() => void) | null; result?: string[] };
              put: (value: { id: string; blob: Blob; savedAt: number }) => void;
            };
          } = {
            error: null,
            objectStore: () => ({
              put: (value) => {
                imageRows.set(value.id, value);
              },
              get: (id) => {
                const rowRequest: {
                  error?: Error | null;
                  onsuccess?: (() => void) | null;
                  onerror?: (() => void) | null;
                  result?: { id: string; blob: Blob; savedAt: number };
                } = {
                  result: imageRows.get(id),
                };
                queueMicrotask(() => rowRequest.onsuccess?.());
                return rowRequest;
              },
              delete: (id) => {
                imageRows.delete(id);
              },
              getAllKeys: () => {
                const rowRequest: {
                  error?: Error | null;
                  onsuccess?: (() => void) | null;
                  onerror?: (() => void) | null;
                  result?: string[];
                } = {
                  result: [...imageRows.keys()],
                };
                queueMicrotask(() => rowRequest.onsuccess?.());
                return rowRequest;
              },
            }),
          };

          queueMicrotask(() => tx.oncomplete?.());
          return tx;
        },
      };

      queueMicrotask(() => request.onsuccess?.());
      return request;
    }),
  };
}

vi.mock('./opfsStore', () => ({
  deleteReceiptOPFS: vi.fn(async (id: string) => {
    receiptStore.delete(id);
  }),
  getReceiptOPFS: vi.fn(async (id: string) => receiptStore.get(id) ?? null),
  saveReceiptOPFS: vi.fn(async (id: string, blob: Blob) => {
    receiptStore.set(id, blob);
    return true;
  }),
}));

describe('imageStore', () => {
  beforeEach(() => {
    receiptStore.clear();
    vi.stubGlobal('indexedDB', createFakeIndexedDB());
  });

  it('storing a receipt returns a key', async () => {
    const { getReceipt, storeReceipt } = await import('./imageStore');
    const blob = new Blob(['receipt-bytes'], { type: 'image/png' });

    const key = await storeReceipt(blob, 'receipt-1');
    const storedBlob = await getReceipt(key);

    expect(key).toBe('receipt-1');
    expect(storedBlob).not.toBeNull();
  });

  it('retrieving a non-existent key returns null', async () => {
    const { getReceipt } = await import('./imageStore');

    await expect(getReceipt('missing-receipt')).resolves.toBeNull();
  });

  it('deleting a receipt removes it', async () => {
    const { deleteReceipt, getReceipt, storeReceipt } = await import('./imageStore');
    const blob = new Blob(['receipt-bytes'], { type: 'image/png' });

    const key = await storeReceipt(blob, 'receipt-2');
    await deleteReceipt(key);

    await expect(getReceipt(key)).resolves.toBeNull();
  });
});
