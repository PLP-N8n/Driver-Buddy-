/**
 * OPFS (Origin Private File System) storage for DriverTax Pro.
 * Provides structured /drivertax/receipts/, /drivertax/exports/, /drivertax/backups/ directories.
 * Falls back gracefully if OPFS is unavailable.
 */

const OPFS_SUPPORTED = typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;

async function getRootDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!OPFS_SUPPORTED) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('drivertax', { create: true });
  } catch {
    return null;
  }
}

export async function initOPFS(): Promise<boolean> {
  const root = await getRootDir();
  if (!root) return false;
  try {
    await root.getDirectoryHandle('receipts', { create: true });
    await root.getDirectoryHandle('exports', { create: true });
    await root.getDirectoryHandle('backups', { create: true });
    return true;
  } catch {
    return false;
  }
}

export async function saveReceiptOPFS(id: string, blob: Blob): Promise<boolean> {
  const root = await getRootDir();
  if (!root) return false;
  try {
    const receiptsDir = await root.getDirectoryHandle('receipts', { create: true });
    const fileHandle = await receiptsDir.getFileHandle(`${id}.bin`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function getReceiptOPFS(id: string): Promise<Blob | null> {
  const root = await getRootDir();
  if (!root) return null;
  try {
    const receiptsDir = await root.getDirectoryHandle('receipts', { create: false });
    const fileHandle = await receiptsDir.getFileHandle(`${id}.bin`);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function deleteReceiptOPFS(id: string): Promise<void> {
  const root = await getRootDir();
  if (!root) return;
  try {
    const receiptsDir = await root.getDirectoryHandle('receipts', { create: false });
    await receiptsDir.removeEntry(`${id}.bin`);
  } catch {
    // File may not exist - ignore
  }
}

export async function saveExportOPFS(filename: string, content: string): Promise<boolean> {
  const root = await getRootDir();
  if (!root) return false;
  try {
    const exportsDir = await root.getDirectoryHandle('exports', { create: true });
    const fileHandle = await exportsDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function listReceiptsOPFS(): Promise<string[]> {
  const root = await getRootDir();
  if (!root) return [];
  try {
    const receiptsDir = await root.getDirectoryHandle('receipts', { create: false });
    const ids: string[] = [];
    for await (const [name] of receiptsDir.entries()) {
      ids.push(name.replace('.bin', ''));
    }
    return ids;
  } catch {
    return [];
  }
}
