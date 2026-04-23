import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./deviceId', () => ({
  getDeviceId: vi.fn(() => 'device-123'),
}));

describe('analyticsService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('VITE_SYNC_WORKER_URL', 'https://sync.example.test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not send events before analytics consent is granted', async () => {
    const { trackEvent } = await import('./analyticsService');

    trackEvent('app_open');
    await vi.advanceTimersByTimeAsync(2);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends events after analytics consent is granted', async () => {
    const { setAnalyticsConsent, trackEvent } = await import('./analyticsService');

    setAnalyticsConsent(true);
    trackEvent('expense_added', { category: 'Fuel' });
    await vi.advanceTimersByTimeAsync(2);

    expect(fetch).toHaveBeenCalledWith('https://sync.example.test/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': 'device-123',
      },
      body: JSON.stringify({
        event: 'expense_added',
        properties: { category: 'Fuel' },
      }),
    });
  });
});
