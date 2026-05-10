import React from 'react';
import { clsx } from 'clsx';

export interface BulkBackfillCalendarProps {
  missedDays: string[]; // YYYY-MM-DD
  selectedDays: string[];
  onToggleDay: (day: string) => void;
}

export const BulkBackfillCalendar: React.FC<BulkBackfillCalendarProps> = ({ missedDays, selectedDays, onToggleDay }) => {
  return (
    <div className="flex flex-wrap gap-2">
      {missedDays.map((day) => {
        const date = new Date(`${day}T12:00:00Z`);
        const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const isSelected = selectedDays.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onToggleDay(day)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isSelected ? 'bg-brand text-white' : 'border border-surface-border bg-surface-raised text-slate-300'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
