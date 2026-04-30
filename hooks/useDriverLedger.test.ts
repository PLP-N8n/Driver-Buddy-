import React, { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type ActiveWorkSession,
  type CompletedShiftSummary,
  type DailyWorkLog,
  type Expense,
  type Trip,
} from '../types';
import { useDriverLedger } from './useDriverLedger';

vi.mock('../services/analyticsService', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('../src/sentry', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
}));

const makeTrip = (id: string, overrides: Partial<Trip> = {}): Trip => ({
  id,
  date: '2026-04-30',
  startLocation: 'Start',
  endLocation: 'End',
  startOdometer: 1000,
  endOdometer: 1025,
  totalMiles: 25,
  purpose: 'Business',
  notes: '',
  ...overrides,
});

const makeLog = (id: string, overrides: Partial<DailyWorkLog> = {}): DailyWorkLog => ({
  id,
  date: '2026-04-30',
  provider: 'Uber',
  hoursWorked: 4,
  revenue: 100,
  ...overrides,
});

function renderDriverLedgerHook(options?: {
  trips?: Trip[];
  dailyLogs?: DailyWorkLog[];
  expenses?: Expense[];
}) {
  return renderHook(() => {
    const [trips, setTrips] = useState<Trip[]>(options?.trips ?? []);
    const [expenses, setExpenses] = useState<Expense[]>(options?.expenses ?? []);
    const [dailyLogs, setDailyLogs] = useState<DailyWorkLog[]>(options?.dailyLogs ?? []);
    const [activeSession, setActiveSession] = useState<ActiveWorkSession | null>(null);
    const [completedShiftSummary, setCompletedShiftSummary] = useState<CompletedShiftSummary | null>(null);

    const ledger = useDriverLedger({
      trips,
      setTrips,
      expenses,
      setExpenses,
      dailyLogs,
      setDailyLogs,
      activeSession,
      setActiveSession,
      setCompletedShiftSummary,
      settings: DEFAULT_SETTINGS,
    });

    return {
      ...ledger,
      state: { trips, dailyLogs, expenses, activeSession, completedShiftSummary },
    };
  });
}

describe('useDriverLedger mileage linkage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('deleteTrip removes the trip and unlinks matching daily logs', () => {
    const { result } = renderDriverLedgerHook({
      trips: [makeTrip('trip-1'), makeTrip('trip-2')],
      dailyLogs: [
        makeLog('shift-1', { linkedTripId: 'trip-1' }),
        makeLog('shift-2', { linkedTripId: 'trip-2' }),
      ],
    });

    act(() => {
      result.current.deleteTrip('trip-1');
    });

    expect(result.current.state.trips.map((trip) => trip.id)).toEqual(['trip-2']);
    expect(result.current.state.dailyLogs.find((log) => log.id === 'shift-1')?.linkedTripId).toBeUndefined();
    expect(result.current.state.dailyLogs.find((log) => log.id === 'shift-2')?.linkedTripId).toBe('trip-2');
  });

  it('can create a durable bidirectional link between a post-shift trip and shift', () => {
    const { result } = renderDriverLedgerHook({
      dailyLogs: [makeLog('shift-1')],
    });

    act(() => {
      result.current.addTrip(makeTrip('trip-post-shift', { linkedShiftId: 'shift-1' }));
      result.current.linkTripToShift('shift-1', 'trip-post-shift');
    });

    expect(result.current.state.trips.find((trip) => trip.id === 'trip-post-shift')?.linkedShiftId).toBe('shift-1');
    expect(result.current.state.dailyLogs.find((log) => log.id === 'shift-1')?.linkedTripId).toBe('trip-post-shift');
  });

  it('persists an intentional zero-earnings manual shift marker', () => {
    const { result } = renderDriverLedgerHook();

    act(() => {
      result.current.saveManualShift({
        date: '2026-04-30',
        provider: 'Uber',
        hoursWorked: 3,
        revenue: 0,
        markedNoEarnings: true,
        expenses: [],
      });
    });

    expect(result.current.state.dailyLogs).toEqual([
      expect.objectContaining({
        provider: 'Uber',
        revenue: 0,
        markedNoEarnings: true,
      }),
    ]);
  });
});
