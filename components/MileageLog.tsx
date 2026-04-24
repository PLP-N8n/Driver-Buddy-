import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Car,
  ChevronDown,
  Link2,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Settings, Trip, TripPurpose } from '../types';
import { DatePicker } from './DatePicker';
import { EmptyState } from './EmptyState';
import { calculateMileageClaim } from '../utils/tax';
import { todayUK } from '../utils/ukDate';
import {
  dangerButtonClasses,
  fieldErrorClasses,
  fieldLabelClasses,
  formatNumber,
  getNumericInputProps,
  iconButtonClasses,
  inputClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  selectClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
  textareaClasses,
} from '../utils/ui';

interface MileageLogProps {
  trips: Trip[];
  onAddTrip: (trip: Trip) => void;
  onDeleteTrip: (id: string) => void;
  onUpdateTrip: (id: string, updates: Partial<Trip>) => void;
  settings: Settings;
  openFormSignal?: number;
  onOpenFormHandled?: () => void;
}

const MILEAGE_SEARCH_KEY = 'dtpro_mileage_search';

const purposeBadgeClasses: Record<TripPurpose, string> = {
  Business: 'bg-green-500/20 text-green-400',
  Personal: 'bg-slate-600/40 text-slate-400',
  Commute: 'bg-amber-500/20 text-amber-400',
};

const purposeChipClasses: Record<TripPurpose, string> = {
  Business: 'bg-green-500/20 text-green-400',
  Personal: 'bg-slate-600/40 text-slate-400',
  Commute: 'bg-amber-500/20 text-amber-400',
};

function MonthlySummaryBar({ trips, settings }: { trips: Trip[]; settings: Settings }) {
  const monthKey = todayUK().slice(0, 7);
  const monthTrips = trips.filter((trip) => trip.date.startsWith(monthKey));
  if (monthTrips.length === 0) return null;

  const businessMiles = monthTrips
    .filter((trip) => trip.purpose === 'Business')
    .reduce((sum, trip) => sum + trip.totalMiles, 0);
  const claimable = calculateMileageClaim(businessMiles, settings.businessRateFirst10k, settings.businessRateAfter10k);

  const byPurpose: Partial<Record<TripPurpose, number>> = {};
  monthTrips.forEach((trip) => {
    byPurpose[trip.purpose] = (byPurpose[trip.purpose] ?? 0) + trip.totalMiles;
  });

  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{monthLabel}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xl font-bold text-green-400">
          {formatNumber(businessMiles, 0)}mi business
        </span>
        {claimable > 0 && (
          <span className="text-sm text-slate-400">&pound;{claimable.toFixed(2)} claimable</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.entries(byPurpose) as [TripPurpose, number][])
          .sort((left, right) => right[1] - left[1])
          .map(([purpose, miles]) => (
            <span key={purpose} className={`rounded-full px-3 py-1 text-xs font-medium ${purposeChipClasses[purpose]}`}>
              {purpose} {formatNumber(miles, 0)}mi
            </span>
          ))}
      </div>
    </section>
  );
}

