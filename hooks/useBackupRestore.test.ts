import React, { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type DailyWorkLog, type Expense, ExpenseCategory, type PlayerStats, type Trip } from '../types';
import { useBackupRestore } from './useBackupRestore';

vi.mock('../services/deviceId', () => ({
  getBackupCode: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

vi.mock('../services/syncService', () => ({
  isSyncConfigured: vi.fn(() => false),
  mergePulledData: vi.fn(),
  pull: vi.fn(),
}));

const initialTrips: Trip[] = [
  {
    id: 'trip-local',
    date: '2026-04-03',
    startLocation: 'Leeds',
    endLocation: 'Bradford',
    startOdometer: 1000,
    endOdometer: 1018,
    totalMiles: 18,
    purpose: 'Business',
    notes: 'Local trip',
  },
];

const initialExpenses: Expense[] = [
  {
    id: 'expense-local',
    date: '2026-04-03',
    category: ExpenseCategory.FUEL,
    amount: 24.5,
    description: 'Local fuel',
    hasReceiptImage: false,
    isVatClaimable: false,
  },
];

const initialLogs: DailyWorkLog[] = [
  {
    id: 'log-local',
    date: '2026-04-03',
    provider: 'Uber',
    hoursWorked: 5,
    revenue: 120,
    notes: 'Local log',
  },
];

const initialPlayerStats: PlayerStats = {
  xp: 100,
  level: 2,
  rankTitle: 'Runner',
  totalLogs: 1,
};

function renderBackupRestoreHook() {
  const showToast = vi.fn();
  const triggerTextDownload = vi.fn();
  const queueDownload = vi.fn((_: number, fn: () => void) => fn());

  const hook = renderHook(() => {
    const [trips, setTrips] = useState(initialTrips);
    const [expenses, setExpenses] = useState(initialExpenses);
    const [dailyLogs, setDailyLogs] = useState(initialLogs);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [playerStats, setPlayerStats] = useState(initialPlayerStats);

    const backupRestore = useBackupRestore({
      trips,
      expenses,
      dailyLogs,
      settings,
      playerStats,
      showToast,
      setTrips,
      setExpenses,
      setDailyLogs,
      setSettings,
      setPlayerStats,
      triggerTextDownload,
      queueDownload,
    });

    return {
      ...backupRestore,
      state: { trips, expenses, dailyLogs, settings, playerStats },
    };
  });

  return { ...hook, showToast, triggerTextDownload, queueDownload };
}

describe('useBackupRestore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('restore() with a valid payload succeeds and updates state', async () => {
    const { result, showToast } = renderBackupRestoreHook();
    const restoredPayload = {
      trips: [
        {
          id: 'trip-restored',
          date: '2026-04-05',
          startLocation: 'York',
          endLocation: 'Hull',
          startOdometer: 2000,
          endOdometer: 2050,
          totalMiles: 50,
          purpose: 'Business' as const,
          notes: 'Restored trip',
        },
      ],
      expenses: [
        {
          id: 'expense-restored',
          date: '2026-04-05',
          category: ExpenseCategory.PARKING,
          amount: 18.75,
          description: 'Restored parking',
          hasReceiptImage: false,
          isVatClaimable: true,
        },
      ],
      dailyLogs: [
        {
          id: 'log-restored',
          date: '2026-04-05',
          provider: 'Bolt',
          hoursWorked: 6,
          revenue: 180,
          notes: 'Restored log',
        },
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        vehicleReg: 'AB12 CDE',
        claimMethod: 'ACTUAL' as const,
      },
      playerStats: {
        xp: 350,
        level: 4,
        rankTitle: 'Pro',
        totalLogs: 9,
      },
      version: '1.0',
      exportDate: '2026-04-05T10:00:00.000Z',
    };

    await act(async () => {
      await result.current.restore(restoredPayload);
    });

    expect(result.current.state.trips).toEqual(restoredPayload.trips);
    expect(result.current.state.expenses).toEqual(restoredPayload.expenses);
    expect(result.current.state.dailyLogs).toEqual(restoredPayload.dailyLogs);
    expect(result.current.state.settings.vehicleReg).toBe('AB12 CDE');
    expect(result.current.state.settings.claimMethod).toBe('ACTUAL');
    expect(result.current.state.playerStats).toEqual(restoredPayload.playerStats);
    expect(result.current.restoreStatusMessage).toBe('1 work logs and 1 expenses restored successfully');
    expect(showToast).toHaveBeenCalledWith('1 work logs and 1 expenses restored successfully');
  });

  it('restore() with an invalid payload rejects and leaves state unchanged', async () => {
    const { result } = renderBackupRestoreHook();
    const beforeRestore = structuredClone(result.current.state);

    await expect(result.current.restore({ invalid: true })).rejects.toThrow('Backup data appears corrupted');

    expect(result.current.state).toEqual(beforeRestore);
    expect(result.current.restoreStatusMessage).toBeNull();
  });

  it('backup() produces a valid JSON blob with all required keys', async () => {
    const { result } = renderBackupRestoreHook();

    const blob = result.current.backup();
    const parsed = JSON.parse(await blob.text()) as Record<string, unknown>;

    expect(blob.type).toBe('application/json');
    expect(parsed).toEqual(
      expect.objectContaining({
        trips: initialTrips,
        expenses: initialExpenses,
        dailyLogs: initialLogs,
        settings: DEFAULT_SETTINGS,
        playerStats: initialPlayerStats,
        version: '1.0',
      })
    );
    expect(typeof parsed.exportDate).toBe('string');
  });
});
