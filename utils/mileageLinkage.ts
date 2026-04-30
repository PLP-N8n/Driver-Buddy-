import type { DailyWorkLog, Trip } from '../types';

export type MileageCoverage = 'linked' | 'unlinked' | 'missing';

export const isSameDateBusinessTrip = (trip: Trip, date: string): boolean =>
  trip.date === date && trip.purpose === 'Business';

export const getMileageCoverage = (shift: DailyWorkLog, trips: Trip[]): MileageCoverage => {
  if (shift.linkedTripId && trips.some((trip) => trip.id === shift.linkedTripId)) {
    return 'linked';
  }

  return trips.some((trip) => isSameDateBusinessTrip(trip, shift.date)) ? 'unlinked' : 'missing';
};

export const hasMileageCoverage = (shift: DailyWorkLog, trips: Trip[]): boolean =>
  getMileageCoverage(shift, trips) !== 'missing';

export const shouldPromptForShiftMileage = (
  completedLog: DailyWorkLog | null | undefined,
  trips: Trip[]
): boolean => {
  if (!completedLog) return false;
  return !hasMileageCoverage(completedLog, trips);
};

export const isAutoCreatedShiftTrip = (trip: Trip | undefined): boolean => {
  if (!trip) return false;

  return (
    trip.id.startsWith('trip_auto_') ||
    trip.notes.startsWith('Auto from ') ||
    trip.notes.startsWith('Auto-created from ')
  );
};

export type ClearedMileageLinkResolution = {
  linkedTripId: undefined;
  tripIdToDelete?: string;
};

export const resolveClearedMileageLink = (
  linkedTripId: string | undefined,
  trips: Trip[]
): ClearedMileageLinkResolution | null => {
  if (!linkedTripId) return null;

  const linkedTrip = trips.find((trip) => trip.id === linkedTripId);

  return {
    linkedTripId: undefined,
    tripIdToDelete: isAutoCreatedShiftTrip(linkedTrip) ? linkedTripId : undefined,
  };
};
