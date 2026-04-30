import { describe, expect, it } from 'vitest';
import type { DailyWorkLog, Trip } from '../../types';
import {
  getMileageCoverage,
  resolveClearedMileageLink,
  shouldPromptForShiftMileage,
} from '../mileageLinkage';

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

const makeLog = (overrides: Partial<DailyWorkLog> = {}): DailyWorkLog => ({
  id: 'shift-1',
  date: '2026-04-30',
  provider: 'Uber',
  hoursWorked: 4,
  revenue: 100,
  ...overrides,
});

describe('mileage linkage helpers', () => {
  it('treats a same-date business trip as covered but unlinked mileage', () => {
    expect(getMileageCoverage(makeLog({ linkedTripId: undefined }), [makeTrip('trip-1')])).toBe('unlinked');
  });

  it('does not treat a stale linkedTripId as covered when no matching or same-date business trip exists', () => {
    expect(getMileageCoverage(makeLog({ linkedTripId: 'missing-trip' }), [])).toBe('missing');
  });

  it('suppresses the post-shift mileage prompt when a same-date business trip exists', () => {
    expect(shouldPromptForShiftMileage(makeLog({ linkedTripId: undefined }), [makeTrip('trip-1')])).toBe(false);
  });

  it('keeps the post-shift mileage prompt when no linked or same-date business trip exists', () => {
    expect(shouldPromptForShiftMileage(makeLog({ linkedTripId: undefined }), [])).toBe(true);
  });

  it('clearing work-log miles deletes an auto-created linked trip and clears the link', () => {
    const result = resolveClearedMileageLink('trip_auto_1', [
      makeTrip('trip_auto_1', { notes: 'Auto from Uber shift' }),
    ]);

    expect(result).toEqual({
      linkedTripId: undefined,
      tripIdToDelete: 'trip_auto_1',
    });
  });

  it('clearing work-log miles clears the shift link without deleting a manually created trip', () => {
    const result = resolveClearedMileageLink('manual-trip', [
      makeTrip('manual-trip', { notes: 'Airport run' }),
    ]);

    expect(result).toEqual({
      linkedTripId: undefined,
      tripIdToDelete: undefined,
    });
  });
});
