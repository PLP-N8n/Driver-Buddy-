import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./deviceId', () => ({
  getAccountId: vi.fn(() => 'account-123'),
  getDeviceSecret: vi.fn(() => 'device-secret'),
}));

const jsonResponse = (body: unknown) => ({
  ok: true,
  json: vi.fn(async () => body),
});

describe('sessionManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_SYNC_WORKER_URL', 'https://sync.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('clearRegistrationCache(accountId) clears a matching cached session token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ deviceCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'cached-token', expiresAt: Date.now() + 60 * 60 * 1000 }))
      .mockResolvedValueOnce(jsonResponse({ deviceCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ token: 'fresh-token', expiresAt: Date.now() + 60 * 60 * 1000 }));
    vi.stubGlobal('fetch', fetchMock);

    const { clearRegistrationCache, getSessionToken } = await import('./sessionManager');

    await expect(getSessionToken('account-123', 'device-secret')).resolves.toBe('cached-token');
    clearRegistrationCache('account-123');

    await expect(getSessionToken('account-123', 'device-secret')).resolves.toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/session'))).toHaveLength(2);
  });
});
