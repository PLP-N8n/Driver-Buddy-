import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import syncWorker from '../workers/sync-api/src/index';
import { handleOptions, isAllowedOrigin, withCorsHeaders } from '../workers/sync-api/src/lib/cors';
import { issueSessionToken } from '../workers/sync-api/src/lib/session';
import { handleAuthRegister, handleAuthSession } from '../workers/sync-api/src/routes/auth';
import { handleEvents } from '../workers/sync-api/src/routes/events';
import { handlePlaidStatus } from '../workers/sync-api/src/routes/plaid';
import { handleRequestUpload } from '../workers/sync-api/src/routes/receipts';
import { handleSyncPull, handleSyncPush } from '../workers/sync-api/src/routes/sync';

type FirstResult = Record<string, number | string | undefined> | null;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function issueTestSessionToken(deviceSecretHash: string, accountId = 'account-123'): Promise<string> {
  return issueSessionToken(accountId, deviceSecretHash, 'test-secret');
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
          if (sql.includes('SELECT 1 FROM account_devices')) {
            const hash = String(args[1]).toLowerCase();
            return devices.some((device) => device.toLowerCase() === hash) ? { found: 1 } : null;
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
    expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBeNull();

    const denied = handleOptions(
      new Request('https://worker.example.test/api/sync', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.invalid' },
      })
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('allows browser tracing headers on preflight requests', () => {
    const response = handleOptions(
      new Request('https://worker.example.test/sync/pull', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://drivertax.rudradigital.uk',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'x-device-id,x-session-token,sentry-trace,baggage',
        },
      })
    );

    const allowHeaders = response.headers.get('Access-Control-Allow-Headers')?.toLowerCase() ?? '';
    expect(response.status).toBe(204);
    expect(allowHeaders).toContain('x-device-id');
    expect(allowHeaders).toContain('x-session-token');
    expect(allowHeaders).toContain('sentry-trace');
    expect(allowHeaders).toContain('baggage');
  });

  it('can add CORS headers to an existing error response', async () => {
    const response = withCorsHeaders(
      new Request('https://worker.example.test/sync/pull', {
        headers: { Origin: 'https://drivertax.rudradigital.uk' },
      }),
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://drivertax.rudradigital.uk');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('keeps CORS headers on uncaught Worker exceptions', async () => {
    const origin = 'https://drivertax.rudradigital.uk';
    const response = await syncWorker.fetch(
      new Request('https://worker.example.test/api/events', {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'X-Device-ID': 'device-123',
        },
        body: JSON.stringify({ event: 'app_open' }),
      }),
      {
        DB: { prepare: vi.fn(() => { throw new Error('db unavailable'); }) } as unknown as D1Database,
        RECEIPTS: {} as R2Bucket,
        ANALYTICS: { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset,
        SESSION_SECRET: 'test-secret',
        ADMIN_TOKEN: 'admin-token',
        PLAID_TOKEN_KEY: 'test-key',
      }
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(await response.json()).toMatchObject({ error: 'internal error' });
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
        SESSION_SECRET: 'test-secret',
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
        SESSION_SECRET: 'test-secret',
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
        SESSION_SECRET: 'test-secret',
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
        SESSION_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expiresIn: 900 });
  });
});

