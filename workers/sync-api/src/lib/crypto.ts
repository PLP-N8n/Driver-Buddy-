export interface CryptoEnv {
  PLAID_TOKEN_KEY: string;
  PLAID_TOKEN_KEY_V2?: string;
}

const KEY_CACHE = new Map<string, CryptoKey>();
const KID_V1 = 0x01;
const KID_V2 = 0x02;
const IV_BYTES = 12;

function hexToBytes(hex: string): Uint8Array {
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error('PLAID_TOKEN_KEY must be 32 bytes encoded as 64 hex characters');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importTokenKey(hex: string): Promise<CryptoKey> {
  const cached = KEY_CACHE.get(hex);
  if (cached) return cached;

  const key = await crypto.subtle.importKey('raw', hexToBytes(hex), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  KEY_CACHE.set(hex, key);
  return key;
}

function keyForKid(kid: number, env: CryptoEnv): string {
  if (kid === KID_V1) return env.PLAID_TOKEN_KEY;
  if (kid === KID_V2 && env.PLAID_TOKEN_KEY_V2) return env.PLAID_TOKEN_KEY_V2;
  throw new Error(`Unsupported Plaid token key id: ${kid}`);
}

export async function encryptToken(plaintext: string, env: CryptoEnv): Promise<string> {
  const key = await importTokenKey(env.PLAID_TOKEN_KEY);
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)));
  const output = new Uint8Array(1 + iv.length + ciphertext.length);
  output[0] = KID_V1;
  output.set(iv, 1);
  output.set(ciphertext, 1 + iv.length);
  return bytesToBase64(output);
}

export async function decryptToken(blob: string, env: CryptoEnv): Promise<string> {
  const input = base64ToBytes(blob);
  if (input.length <= 1 + IV_BYTES) {
    throw new Error('Invalid encrypted Plaid token');
  }

  const kid = input[0] ?? 0;
  const iv = input.slice(1, 1 + IV_BYTES);
  const ciphertext = input.slice(1 + IV_BYTES);
  const key = await importTokenKey(keyForKid(kid, env));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
