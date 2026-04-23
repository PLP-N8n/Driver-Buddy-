import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { handleOptions, isAllowedOrigin } from '../workers/sync-api/src/lib/cors';
import { issueSessionToken } from '../workers/sync-api/src/lib/session';
import { handleAuthRegister, handleAuthSession } from '../workers/sync-api/src/routes/auth';
import { handlePlaidStatus } from '../workers/sync-api/src/routes/plaid';
import { handleRequestUpload } from '../workers/sync-api/src/routes/receipts';
import { handleSyncPull } from '../workers/sync-api/src/routes/sync';

type FirstResult = Record<string, number | string | undefined> | null;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

type MockDbOptions = {
  firstResult?: FirstResult;
  devices?: string[];
  settings?: { data?: string } | null;
  plaidConnection?: FirstResult;
};

function makeDb(options: FirstResult | MockDbOptions): D1Database {
  const config: MockDbOptions = options && ('firstResult' in options || 'devices' in options || 'settings' in options || 'plaidConnection' in options)
    ? options
    : { firstResult: options as FirstResult };
  const devices = config.devices ?? [];

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        run: vi.fn(async () => {
          if (sql.includes('INSERT INTO account_devices')) {
            const hash = String(args[1]);
            if (!devices.includes(hash)) devices.push(hash);
          }
          return {};
        }),
        first: vi.fn(async () => {
          if (sql.includes('COUNT(*) as count') && sql.includes('account_devices')) {
            return { count: devices.length };
          }
          if (sql.includes('rate_limit_log')) {
            return config.firstResult ?? { count: 0, oldest: Date.now() };
          }
          if (sql.includes('settings')) {
            return config.settings ?? null;
          }
          if (sql.includes('plaid_connections')) {
            return config.plaidConnection ?? null;
          }
          return config.firstResult ?? null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('SELECT device_secret_hash FROM account_devices')) {
            return { results: devices.map((device_secret_hash) => ({ device_secret_hash })) };
          }
          return { results: [] };
        }),
      })),
    })),
  } as unknown as D1Database;
}

describe('Worker CORS routes', () => {
  it('allows configured local origins and rejects unknown preflight origins', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);

    const allowed = handleOptions(
      new Request('https://worker.example.test/api/sync', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000' },
      })
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');

    const denied = handleOptions(
      new Request('https://worker.example.test/api/sync', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.invalid' },
      })
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('Worker auth route', () => {
  it('returns retry guidance when register is rate limited', async () => {
    const response = await handleAuthRegister(
      new Request('https://worker.example.test/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'CF-Connecting-IP': '203.0.113.1',
        },
        body: JSON.stringify({
          accountId: 'account-123',
          deviceSecretHash: 'a'.repeat(64),
        }),
      }),
      {
        DB: makeDb({ count: 5, oldest: Date.now() - 30_000 }),
        RECEIPT_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(await response.json()).toMatchObject({ error: 'too many requests' });
  });

  it('registers the first device for an account', async () => {
    const response = await handleAuthRegister(
      new Request('https://worker.example.test/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'CF-Connecting-IP': '203.0.113.2',
        },
        body: JSON.stringify({
          accountId: 'account-123',
          deviceSecretHash: 'b'.repeat(64),
        }),
      }),
      {
        DB: makeDb({ devices: [] }),
        RECEIPT_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ registered: true, deviceCount: 1 });
  });

  it('rejects a different device secret after an account has registered devices', async () => {
    const response = await handleAuthRegister(
      new Request('https://worker.example.test/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'CF-Connecting-IP': '203.0.113.3',
        },
        body: JSON.stringify({
          accountId: 'account-123',
          deviceSecretHash: 'c'.repeat(64),
        }),
      }),
      {
        DB: makeDb({ devices: ['d'.repeat(64)] }),
        RECEIPT_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'account already has registered devices' });
  });

  it('issues a session for the exact registered backup secret', async () => {
    const registeredHash = 'e'.repeat(64);
    const timestamp = Date.now();
    const response = await handleAuthSession(
      new Request('https://worker.example.test/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'CF-Connecting-IP': '203.0.113.4',
        },
        body: JSON.stringify({
          accountId: 'account-123',
          timestamp,
          proof: sha256Hex(`${registeredHash}${timestamp}`),
        }),
      }),
      {
        DB: makeDb({ devices: [registeredHash] }),
        RECEIPT_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expiresIn: 3600 });
  });
});

describe('Worker receipt route', () => {
  it('returns a transparent 503 when upload presigning is unavailable', async () => {
    const token = await issueSessionToken('account-123', 'test-secret');
    const response = await handleRequestUpload(
      new Request('https://worker.example.test/api/receipts/request-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'X-Session-Token': token,
        },
        body: JSON.stringify({
          filename: 'fuel receipt.jpg',
          contentType: 'image/jpeg',
        }),
      }),
      {
        DB: makeDb({ count: 0, oldest: Date.now() }),
        RECEIPTS: {} as R2Bucket,
        RECEIPT_SECRET: 'test-secret',
      }
    );

    const body = (await response.json()) as { error?: string; retryAfter?: number; key?: string; uploadUrl?: string };
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('86400');
    expect(body).toMatchObject({
      error: 'presigned_urls_unavailable',
      retryAfter: 86400,
      uploadUrl: '',
    });
    expect(body.key).toMatch(/^receipts\/account-123\/\d+_fuel_receipt\.jpg$/);
  });
});

describe('Worker actual response CORS headers', () => {
  const extraOrigin = 'https://preview.example';

  it('allows extra configured origins on sync pull responses', async () => {
    const token = await issueSessionToken('account-123', 'test-secret');
    const response = await handleSyncPull(
      new Request('https://worker.example.test/api/sync/pull', {
        method: 'GET',
        headers: {
          Origin: extraOrigin,
          'X-Session-Token': token,
        },
      }),
      {
        DB: makeDb({ devices: [] }),
        RECEIPT_SECRET: 'test-secret',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(extraOrigin);
  });

  it('allows extra configured origins on receipt responses', async () => {
    const token = await issueSessionToken('account-123', 'test-secret');
    const response = await handleRequestUpload(
      new Request('https://worker.example.test/api/receipts/request-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: extraOrigin,
          'X-Session-Token': token,
        },
        body: JSON.stringify({
          filename: 'fuel receipt.jpg',
          contentType: 'image/jpeg',
        }),
      }),
      {
        DB: makeDb({ devices: [] }),
        RECEIPTS: {} as R2Bucket,
        RECEIPT_SECRET: 'test-secret',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(extraOrigin);
  });

  it('allows extra configured origins on Plaid status responses', async () => {
    const token = await issueSessionToken('account-123', 'test-secret');
    const response = await handlePlaidStatus(
      new Request('https://worker.example.test/api/plaid/status', {
        method: 'GET',
        headers: {
          Origin: extraOrigin,
          'X-Session-Token': token,
        },
      }),
      {
        DB: makeDb({ plaidConnection: null }),
        RECEIPT_SECRET: 'test-secret',
        PLAID_TOKEN_KEY: 'test-key',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(extraOrigin);
    expect(await response.json()).toMatchObject({ connected: false });
  });
});
