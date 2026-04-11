import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock3,
  Fuel,
  Link2,
  Package,
  Pencil,
  Plus,
  PoundSterling,
  Trash2,
  X,
} from 'lucide-react';
import { DailyWorkLog, DriverRole, ProviderSplit, Settings, Trip } from '../types';
import { DatePicker } from './DatePicker';
import { EmptyState } from './EmptyState';
import { todayUK, ukWeekStart } from '../utils/ukDate';
import {
  dangerButtonClasses,
  dialogBackdropClasses,
  dialogPanelClasses,
  fieldLabelClasses,
  formatCurrency,
  formatNumber,
  getNumericInputProps,
  inputClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  selectClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
} from '../utils/ui';

const providerBadgeStyles: Record<string, string> = {
  Uber: 'bg-black text-white',
  Deliveroo: 'bg-teal-500/20 text-teal-300',
  Amazon: 'bg-orange-500/20 text-orange-300',
  'Amazon Flex': 'bg-orange-500/20 text-orange-300',
  Bolt: 'bg-green-500/20 text-green-300',
  Evri: 'bg-purple-500/20 text-purple-300',
};

const getProviderBadgeClass = (provider: string): string => {
  if (providerBadgeStyles[provider]) return providerBadgeStyles[provider] ?? 'bg-surface-raised text-slate-300';
  if (provider.includes('Uber')) return providerBadgeStyles.Uber ?? 'bg-surface-raised text-slate-300';
  if (provider.includes('Amazon')) return providerBadgeStyles['Amazon Flex'] ?? 'bg-surface-raised text-slate-300';
  if (provider.includes('Deliveroo')) return providerBadgeStyles.Deliveroo ?? 'bg-surface-raised text-slate-300';
  return 'bg-surface-raised text-slate-300';
};

const getProvidersByRole = (role: DriverRole): string[] => {
  switch (role) {
    case 'COURIER':
      return ['Amazon Flex', 'DPD', 'Evri', 'Yodel', 'CitySprint', 'Royal Mail', 'Gophr'];
    case 'FOOD_DELIVERY':
      return ['Uber Eats', 'Deliveroo', 'Just Eat', 'Stuart', 'Beelivery', 'Gopuff'];
    case 'TAXI':
      return ['Uber', 'Bolt', 'FREENOW', 'Ola', 'Gett', 'Local Firm', 'Private Clients'];
    case 'LOGISTICS':
      return ['BCA Logistics', 'Engineius', 'Manheim', 'Drascombe', 'Auto Trader', 'Private Trade'];
    default:
      return ['Private client', 'Agency', 'Other'];
  }
};

const getJobLabel = (roles: DriverRole[]): string => {
  if (roles.includes('TAXI')) return 'Rides';
  if (roles.includes('FOOD_DELIVERY')) return 'Deliveries';
  if (roles.includes('COURIER')) return 'Drops';
  if (roles.includes('LOGISTICS')) return 'Moves';
  return 'Jobs';
};

const weekKey = (dateStr: string): string => ukWeekStart(dateStr);
const currentWeekKey = (): string => weekKey(todayUK());

interface WorkLogProps {
  logs: DailyWorkLog[];
  settings: Settings;
  onAddLog: (log: DailyWorkLog) => void;
  onUpdateLog: (log: DailyWorkLog) => void;
  onDeleteLog: (id: string) => void;
  onAddTrip: (trip: Trip) => void;
  onUpdateTrip: (id: string, updates: Partial<Trip>) => void;
  onDeleteTrip: (id: string) => void;
  onNavigateToMileage?: () => void;
  openFormSignal?: number;
  onOpenFormHandled?: () => void;
}

interface ProviderEntry {
  provider: string;
  customProvider: string;
  revenue: string;
  jobCount: string;
}

interface FormState {
  date: string;
  providers: ProviderEntry[];
  hours: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  fuel: string;
  miles: string;
  startLocation: string;
  notes: string;
}

const emptyProviderEntry = (): ProviderEntry => ({
  provider: '',
  customProvider: '',
  revenue: '',
  jobCount: '',
});

const emptyForm = (): FormState => ({
  date: todayUK(),
  providers: [emptyProviderEntry()],
  hours: '',
  startTime: '',
  endTime: '',
  breakMinutes: '',
  fuel: '',
  miles: '',
  startLocation: '',
  notes: '',
});

