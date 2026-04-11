const ACCOUNT_ID_KEY = 'drivertax_device_id';
const DEVICE_SECRET_KEY = 'driver_device_secret';
const DEVICE_SECRET_LENGTH_BYTES = 32;

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const randomValue = (Math.random() * 16) | 0;
    return (character === 'x' ? randomValue : ((randomValue & 0x3) | 0x8)).toString(16);
  });
}

function randomHex(byteLength: number): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  return Array.from({ length: byteLength }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}

export function getAccountId(): string {
  let accountId = localStorage.getItem(ACCOUNT_ID_KEY);
  if (!accountId) {
    accountId = generateId();
    localStorage.setItem(ACCOUNT_ID_KEY, accountId);
  }
  return accountId;
}

export function getDeviceId(): string {
  return getAccountId();
}

export function getDeviceSecret(): string {
  let deviceSecret = localStorage.getItem(DEVICE_SECRET_KEY);
  if (!deviceSecret || !/^[0-9a-f]{64}$/i.test(deviceSecret)) {
    deviceSecret = randomHex(DEVICE_SECRET_LENGTH_BYTES);
    localStorage.setItem(DEVICE_SECRET_KEY, deviceSecret);
  }
  return deviceSecret;
}

export function getBackupCode(): string {
  return getAccountId();
}

export function restoreFromBackupCode(code: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(code)) return false;
  localStorage.setItem(ACCOUNT_ID_KEY, code);
  return true;
}