describe('Worker receipt route', () => {
  it('returns a transparent 503 when upload presigning is unavailable', async () => {
    const deviceHash = '1'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
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
        DB: makeDb({ devices: [deviceHash], firstResult: { count: 0, oldest: Date.now() } }),
        RECEIPTS: {} as R2Bucket,
        SESSION_SECRET: 'test-secret',
      }
    );

    const body = (await response.json()) as { error?: string; retryAfter?: number; key?: string; uploadUrl?: string; maxBytes?: number; contentType?: string };
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('86400');
    expect(body).toMatchObject({
      error: 'presigned_urls_unavailable',
      retryAfter: 86400,
      uploadUrl: '',
    });
    expect(body.key).toMatch(/^receipts\/account-123\/\d+_fuel_receipt\.jpg$/);
    expect(body.maxBytes).toBe(5 * 1024 * 1024);
    expect(body.contentType).toBe('image/jpeg');
  });

  it('rejects SVG and HTML-like receipt uploads', async () => {
    const deviceHash = '1'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handleRequestUpload(
      new Request('https://worker.example.test/api/receipts/request-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'X-Session-Token': token,
        },
        body: JSON.stringify({
          filename: 'receipt.svg',
          contentType: 'image/svg+xml',
        }),
      }),
      {
        DB: makeDb({ devices: [deviceHash], firstResult: { count: 0, oldest: Date.now() } }),
        RECEIPTS: {} as R2Bucket,
        SESSION_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'receipt type not allowed' });
  });

  it('rejects oversized receipt uploads', async () => {
    const deviceHash = '1'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handleRequestUpload(
      new Request('https://worker.example.test/api/receipts/request-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'X-Session-Token': token,
        },
        body: JSON.stringify({
          filename: 'huge_receipt.jpg',
          contentType: 'image/jpeg',
          byteSize: 6 * 1024 * 1024,
        }),
      }),
      {
        DB: makeDb({ devices: [deviceHash], firstResult: { count: 0, oldest: Date.now() } }),
        RECEIPTS: {} as R2Bucket,
        SESSION_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'receipt exceeds 5 MB limit' });
  });

  it('rejects encoded traversal receipt keys before touching R2', async () => {
    const r2Get = vi.fn();
    const dbPrepare = vi.fn(() => {
      throw new Error('DB should not be touched for invalid receipt keys');
    });
    const response = await syncWorker.fetch(
      new Request('https://worker.example.test/api/receipts/receipts/account-123/..%2F..%2Freceipts/other-account/key', {
        method: 'GET',
      }),
      {
        DB: { prepare: dbPrepare } as unknown as D1Database,
        RECEIPTS: { get: r2Get } as unknown as R2Bucket,
        ANALYTICS: { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset,
        SESSION_SECRET: 'test-secret',
        ADMIN_TOKEN: 'admin-token',
        PLAID_TOKEN_KEY: 'test-key',
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid receipt key' });
    expect(dbPrepare).not.toHaveBeenCalled();
    expect(r2Get).not.toHaveBeenCalled();
  });
});

describe('Worker sync route', () => {
  it('does not replace shift earnings when the incoming parent shift is stale', async () => {
    const deviceHash = '3'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const executedSql: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn(async () => {
            executedSql.push(sql);
            return {};
          }),
          first: vi.fn(async () => {
            if (sql.includes('rate_limit_log')) {
              return { count: 0, oldest: Date.now() };
            }
            if (sql.includes('SELECT 1 FROM account_devices')) {
              return String(args[1]).toLowerCase() === deviceHash ? { found: 1 } : null;
            }
            if (sql.includes('SELECT updated_at FROM shifts')) {
              return { updated_at: 2_000 };
            }
            return null;
          }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      })),
    } as unknown as D1Database;

    const response = await handleSyncPush(
      new Request('https://worker.example.test/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': token,
        },
        body: JSON.stringify({
          shifts: [
            {
              id: 'shift-1',
              date: '2026-05-04',
              status: 'completed',
              updated_at: 1_000,
            },
          ],
          shiftEarnings: [
            {
              id: 'earning-1',
              shift_id: 'shift-1',
              platform: 'uber',
              amount: 42,
              job_count: 3,
            },
          ],
        }),
      }),
      {
        DB: db,
        SESSION_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(200);
    expect(executedSql.some((sql) => sql.includes('DELETE FROM shift_earnings'))).toBe(false);
    expect(executedSql.some((sql) => sql.includes('INSERT INTO shift_earnings'))).toBe(false);
    expect(executedSql.some((sql) => sql.startsWith('INSERT INTO shifts'))).toBe(false);
  });

  it('rejects sync payloads exceeding content-length limit', async () => {
    const deviceHash = '3'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handleSyncPush(
      new Request('https://worker.example.test/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': token,
          'Content-Length': String(11 * 1024 * 1024),
        },
        body: JSON.stringify({ workLogs: [] }),
      }),
      {
        DB: makeDb({ devices: [deviceHash] }),
        SESSION_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'payload too large' });
  });

  it('rejects sync payloads with too many rows per entity', async () => {
    const deviceHash = '3'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handleSyncPush(
      new Request('https://worker.example.test/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': token,
        },
        body: JSON.stringify({
          workLogs: Array.from({ length: 5_001 }, (_, i) => ({ id: `w${i}`, date: '2026-01-01' })),
        }),
      }),
      {
        DB: makeDb({ devices: [deviceHash] }),
        SESSION_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'too many workLogs' });
  });

  it('rejects sync payloads with oversized string fields', async () => {
    const deviceHash = '3'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handleSyncPush(
      new Request('https://worker.example.test/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': token,
        },
        body: JSON.stringify({
          workLogs: [{ id: 'w1', date: '2026-01-01', notes: 'a'.repeat(10_001) }],
        }),
      }),
      {
        DB: makeDb({ devices: [deviceHash] }),
        SESSION_SECRET: 'test-secret',
      }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'field notes exceeds max length' });
  });
});

