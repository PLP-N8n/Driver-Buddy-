import React, { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type DailyWorkLog, type Expense, ExpenseCategory, type SyncPullPayload, type Trip } from '../types';
import { isSyncConfigured, pull, schedulePush } from '../services/syncService';
import { useSyncOrchestrator } from './useSyncOrchestrator';

vi.mock('./useConnectivity', () => ({
  useConnectivity: vi.fn(() => ({ isOnline: true, connectivityBanner: null })),
}));

vi.mock('../services/syncService', async () => {
  const actual = await vi.importActual<typeof import('../services/syncService')>('../services/syncService');

  return {
    ...actual,
    isSyncConfigured: vi.fn(() => true),
    onPushSuccess: vi.fn(() => () => undefined),
    onSyncStatus: vi.fn(() => () => undefined),
    pull: vi.fn(),
    retryPendingPush: vi.fn(async () => false),
    schedulePush: vi.fn(),
  };
});

type DeletedIdsState = {
  workLogs: string[];
  mileageLogs: string[];
  expenses: string[];
  shifts: string[];
};

const emptyDeletedIds: DeletedIdsState = {
  workLogs: [],
  mileageLogs: [],
  expenses: [],
  shifts: [],
};

const unmountHooks: Array<() => void> = [];

const flushAsyncEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

function renderSyncOrchestratorHook(options?: {
  deletedIds?: DeletedIdsState;
  expenses?: Expense[];
  dailyLogs?: DailyWorkLog[];
  trips?: Trip[];
}) {
  const hook = renderHook(() => {
    const [trips, setTrips] = useState<Trip[]>(options?.trips ?? []);
    const [expenses, setExpenses] = useState<Expense[]>(options?.expenses ?? []);
    const [dailyLogs, setDailyLogs] = useState<DailyWorkLog[]>(options?.dailyLogs ?? []);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);

    const sync = useSyncOrchestrator({
      trips,
      setTrips,
      expenses,
      setExpenses,
      dailyLogs,
      setDailyLogs,
      settings,
      setSettings,
      deletedIds: options?.deletedIds ?? emptyDeletedIds,
      hasHydrated: true,
    });

    return {
      ...sync,
      state: { trips, expenses, dailyLogs, settings },
    };
  });
  unmountHooks.push(hook.unmount);
  return hook;
}

describe('useSyncOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSyncConfigured).mockReturnValue(true);
    vi.mocked(pull).mockResolvedValue(null);
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    while (unmountHooks.length) {
      unmountHooks.pop()?.();
    }
    vi.useRealTimers();
  });

  it('pulls and merges once after hydration', async () => {
    const remotePayload: SyncPullPayload = {
      mileageLogs: [
        {
          id: 'trip-remote',
          date: '2026-04-05',
          description: JSON.stringify({
            startLocation: 'Remote start',
            endLocation: 'Remote end',
            startOdometer: 1200,
            endOdometer: 1225,
            notes: 'Remote trip',
            purpose: 'Business',
          }),
          miles: 25,
          trip_type: 'Business',
          updated_at: '2026-04-05T10:00:00.000Z',
        },
      ],
      expenses: [
        {
          id: 'expense-remote',
          date: '2026-04-05',
          category: ExpenseCategory.PARKING,
          amount: 8,
          description: JSON.stringify({ description: 'Remote parking' }),
          has_image: 0,
          updated_at: '2026-04-05T10:00:00.000Z',
        },
      ],
    };
    vi.mocked(pull).mockResolvedValue(remotePayload);

    const { result } = renderSyncOrchestratorHook();

    await flushAsyncEffects();

    expect(pull).toHaveBeenCalledTimes(1);
    expect(result.current.state.trips).toHaveLength(1);
    expect(result.current.state.trips[0]?.id).toBe('trip-remote');
    expect(result.current.state.expenses[0]?.description).toBe('Remote parking');
  });

  it('debounces focus-triggered pulls', async () => {
    vi.useFakeTimers();

    renderSyncOrchestratorHook();
    await flushAsyncEffects();
    vi.mocked(pull).mockClear();

    act(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(pull).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(pull).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not resurrect records with pending local delete tombstones', async () => {
    const remotePayload: SyncPullPayload = {
      mileageLogs: [
        {
          id: 'trip-deleted',
          date: '2026-04-05',
          description: JSON.stringify({ startLocation: 'Old', endLocation: 'Old', purpose: 'Business' }),
          miles: 10,
          trip_type: 'Business',
        },
        {
          id: 'trip-remote',
          date: '2026-04-05',
          description: JSON.stringify({ startLocation: 'New', endLocation: 'New', purpose: 'Business' }),
          miles: 12,
          trip_type: 'Business',
        },
      ],
    };
    vi.mocked(pull).mockResolvedValue(remotePayload);

    const { result } = renderSyncOrchestratorHook({
      deletedIds: {
        ...emptyDeletedIds,
        mileageLogs: ['trip-deleted'],
      },
    });

    await flushAsyncEffects();

    expect(result.current.state.trips.map((trip) => trip.id)).toEqual(['trip-remote']);
    expect(schedulePush).toHaveBeenCalled();
  });
});