const logToForm = (log: DailyWorkLog): FormState => ({
  date: log.date,
  providers: log.providerSplits?.length
    ? log.providerSplits.map((split) => ({
        provider: split.provider,
        customProvider: '',
        revenue: String(split.revenue),
        jobCount: split.jobCount != null ? String(split.jobCount) : '',
      }))
    : [
        {
          provider: log.provider,
          customProvider: '',
          revenue: String(log.revenue),
          jobCount: log.jobCount != null ? String(log.jobCount) : '',
        },
      ],
  hours: String(log.hoursWorked),
  startTime: log.startedAt ? log.startedAt.slice(11, 16) : '',
  endTime: log.endedAt ? log.endedAt.slice(11, 16) : '',
  breakMinutes: '',
  fuel: log.fuelLiters != null ? String(log.fuelLiters) : '',
  miles: log.milesDriven != null ? String(log.milesDriven) : '',
  startLocation: '',
  notes: log.notes ?? '',
});

function WeeklySummaryBar({ logs }: { logs: DailyWorkLog[] }) {
  const thisWeek = currentWeekKey();
  const weekLogs = logs.filter((log) => weekKey(log.date) === thisWeek);
  if (weekLogs.length === 0) return null;

  const weekRevenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);
  const weekDays = new Set(weekLogs.map((log) => log.date)).size;
  const weekHours = weekLogs.reduce((sum, log) => sum + log.hoursWorked, 0);
  const weekMiles = weekLogs.reduce((sum, log) => sum + (log.milesDriven ?? 0), 0);

  const byProvider: Record<string, number> = {};
  weekLogs.forEach((log) => {
    if (log.providerSplits?.length) {
      log.providerSplits.forEach((split) => {
        byProvider[split.provider] = (byProvider[split.provider] ?? 0) + split.revenue;
      });
    } else {
      byProvider[log.provider] = (byProvider[log.provider] ?? 0) + log.revenue;
    }
  });

  const platforms = Object.entries(byProvider).sort((left, right) => right[1] - left[1]);

  return (
    <section className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">This week</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xl font-bold text-green-400">{formatCurrency(weekRevenue)}</span>
        <span className="text-sm text-slate-400">
          {weekDays} {weekDays === 1 ? 'day' : 'days'} · {formatNumber(weekHours, 1)}h
          {weekMiles > 0 && ` · ${formatNumber(weekMiles, 0)}mi`}
        </span>
      </div>
      {platforms.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {platforms.map(([name, revenue]) => (
            <span key={name} className={`rounded-full px-3 py-1 text-xs font-medium ${getProviderBadgeClass(name)}`}>
              {name} {formatCurrency(revenue)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function DeleteConfirmDialog({
  log,
  onDeleteBoth,
  onDeleteShiftOnly,
  onCancel,
}: {
  log: DailyWorkLog;
  onDeleteBoth: () => void;
  onDeleteShiftOnly: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={dialogBackdropClasses}>
      <div role="dialog" aria-modal="true" aria-label="Delete shift" className={`${dialogPanelClasses} max-w-sm`}>
        <p className="font-semibold text-white">Delete this shift?</p>
        {log.linkedTripId && (
          <p className="mt-2 text-sm text-slate-400">
            This shift has a linked mileage trip ({formatNumber(log.milesDriven ?? 0, 0)} mi). Delete that too?
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {log.linkedTripId && (
            <button type="button" onClick={onDeleteBoth} className={`${dangerButtonClasses} justify-center`}>
              Delete shift + mileage trip
            </button>
          )}
          <button type="button" onClick={onDeleteShiftOnly} className={`${dangerButtonClasses} justify-center`}>
            {log.linkedTripId ? 'Delete shift only' : 'Delete shift'}
          </button>
          <button type="button" onClick={onCancel} className={`${secondaryButtonClasses} justify-center`}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkLogForm({
  editingLog,
  settings,
  onSave,
  onCancel,
}: {
  editingLog: DailyWorkLog | null;
  settings: Settings;
  onSave: (form: FormState) => void;
  onCancel: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<FormState>(() => (editingLog ? logToForm(editingLog) : emptyForm()));
  const [errors, setErrors] = useState<{
    providers: Array<{ revenue?: string }>;
    hours?: string;
    fuel?: string;
    miles?: string;
  }>({ providers: [{}] });
  useEffect(() => { sheetRef.current?.scrollTo({ top: 0 }); }, []);

  const providers = useMemo(() => {
    const all = (settings.driverRoles ?? ['COURIER']).flatMap(getProvidersByRole);
    return Array.from(new Set(all)).sort();
  }, [settings.driverRoles]);

  const jobLabel = getJobLabel(settings.driverRoles ?? ['COURIER']);

  useEffect(() => {
    setForm(editingLog ? logToForm(editingLog) : emptyForm());
    setErrors({ providers: [{}] });
  }, [editingLog]);

  useEffect(() => {
    if (!form.startTime || !form.endTime) return;
    const [sh = 0, sm = 0] = form.startTime.split(':').map(Number);
    const [eh = 0, em = 0] = form.endTime.split(':').map(Number);
    const totalMins = (eh * 60 + em) - (sh * 60 + sm) - (parseInt(form.breakMinutes) || 0);
    const derived = Math.max(0, totalMins / 60);
    if (derived > 0) {
      setForm((current) => ({ ...current, hours: String(Math.round(derived * 100) / 100) }));
    }
  }, [form.startTime, form.endTime, form.breakMinutes]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const providerErrors = form.providers.map((entry) => {
      const revenue = parseFloat(entry.revenue);
      return !Number.isFinite(revenue) || revenue <= 0 ? { revenue: 'Required: enter a value greater than 0' } : {};
    });

    const hours = parseFloat(form.hours);
    const fuel = form.fuel ? parseFloat(form.fuel) : undefined;
    const miles = form.miles ? parseFloat(form.miles) : undefined;

    const nextErrors: typeof errors = {
      providers: providerErrors,
      hours: !Number.isFinite(hours) || hours <= 0 ? 'Required: enter a value greater than 0' : undefined,
      fuel: fuel != null && fuel < 0 ? 'Must be 0 or greater' : undefined,
      miles: miles != null && miles < 0 ? 'Must be 0 or greater' : undefined,
    };

    setErrors(nextErrors);
    if (providerErrors.some((entry) => entry.revenue) || nextErrors.hours || nextErrors.fuel || nextErrors.miles) {
      return;
    }

    onSave(form);
  };

  return (
    <div className={sheetBackdropClasses} onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editingLog ? 'Edit shift' : 'Start shift'}
        ref={sheetRef}
        className={`${sheetPanelClasses} mx-auto w-full max-w-lg sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">{editingLog ? 'Edit shift' : 'Start shift'}</h3>
          <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:text-white active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DatePicker
            id="wl-date"
            label="Date"
            value={form.date}
            onChange={(value) => setForm((current) => ({ ...current, date: value }))}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Providers &amp; Revenue</span>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, providers: [...current.providers, emptyProviderEntry()] }))}
                className="rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/10 active:scale-95"
              >
                + Add provider
              </button>
            </div>

            {form.providers.map((entry, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={fieldLabelClasses}>Provider</label>
                    <select
                      value={entry.provider}
                        onChange={(event) =>
                          setForm((current) => {
                            const next = [...current.providers];
                            const currentEntry = next[index] ?? emptyProviderEntry();
                            next[index] = { ...currentEntry, provider: event.target.value };
                            return { ...current, providers: next };
                          })
                        }
                      className={selectClasses}
                    >
                      <option value="">Select provider</option>
                      {providers.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelClasses}>Revenue (£) *</label>
                    <div className="relative">
                      <PoundSterling className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        {...getNumericInputProps('decimal')}
                        value={entry.revenue}
                        onChange={(event) =>
                          setForm((current) => {
                            const next = [...current.providers];
                            const currentEntry = next[index] ?? emptyProviderEntry();
                            next[index] = { ...currentEntry, revenue: event.target.value };
                            return { ...current, providers: next };
                          })
                        }
                        className={`pl-10 ${inputClasses} font-mono`}
                        placeholder="0.00"
                      />
                    </div>
                    {errors.providers[index]?.revenue && (
                      <p className="mt-1 text-xs text-red-400">{errors.providers[index].revenue}</p>
                    )}
                  </div>
                </div>

                {entry.provider === 'Other' && (
                  <input
                    type="text"
                    value={entry.customProvider}
                      onChange={(event) =>
                        setForm((current) => {
                          const next = [...current.providers];
                          const currentEntry = next[index] ?? emptyProviderEntry();
                          next[index] = { ...currentEntry, customProvider: event.target.value };
                          return { ...current, providers: next };
                        })
                      }
                    className={inputClasses}
                    placeholder="Provider name"
                  />
                )}

                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className={fieldLabelClasses}>{jobLabel}</label>
                    <div className="relative">
                      <Package className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        {...getNumericInputProps('numeric')}
                        value={entry.jobCount}
                        onChange={(event) =>
                          setForm((current) => {
                            const next = [...current.providers];
                            const currentEntry = next[index] ?? emptyProviderEntry();
                            next[index] = { ...currentEntry, jobCount: event.target.value };
                            return { ...current, providers: next };
                          })
                        }
                        className={`pl-10 ${inputClasses} font-mono`}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {form.providers.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          providers: current.providers.filter((_, providerIndex) => providerIndex !== index),
                        }))
                      }
                      className={dangerButtonClasses}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}

            {form.providers.length > 1 && (
              <div className="rounded-xl border border-green-500/20 bg-green-950/30 px-4 py-2 text-right">
                <span className="text-sm text-slate-400">Total: </span>
                <span className="font-mono font-bold text-green-400">
                  {formatCurrency(form.providers.reduce((sum, entry) => sum + (parseFloat(entry.revenue) || 0), 0))}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="wl-start-time" className={fieldLabelClasses}>
                  Start time
                </label>
                <input
                  id="wl-start-time"
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="wl-end-time" className={fieldLabelClasses}>
                  End time
                </label>
                <input
                  id="wl-end-time"
                  type="time"
                  value={form.endTime}
                  onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="wl-break" className={fieldLabelClasses}>
                  Break (mins)
                </label>
                <input
                  id="wl-break"
                  {...getNumericInputProps('numeric')}
                  value={form.breakMinutes}
                  onChange={(event) => setForm((current) => ({ ...current, breakMinutes: event.target.value }))}
                  className={`${inputClasses} font-mono`}
                  placeholder="0"
                />
              </div>
            </div>

            {form.startTime && form.endTime && (
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-400">Total:</span>
                <span className="font-mono text-sm font-semibold text-white">{form.hours}h</span>
              </div>
            )}
            {!form.startTime && !form.endTime && (
              <div>
                <label htmlFor="wl-hours" className={fieldLabelClasses}>
                  Hours * <span className="font-normal text-slate-500">(or use start/end time above)</span>
                </label>
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="wl-hours"
                    {...getNumericInputProps('decimal')}
                    value={form.hours}
                    onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))}
                    className={`pl-10 ${inputClasses} font-mono`}
                    placeholder="0.0"
                  />
                </div>
                {errors.hours && <p className="mt-1 text-xs text-red-400">{errors.hours}</p>}
              </div>
            )}
            {(form.startTime || form.endTime) && errors.hours && (
              <p className="text-xs text-red-400">{errors.hours}</p>
            )}
          </div>

          <div>
            <label htmlFor="wl-fuel" className={fieldLabelClasses}>
              Fuel litres
            </label>
            <div className="relative">
              <Fuel className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="wl-fuel"
                {...getNumericInputProps('decimal')}
                value={form.fuel}
                onChange={(event) => setForm((current) => ({ ...current, fuel: event.target.value }))}
                className={`pl-10 ${inputClasses} font-mono`}
                placeholder="0.0"
              />
            </div>
            {errors.fuel && <p className="mt-1 text-xs text-red-400">{errors.fuel}</p>}
          </div>

          <div className="rounded-xl border border-green-500/30 bg-green-950/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-green-400">Auto mileage</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="wl-miles" className={fieldLabelClasses}>
                  Miles driven
                </label>
                <input
                  id="wl-miles"
                  {...getNumericInputProps('decimal')}
                  value={form.miles}
                  onChange={(event) => setForm((current) => ({ ...current, miles: event.target.value }))}
                  className={`${inputClasses} font-mono`}
                  placeholder="0"
                />
                {errors.miles && <p className="mt-1 text-xs text-red-400">{errors.miles}</p>}
              </div>
              <div>
                <label htmlFor="wl-start" className={fieldLabelClasses}>
                  Start location
                </label>
                <input
                  id="wl-start"
                  type="text"
                  value={form.startLocation}
                  onChange={(event) => setForm((current) => ({ ...current, startLocation: event.target.value }))}
                  className={inputClasses}
                  placeholder="e.g. Home"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-green-400/60">
              Entering miles saves a linked Business trip in Mileage Log automatically.
            </p>
          </div>

          <div>
            <label htmlFor="wl-notes" className={fieldLabelClasses}>
              Notes (optional)
            </label>
            <input
              id="wl-notes"
              type="text"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className={inputClasses}
              placeholder="e.g. Busy evening, surge pricing"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} className={secondaryButtonClasses}>
              Cancel
            </button>
            <button type="submit" className={primaryButtonClasses}>
              {editingLog ? 'Save changes' : 'Save shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const WorkLog: React.FC<WorkLogProps> = ({
  logs,
  settings,
  onAddLog,
  onUpdateLog,
  onDeleteLog,
  onAddTrip,
  onUpdateTrip,
  onDeleteTrip,
  onNavigateToMileage,
  openFormSignal,
  onOpenFormHandled,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<DailyWorkLog | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DailyWorkLog | null>(null);
  const handledOpenFormSignalRef = useRef<number | undefined>(undefined);

  const sortedLogs = useMemo(() => [...logs].sort((left, right) => right.date.localeCompare(left.date)), [logs]);
  const jobLabel = getJobLabel(settings.driverRoles ?? ['COURIER']);

  useEffect(() => {
    if (!openFormSignal || handledOpenFormSignalRef.current === openFormSignal) return;
    handledOpenFormSignalRef.current = openFormSignal;
    setEditingLog(null);
    setIsFormOpen(true);
    onOpenFormHandled?.();
  }, [onOpenFormHandled, openFormSignal]);

  const openAdd = () => {
    setEditingLog(null);
    setIsFormOpen(true);
  };

  const openEdit = (log: DailyWorkLog) => {
    setEditingLog(log);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingLog(null);
  };

  const handleSave = (form: FormState) => {
    const splits: ProviderSplit[] = form.providers.map((entry) => ({
      provider: entry.provider === 'Other' ? entry.customProvider : entry.provider,
      revenue: parseFloat(entry.revenue),
      jobCount: entry.jobCount ? parseInt(entry.jobCount, 10) : undefined,
    }));

    const primaryProvider = splits[0]?.provider ?? '';
    const totalRevenue = splits.reduce((sum, split) => sum + split.revenue, 0);
    const miles = form.miles ? parseFloat(form.miles) : undefined;
    const multiProvider = splits.length > 1;

    if (editingLog) {
      const updated: DailyWorkLog = {
        ...editingLog,
        date: form.date,
        provider: primaryProvider,
        revenue: totalRevenue,
        hoursWorked: parseFloat(form.hours),
        jobCount: multiProvider ? undefined : splits[0]?.jobCount,
        fuelLiters: form.fuel ? parseFloat(form.fuel) : undefined,
        milesDriven: miles,
        notes: form.notes || undefined,
        providerSplits: multiProvider ? splits : undefined,
      };

      if (miles && miles > 0) {
        if (editingLog.linkedTripId) {
          onUpdateTrip(editingLog.linkedTripId, {
            date: form.date,
            totalMiles: miles,
            startLocation: form.startLocation,
            notes: `Auto from ${primaryProvider} shift`,
          });
        } else {
          const tripId = `trip_auto_${Date.now()}`;
          onAddTrip({
            id: tripId,
            date: form.date,
            startLocation: form.startLocation,
            endLocation: '',
            startOdometer: 0,
            endOdometer: 0,
            totalMiles: miles,
            purpose: 'Business',
            notes: `Auto from ${primaryProvider} shift`,
          });
          updated.linkedTripId = tripId;
        }
      }

      onUpdateLog(updated);
    } else {
      const id = `log_${Date.now()}`;
      const newLog: DailyWorkLog = {
        id,
        date: form.date,
        provider: primaryProvider,
        revenue: totalRevenue,
        hoursWorked: parseFloat(form.hours),
        jobCount: multiProvider ? undefined : splits[0]?.jobCount,
        fuelLiters: form.fuel ? parseFloat(form.fuel) : undefined,
        milesDriven: miles,
        notes: form.notes || undefined,
        providerSplits: multiProvider ? splits : undefined,
      };

      if (miles && miles > 0) {
        const tripId = `trip_auto_${Date.now()}`;
        onAddTrip({
          id: tripId,
          date: form.date,
          startLocation: form.startLocation,
          endLocation: '',
          startOdometer: 0,
          endOdometer: 0,
          totalMiles: miles,
          purpose: 'Business',
          notes: `Auto from ${primaryProvider} shift`,
        });
        newLog.linkedTripId = tripId;
      }

      onAddLog(newLog);
    }

    closeForm();
  };

  const handleDeleteBoth = () => {
    if (!pendingDelete) return;
    if (pendingDelete.linkedTripId) onDeleteTrip(pendingDelete.linkedTripId);
    onDeleteLog(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleDeleteShiftOnly = () => {
    if (!pendingDelete) return;
    onDeleteLog(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-surface-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Work log</h2>
            <p className="text-sm text-slate-400">Log every shift to build your tax record automatically.</p>
          </div>
          <button type="button" onClick={openAdd} className={primaryButtonClasses}>
            <Plus className="h-4 w-4" />
            <span>Add shift</span>
          </button>
        </div>
      </section>

      <WeeklySummaryBar logs={logs} />

      <section className="space-y-2">
        {sortedLogs.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="No shifts logged yet"
            description="Start your first shift to unlock weekly earnings, live tax estimates, and linked mileage tracking."
            action={{ label: 'Start first shift', onClick: openAdd }}
          />
        ) : (
          sortedLogs.map((log) => (
            <article
              key={log.id}
              className="rounded-xl border border-white/6 bg-surface p-4 transition-all duration-200 hover:border-white/10 hover:bg-surface-raised/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-400">{log.date}</span>
                    {log.providerSplits?.length
                      ? log.providerSplits.map((split) => (
                          <span key={split.provider} className={`rounded-full px-2 py-0.5 text-xs ${getProviderBadgeClass(split.provider)}`}>
                            {split.provider} {formatCurrency(split.revenue)}
                          </span>
                        ))
                      : log.provider && (
                          <span className={`rounded-full px-2 py-0.5 text-xs ${getProviderBadgeClass(log.provider)}`}>
                            {log.provider}
                          </span>
                        )}
                    {log.linkedTripId && (
                      <button
                        type="button"
                        onClick={onNavigateToMileage}
                        title="View linked mileage trip"
                        className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400 hover:bg-green-500/25 active:scale-95"
                      >
                        <Link2 className="h-3 w-3" />
                        {log.milesDriven != null ? `${formatNumber(log.milesDriven, 0)}mi` : 'trip'}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-xl font-bold text-green-400">{formatCurrency(log.revenue)}</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                    <span>{formatNumber(log.hoursWorked, 2)}h</span>
                    {log.jobCount != null && (
                      <span>
                        {log.jobCount} {jobLabel.toLowerCase()}
                      </span>
                    )}
                    {log.fuelLiters != null && <span>{formatNumber(log.fuelLiters, 2)}L fuel</span>}
                  </div>
                  {log.notes && <p className="mt-1 text-xs text-slate-500">{log.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    aria-label={`Edit shift on ${log.date}`}
                    onClick={() => openEdit(log)}
                    className={secondaryButtonClasses}
                    title="Edit shift"
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete shift on ${log.date}`}
                    onClick={() => setPendingDelete(log)}
                    className={dangerButtonClasses}
                    title="Delete shift"
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

      {isFormOpen && <WorkLogForm editingLog={editingLog} settings={settings} onSave={handleSave} onCancel={closeForm} />}

      {pendingDelete && (
        <DeleteConfirmDialog
          log={pendingDelete}
          onDeleteBoth={handleDeleteBoth}
          onDeleteShiftOnly={handleDeleteShiftOnly}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};
