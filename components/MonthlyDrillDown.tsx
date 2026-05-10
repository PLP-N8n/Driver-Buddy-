import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { DailyWorkLog } from '../types';
import { dialogBackdropClasses, dialogPanelClasses, formatCurrency } from '../utils/ui';
import { todayUK } from '../utils/ukDate';

export interface MonthlyDrillDownProps {
  month: number;
  year: number;
  dailyLogs: DailyWorkLog[];
  onDayClick: (date: string) => void;
  onClose: () => void;
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MonthlyDrillDown: React.FC<MonthlyDrillDownProps> = ({
  month,
  year,
  dailyLogs,
  onDayClick,
  onClose,
}) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const logMap = useMemo(() => {
    const map = new Map<string, DailyWorkLog>();
    dailyLogs.forEach((log) => map.set(log.date, log));
    return map;
  }, [dailyLogs]);

  const cells: (number | null)[] = Array.from({ length: firstDay }, () => null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const todayStr = todayUK();

  return (
    <div className={dialogBackdropClasses} onClick={onClose}>
      <div className={dialogPanelClasses} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {new Date(year, month).toLocaleDateString('en-GB', {
              month: 'long',
              year: 'numeric',
            })}
          </h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
          {DAY_HEADERS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {cells.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const log = logMap.get(dateStr);
            const isToday = dateStr === todayStr;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onDayClick(dateStr)}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                  log
                    ? 'border-brand/30 bg-brand/10 text-white'
                    : isToday
                    ? 'border-surface-border bg-surface-raised text-white'
                    : 'border-transparent text-slate-500 hover:bg-surface-raised'
                }`}
              >
                <span className="font-medium">{day}</span>
                {log && (
                  <span className="text-[10px] text-brand">{formatCurrency(log.revenue)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
