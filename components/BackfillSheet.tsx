import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, Minus, Palmtree, X } from 'lucide-react';
import { DailyWorkLog, Settings } from '../types';
import { stampSettings } from '../services/settingsService';
import { getMissedDays } from '../utils/missedDays';
import { todayUK, UK_TZ } from '../utils/ukDate';
import { BulkBackfillCalendar } from './BulkBackfillCalendar';
import {
  formatCurrency,
  formatNumber,
  primaryButtonClasses,
  secondaryButtonClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
  subtlePanelClasses,
} from '../utils/ui';

const PROMPT_KEY = 'dbt_lastBackfillPrompt';

const formatMissedDayLabel = (dateValue: string) =>
  new Date(`${dateValue}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: UK_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

interface BackfillSheetProps {
  dailyLogs: DailyWorkLog[];
  totalLogs: number;
  settings: Settings;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUpdateSettings: (settings: Settings) => void;
  onAddShift: (date: string) => void;
}

export const BackfillSheet: React.FC<BackfillSheetProps> = ({
  dailyLogs,
  totalLogs,
  settings,
  isOpen,
  onOpenChange,
  onUpdateSettings,
  onAddShift,
}) => {
  const [dismissedDates, setDismissedDates] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const missedDays = useMemo(() => getMissedDays(dailyLogs, settings.dayOffDates), [dailyLogs, settings.dayOffDates]);
  const visibleDays = useMemo(
    () => missedDays.filter((date) => !dismissedDates.includes(date)),
    [dismissedDates, missedDays]
  );
  const lastLog = useMemo(
    () => [...dailyLogs].sort((left, right) => right.date.localeCompare(left.date))[0] ?? null,
    [dailyLogs]
  );

  useEffect(() => {
    if (missedDays.length === 0 || dailyLogs.length === 0 || totalLogs === 0) {
      onOpenChange(false);
      return;
    }

    const todayKey = todayUK();
    if (localStorage.getItem(PROMPT_KEY) === todayKey) {
      return;
    }

    localStorage.setItem(PROMPT_KEY, todayKey);
    const timer = setTimeout(() => onOpenChange(true), 1500);
    return () => clearTimeout(timer);
  }, [missedDays, dailyLogs.length, onOpenChange, totalLogs]);

  useEffect(() => {
    if (isOpen) {
      setDismissedDates([]);
    }
  }, [isOpen]);

  if (!isOpen || visibleDays.length === 0) {
    return null;
  }

  return (
    <div className={sheetBackdropClasses} onClick={() => onOpenChange(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Backfill missed shifts"
        data-testid="backfill-sheet"
        className={sheetPanelClasses}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-300">
              <CalendarClock className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Catch up</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white">A couple of days still need a record</h2>
            <p className="mt-2 text-sm text-slate-400">Add a shift, mark a day off, or leave it for later.</p>
          </div>
          <button
            type="button"
            aria-label="Close backfill sheet"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-surface-border bg-surface-raised p-2 text-slate-300 transition-colors hover:bg-surface-border"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <BulkBackfillCalendar
          missedDays={visibleDays}
          selectedDays={selectedDays}
          onToggleDay={(day) => setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
          )}
        />

        {selectedDays.length > 0 && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                // TODO: Wire proper bulk backfill dispatch loop.
                // Currently calls onAddShift for each day individually — this
                // may need a bulk-friendly handler that avoids multiple navigation triggers.
                selectedDays.forEach((day) => onAddShift(day));
                setDismissedDates((current) => [...current, ...selectedDays]);
                setSelectedDays([]);
                onOpenChange(false);
              }}
              className={primaryButtonClasses}
            >
              Backfill selected ({selectedDays.length})
            </button>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {visibleDays.map((date) => (
            <article key={date} className={`${subtlePanelClasses} p-4`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-semibold text-white">{formatMissedDayLabel(date)}</p>
                  {lastLog ? (
                    <p className="mt-1 text-sm text-slate-400">
                      Use last shift as a starting point: {lastLog.provider}, {formatNumber(lastLog.hoursWorked, 1)}h
                      {lastLog.revenue > 0 ? `, ${formatCurrency(lastLog.revenue)}` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">You can add a simple shift entry for this date.</p>
                  )}
                </div>
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-slate-300">{date}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onAddShift(date);
                    setDismissedDates((current) => [...current, date]);
                    onOpenChange(false);
                  }}
                  className={primaryButtonClasses}
                >
                  <span>Add shift</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSettings(stampSettings({
                      ...settings,
                      dayOffDates: [...new Set([...settings.dayOffDates, date])],
                    }));
                    setDismissedDates((current) => [...current, date]);
                  }}
                  className={secondaryButtonClasses}
                >
                  <Palmtree className="h-4 w-4" />
                  <span>Day off</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedDates((current) => [...current, date])}
                  className={secondaryButtonClasses}
                >
                  <Minus className="h-4 w-4" />
                  <span>Skip</span>
                </button>
              </div>
            </article>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setDismissedDates(visibleDays);
            onOpenChange(false);
          }}
          className={`${secondaryButtonClasses} mt-5 w-full justify-center`}
        >
          Skip all
        </button>
      </div>
    </div>
  );
};