export const MileageLog: React.FC<MileageLogProps> = ({
  trips,
  onAddTrip,
  onDeleteTrip,
  onUpdateTrip,
  settings,
  openFormSignal,
  onOpenFormHandled,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem(MILEAGE_SEARCH_KEY) ?? '');
  const [error, setError] = useState('');
  const [newTrip, setNewTrip] = useState<Partial<Trip>>({
    date: todayUK(),
    purpose: 'Business',
    startLocation: '',
    endLocation: '',
    startOdometer: 0,
    endOdometer: 0,
    totalMiles: 0,
    notes: '',
  });
  const [startOdometerInput, setStartOdometerInput] = useState('');
  const [endOdometerInput, setEndOdometerInput] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const handledOpenFormSignalRef = useRef<number | undefined>(undefined);

  const liveOdometer = useMemo(
    () =>
      (settings.financialYearStartOdometer || 0) +
      trips
        .filter((trip) => trip.date >= settings.financialYearStartDate)
        .reduce((sum, trip) => sum + trip.totalMiles, 0),
    [settings.financialYearStartDate, settings.financialYearStartOdometer, trips]
  );

  useEffect(() => {
    if (isFormOpen && !editingTrip) {
      const value = parseFloat(liveOdometer.toFixed(1));
      setNewTrip((current) => ({ ...current, startOdometer: value }));
      setStartOdometerInput(value.toString());
    }
  }, [editingTrip, isFormOpen, liveOdometer]);

  useEffect(() => {
    if (!openFormSignal || handledOpenFormSignalRef.current === openFormSignal) return;
    handledOpenFormSignalRef.current = openFormSignal;
    closeForm();
    setIsFormOpen(true);
    onOpenFormHandled?.();
  }, [onOpenFormHandled, openFormSignal]);
  useEffect(() => {
    sessionStorage.setItem(MILEAGE_SEARCH_KEY, searchQuery);
  }, [searchQuery]);

  const filteredTrips = [...trips]
    .filter((trip) => {
      const query = deferredSearchQuery.toLowerCase();
      return (
        trip.startLocation.toLowerCase().includes(query) ||
        trip.endLocation.toLowerCase().includes(query) ||
        trip.notes.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => right.date.localeCompare(left.date));

  const resetForm = () => {
    const startValue = parseFloat(liveOdometer.toFixed(1));
    setNewTrip({
      date: todayUK(),
      purpose: 'Business',
      startLocation: '',
      endLocation: '',
      startOdometer: startValue,
      endOdometer: 0,
      totalMiles: 0,
      notes: '',
    });
    setStartOdometerInput(startValue.toString());
    setEndOdometerInput('');
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingTrip(null);
    resetForm();
    setError('');
  };

  const openEdit = (trip: Trip) => {
    setEditingTrip(trip);
    setNewTrip({ ...trip });
    setStartOdometerInput(trip.startOdometer ? trip.startOdometer.toString() : '');
    setEndOdometerInput(trip.endOdometer ? trip.endOdometer.toString() : '');
    setError('');
    setIsFormOpen(true);
  };

  const handleMilesChange = (value: string) => {
    const miles = parseFloat(value);
    if (!Number.isFinite(miles)) {
      setNewTrip((current) => ({ ...current, totalMiles: 0 }));
      return;
    }

    const start = newTrip.startOdometer || 0;
    const end = parseFloat((start + miles).toFixed(1));
    setNewTrip((current) => ({
      ...current,
      totalMiles: miles,
      endOdometer: end,
    }));
    setEndOdometerInput(end.toString());
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!newTrip.totalMiles || newTrip.totalMiles <= 0) {
      setError('Enter a valid mileage figure before saving.');
      return;
    }

    if (editingTrip) {
      onUpdateTrip(editingTrip.id, {
        date: newTrip.date || editingTrip.date,
        startLocation: newTrip.startLocation || '',
        endLocation: newTrip.endLocation || '',
        startOdometer: newTrip.startOdometer || 0,
        endOdometer: newTrip.endOdometer || 0,
        totalMiles: newTrip.totalMiles,
        purpose: (newTrip.purpose as TripPurpose) || 'Business',
        notes: newTrip.notes || '',
      });
    } else {
      onAddTrip({
        id: Date.now().toString(),
        date: newTrip.date || todayUK(),
        startLocation: newTrip.startLocation || 'Unknown start',
        endLocation: newTrip.endLocation || 'Unknown end',
        startOdometer: newTrip.startOdometer || 0,
        endOdometer: newTrip.endOdometer || 0,
        totalMiles: newTrip.totalMiles,
        purpose: (newTrip.purpose as TripPurpose) || 'Business',
        notes: newTrip.notes || '',
      });
    }

    closeForm();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-surface-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Mileage log</h2>
            <p className="text-sm text-slate-400">Every business mile is worth 45p tax-free. Log them all.</p>
            <p className="mt-1 text-xs text-slate-500">
              Live odometer estimate: <span className="font-mono text-white">{formatNumber(liveOdometer)} mi</span>
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="trip-search" className="relative block min-w-[220px]">
              <span className="sr-only">Search trips</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="trip-search"
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className={`pl-10 ${inputClasses}`}
                placeholder="Search trips"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                closeForm();
                setIsFormOpen(true);
              }}
              className={primaryButtonClasses}
            >
              <Plus className="h-4 w-4" />
              <span>Add trip</span>
            </button>
          </div>
        </div>
      </section>

      <MonthlySummaryBar trips={trips} settings={settings} />

      <section className="space-y-2">
        {filteredTrips.length === 0 ? (
          <EmptyState
            icon={Car}
            title={searchQuery ? 'No matching trips' : 'No trips recorded yet'}
            description={
              searchQuery
                ? 'Try another location or clear the search to see every mileage entry.'
                : 'Log your first business trip. Every qualifying mile can reduce your tax bill.'
            }
            action={
              searchQuery
                ? { label: 'Clear search', onClick: () => setSearchQuery('') }
                : {
                    label: 'Add first trip',
                    onClick: () => {
                      closeForm();
                      setIsFormOpen(true);
                    },
                  }
            }
          />
        ) : (
          filteredTrips.map((trip) => (
            <article
              key={trip.id}
              className="rounded-xl border border-white/6 bg-surface p-4 transition-all duration-200 hover:border-white/10 hover:bg-surface-raised/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-400">{trip.date}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${purposeBadgeClasses[trip.purpose]}`}>
                      {trip.purpose}
                    </span>
                    {trip.notes?.startsWith('Auto from') && (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                        <Link2 className="h-3 w-3" />
                        {trip.notes}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-white">
                    {trip.startLocation || 'Unknown start'} &rarr; {trip.endLocation || 'Unknown end'}
                  </p>
                  <div className="mt-2">
                    <p className="font-mono font-semibold text-green-400">{formatNumber(trip.totalMiles)} miles</p>
                    {trip.purpose === 'Business' && (
                      <p className="text-xs text-green-400/70">
                        &asymp; &pound;{calculateMileageClaim(trip.totalMiles, settings.businessRateFirst10k, settings.businessRateAfter10k).toFixed(2)} claimable
                      </p>
                    )}
                    {!trip.notes?.startsWith('Auto from') && trip.notes && (
                      <p className="mt-1 text-xs text-slate-500">{trip.notes}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Odo {formatNumber(trip.startOdometer)} &rarr; {formatNumber(trip.endOdometer)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-row gap-2">
                  <button
                    type="button"
                    aria-label={`Edit trip on ${trip.date}`}
                    onClick={() => openEdit(trip)}
                    className={secondaryButtonClasses}
                    title="Edit trip"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete trip on ${trip.date}`}
                    onClick={() => onDeleteTrip(trip.id)}
                    className={dangerButtonClasses}
                    title="Delete trip"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {isFormOpen && (
        <div className={sheetBackdropClasses} onClick={closeForm}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingTrip ? 'Edit trip' : 'Add trip'}
            className={sheetPanelClasses}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{editingTrip ? 'Edit trip' : 'Add trip'}</h3>
                {editingTrip?.notes.startsWith('Auto from') && (
                  <p className="mt-1 text-xs text-green-400/70">
                    Auto-created from a work shift. Editing miles here will not update the work log.
                  </p>
                )}
                {!editingTrip && <p className="text-sm text-slate-400">Add an HMRC-ready mileage trip.</p>}
              </div>
              <button
                type="button"
                aria-label="Close trip form"
                onClick={closeForm}
                className={iconButtonClasses}
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <DatePicker
                  id="trip-date"
                  label="Date"
                  value={newTrip.date || ''}
                  onChange={(date) => setNewTrip({ ...newTrip, date })}
                />
                <div className="block">
                  <label htmlFor="trip-purpose" className={fieldLabelClasses}>
                    Purpose
                  </label>
                  <div className="relative">
                    <select
                      id="trip-purpose"
                      value={newTrip.purpose}
                      onChange={(event) => setNewTrip({ ...newTrip, purpose: event.target.value as TripPurpose })}
                      className={selectClasses}
                    >
                      <option value="Business">Business</option>
                      <option value="Personal">Personal</option>
                      <option value="Commute">Commute</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="block">
                  <label htmlFor="trip-start" className={fieldLabelClasses}>
                    Start location
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="trip-start"
                      type="text"
                      value={newTrip.startLocation}
                      onChange={(event) => setNewTrip({ ...newTrip, startLocation: event.target.value })}
                      className={`pl-10 ${inputClasses}`}
                      placeholder="Start location"
                    />
                  </div>
                </div>
                <div className="block">
                  <label htmlFor="trip-end" className={fieldLabelClasses}>
                    End location
                  </label>
                  <div className="relative">
                    <Navigation className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="trip-end"
                      type="text"
                      value={newTrip.endLocation}
                      onChange={(event) => setNewTrip({ ...newTrip, endLocation: event.target.value })}
                      className={`pl-10 ${inputClasses}`}
                      placeholder="Destination"
                    />
                  </div>
                </div>
              </div>

              <div className="block">
                <label htmlFor="trip-notes" className={fieldLabelClasses}>
                  Notes
                </label>
                <textarea
                  id="trip-notes"
                  value={newTrip.notes}
                  onChange={(event) => setNewTrip({ ...newTrip, notes: event.target.value })}
                  className={textareaClasses}
                  placeholder="Reason for the journey or route details"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="block">
                  <label htmlFor="trip-start-odometer" className={fieldLabelClasses}>
                    Start odometer
                  </label>
                  <input
                    id="trip-start-odometer"
                    {...getNumericInputProps('decimal')}
                    value={startOdometerInput}
                    onChange={(event) => {
                      setStartOdometerInput(event.target.value);
                      const start = parseFloat(event.target.value) || 0;
                      const end = newTrip.endOdometer || 0;
                      const miles = end > start ? parseFloat((end - start).toFixed(1)) : 0;
                      setNewTrip({ ...newTrip, startOdometer: start, totalMiles: miles });
                    }}
                    className={`${inputClasses} font-mono`}
                    placeholder="0"
                  />
                </div>
                <div className="block">
                  <label htmlFor="trip-miles" className={fieldLabelClasses}>
                    Miles driven
                  </label>
                  <input
                    id="trip-miles"
                    {...getNumericInputProps('decimal')}
                    value={newTrip.totalMiles || ''}
                    onChange={(event) => handleMilesChange(event.target.value)}
                    className={`${inputClasses} font-mono`}
                    placeholder="0.0"
                  />
                </div>
                <div className="block">
                  <label htmlFor="trip-end-odometer" className={fieldLabelClasses}>
                    End odometer
                  </label>
                  <input
                    id="trip-end-odometer"
                    {...getNumericInputProps('decimal')}
                    value={endOdometerInput}
                    onChange={(event) => {
                      setEndOdometerInput(event.target.value);
                      const end = parseFloat(event.target.value) || 0;
                      const start = newTrip.startOdometer || 0;
                      const miles = end > start ? parseFloat((end - start).toFixed(1)) : 0;
                      setNewTrip({ ...newTrip, endOdometer: end, totalMiles: miles });
                    }}
                    className={`${inputClasses} font-mono`}
                    placeholder="0"
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className={fieldErrorClasses}>
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </p>
              )}

              <button type="submit" className={`${primaryButtonClasses} w-full`}>
                {editingTrip ? 'Save changes' : 'Save trip'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