describe('Worker events route', () => {
  it('rate limits analytics events per device or IP', async () => {
    const response = await handleEvents(
      new Request('https://worker.example.test/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'CF-Connecting-IP': '203.0.113.10',
          'X-Device-ID': 'device-123',
        },
        body: JSON.stringify({ event: 'app_open' }),
      }),
      {
        DB: makeDb({ count: 60, oldest: Date.now() - 30_000 }),
        ANALYTICS: { writeDataPoint: vi.fn() } as unknown as AnalyticsEngineDataset,
      }
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: 'too many requests' });
  });
});

describe('Worker actual response CORS headers', () => {
  const extraOrigin = 'https://preview.example';

  it('allows extra configured origins on sync pull responses', async () => {
    const deviceHash = 'f'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handleSyncPull(
      new Request('https://worker.example.test/api/sync/pull', {
        method: 'GET',
        headers: {
          Origin: extraOrigin,
          'X-Session-Token': token,
        },
      }),
      {
        DB: makeDb({ devices: [deviceHash] }),
        SESSION_SECRET: 'test-secret',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(extraOrigin);
  });

  it('allows extra configured origins on receipt responses', async () => {
    const deviceHash = '2'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
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
        DB: makeDb({ devices: [deviceHash] }),
        RECEIPTS: {} as R2Bucket,
        SESSION_SECRET: 'test-secret',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(extraOrigin);
  });

  it('rejects receipt upload when a valid X-Session-Token belongs to an account with no registered devices', async () => {
    const token = await issueTestSessionToken('3'.repeat(64));
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
        DB: makeDb({ devices: [], firstResult: { count: 0, oldest: Date.now() } }),
        RECEIPTS: {} as R2Bucket,
        SESSION_SECRET: 'test-secret',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('allows extra configured origins on Plaid status responses', async () => {
    const deviceHash = 'a'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handlePlaidStatus(
      new Request('https://worker.example.test/api/plaid/status', {
        method: 'GET',
        headers: {
          Origin: extraOrigin,
          'X-Session-Token': token,
        },
      }),
      {
        DB: makeDb({ devices: [deviceHash], plaidConnection: null }),
        SESSION_SECRET: 'test-secret',
        PLAID_TOKEN_KEY: 'test-key',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(extraOrigin);
    expect(await response.json()).toMatchObject({ connected: false });
  });

  it('rejects sync pull when a valid X-Session-Token belongs to an account with no registered devices', async () => {
    const token = await issueTestSessionToken('4'.repeat(64));
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
        SESSION_SECRET: 'test-secret',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('rejects bearer auth when a valid token belongs to an account with no registered devices', async () => {
    const token = await issueTestSessionToken('5'.repeat(64));
    const response = await handlePlaidStatus(
      new Request('https://worker.example.test/api/plaid/status', {
        method: 'GET',
        headers: {
          Origin: extraOrigin,
          Authorization: `Bearer ${token}`,
        },
      }),
      {
        DB: makeDb({ devices: [], plaidConnection: null }),
        SESSION_SECRET: 'test-secret',
        PLAID_TOKEN_KEY: 'test-key',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('rejects bearer auth when the token device was deleted but another device remains', async () => {
    const token = await issueTestSessionToken('6'.repeat(64));
    const response = await handlePlaidStatus(
      new Request('https://worker.example.test/api/plaid/status', {
        method: 'GET',
        headers: {
          Origin: extraOrigin,
          Authorization: `Bearer ${token}`,
        },
      }),
      {
        DB: makeDb({ devices: ['7'.repeat(64)], plaidConnection: null }),
        SESSION_SECRET: 'test-secret',
        PLAID_TOKEN_KEY: 'test-key',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('accepts bearer auth when the token device is still registered', async () => {
    const deviceHash = 'b'.repeat(64);
    const token = await issueTestSessionToken(deviceHash);
    const response = await handlePlaidStatus(
      new Request('https://worker.example.test/api/plaid/status', {
        method: 'GET',
        headers: {
          Origin: extraOrigin,
          Authorization: `Bearer ${token}`,
        },
      }),
      {
        DB: makeDb({ devices: [deviceHash], plaidConnection: null }),
        SESSION_SECRET: 'test-secret',
        PLAID_TOKEN_KEY: 'test-key',
        EXTRA_ALLOWED_ORIGINS: extraOrigin,
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ connected: false });
  });
});
