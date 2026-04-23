import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, ExpenseCategory, type SyncPullPayload } from '../types';

vi.mock('./sessionManager', () => ({
  buildAuthHeaders: vi.fn(async () => ({ 'X-Session-Token': 'test-token' })),
}));

vi.mock('./deviceId', () => ({
  getDeviceId: vi.fn(() => 'device-123'),
}));

vi.mock('./analyticsService', () => ({
  trackEvent: vi.fn(),
}));

describe('syncService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_SYNC_WORKER_URL', 'https://sync.test');
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  afterEach(async () => {
    const service = await import('./syncService');
    service.resetSyncServiceForTests();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('a failed push after 3 retries emits error status and does not loop forever', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network failed'));
    vi.stubGlobal('fetch', fetchMock);

    const service = await import('./syncService');
    const statuses: string[] = [];
    service.onSyncStatus((status) => statuses.push(status));

    service.schedulePush({ expenses: ['queued'] });

    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(statuses.at(-1)).toBe('error');
    expect(statuses.filter((status) => status === 'error').length).toBeGreaterThan(0);
  });

  it('a successful push clears the queue', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = await import('./syncService');

    service.schedulePush({ version: 1 });
    service.schedulePush({ version: 2 });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({ version: 2 });
    await expect(service.retryPendingPush()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pull merges remote data without overwriting newer local entries', async () => {
    const remotePayload: SyncPullPayload = {
      mileageLogs: [
        {
          id: 'trip-1',
          date: '2026-04-03',
          description: JSON.stringify({
            startLocation: 'Remote start',
            endLocation: 'Remote end',
            startOdometer: 900,
            endOdometer: 930,
            notes: 'Remote older trip',
            purpose: 'Business',
          }),
          miles: 30,
          trip_type: 'Business',
        },
        {
          id: 'trip-2',
          date: '2026-04-04',
          description: JSON.stringify({
            startLocation: 'New remote start',
            endLocation: 'New remote end',
            startOdometer: 930,
            endOdometer: 950,
            notes: 'New remote trip',
            purpose: 'Business',
          }),
          miles: 20,
          trip_type: 'Business',
        },
      ],
      workLogs: [
        {
          id: 'log-1',
          date: '2026-04-03',
          platform: 'Uber',
          hours: 4,
          earnings: 100,
          notes: JSON.stringify({ notes: 'Remote older log' }),
        },
      ],
      expenses: [
        {
          id: 'expense-1',
          date: '2026-04-03',
          category: 'Fuel',
          amount: 12,
          description: JSON.stringify({ description: 'Remote older expense' }),
          has_image: 0,
        },
        {
          id: 'expense-2',
          date: '2026-04-04',
          category: 'Parking/Tolls',
          amount: 18,
          description: JSON.stringify({ description: 'Remote parking expense' }),
          has_image: 0,
        },
      ],
      settings: {
        claimMethod: 'ACTUAL',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn(async () => remotePayload),
      })
    );

    const service = await import('./syncService');
    const merged = await service.pullAndMerge(
      {
        trips: [
          {
            id: 'trip-1',
            date: '2026-04-05',
            startLocation: 'Local start',
            endLocation: 'Local end',
            startOdometer: 1000,
            endOdometer: 1040,
            totalMiles: 40,
            purpose: 'Business',
            notes: 'Local newer trip',
          },
        ],
        dailyLogs: [
          {
            id: 'log-1',
            date: '2026-04-05',
            provider: 'Bolt',
            hoursWorked: 6,
            revenue: 160,
            notes: 'Local newer log',
          },
        ],
        expenses: [
          {
            id: 'expense-1',
            date: '2026-04-05',
            category: ExpenseCategory.FUEL,
            amount: 25,
            description: 'Local newer expense',
            hasReceiptImage: false,
          },
        ],
        settings: DEFAULT_SETTINGS,
      },
      'device-123'
    );

    expect(merged).not.toBeNull();
    expect(merged?.trips).toHaveLength(2);
    expect(merged?.dailyLogs).toHaveLength(1);
    expect(merged?.expenses).toHaveLength(2);
    expect(merged?.trips.find((trip) => trip.id === 'trip-1')?.notes).toBe('Local newer trip');
    expect(merged?.dailyLogs.find((log) => log.id === 'log-1')?.notes).toBe('Local newer log');
    expect(merged?.expenses.find((expense) => expense.id === 'expense-1')?.amount).toBe(25);
    expect(merged?.settings.claimMethod).toBe('ACTUAL');
  });

  it('pull keeps newer local settings when remote settings are stale', async () => {
    const staleRemoteSettings = {
      claimMethod: 'ACTUAL' as const,
      updatedAt: '2026-04-01T10:00:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn(async () => ({ settings: staleRemoteSettings } satisfies SyncPullPayload)),
      })
    );

    const service = await import('./syncService');
    const merged = await service.pullAndMerge(
      {
        trips: [],
        dailyLogs: [],
        expenses: [],
        settings: {
          ...DEFAULT_SETTINGS,
          claimMethod: 'SIMPLIFIED',
          updatedAt: '2026-04-02T10:00:00.000Z',
        },
      },
      'device-123'
    );

    expect(merged?.settings.claimMethod).toBe('SIMPLIFIED');
    expect(merged?.settings.updatedAt).toBe('2026-04-02T10:00:00.000Z');
  });

  it('pull applies newer remote settings when updated_at is newer', async () => {
    const newerRemoteSettings = {
      claimMethod: 'ACTUAL' as const,
      updatedAt: '2026-04-03T10:00:00.000Z',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn(async () => ({ settings: newerRemoteSettings } satisfies SyncPullPayload)),
      })
    );

    const service = await import('./syncService');
    const merged = await service.pullAndMerge(
      {
        trips: [],
        dailyLogs: [],
        expenses: [],
        settings: {
          ...DEFAULT_SETTINGS,
          claimMethod: 'SIMPLIFIED',
          updatedAt: '2026-04-02T10:00:00.000Z',
        },
      },
      'device-123'
    );

    expect(merged?.settings.claimMethod).toBe('ACTUAL');
    expect(merged?.settings.updatedAt).toBe('2026-04-03T10:00:00.000Z');
  });
});
