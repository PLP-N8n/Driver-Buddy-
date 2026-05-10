import React, { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { DailyWorkLog, Expense, Settings, Trip } from '../../types';
import { buildMonthlySummaries } from '../../utils/monthlySummary';
import { getTaxYear } from '../../utils/ukDate';
import { formatCurrency, formatNumber, panelClasses, subtlePanelClasses } from '../../utils/ui';
import { MonthlyDrillDown } from '../MonthlyDrillDown';

type MonthlySummaryCardProps = {
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
};

const getShortMonthLabel = (label: string) => label.replace(/\s+\d{4}$/, '');

export const MonthlySummaryCard: React.FC<MonthlySummaryCardProps> = ({
  logs,
  trips,
  expenses,
  settings,
}) => {
  const taxYear = getTaxYear();
  const summaries = useMemo(
    () => buildMonthlySummaries(logs, trips, expenses, settings, taxYear),
    [expenses, logs, settings, taxYear, trips]
  );

  const [showDrillDown, setShowDrillDown] = useState(false);

  if (summaries.length < 2) {
    return null;
  }

  const visibleSummaries = [...summaries].reverse();

  return (
    <section className={`${panelClasses} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-400">
            <CalendarDays className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Monthly summary</p>
          </div>
          <p className="mt-1 text-sm text-slate-500">This tax year</p>
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          {formatNumber(summaries.length, 0)} mo
        </p>
      </div>

      <div className="-mx-5 mt-5 overflow-x-auto px-5 pb-1">
        <div className="flex snap-x gap-3">
          {visibleSummaries.map((summary) => (
            <article key={summary.yearMonth} className={`${subtlePanelClasses} min-w-[154px] snap-start p-4`}>
              <p className="text-sm font-semibold text-white">{getShortMonthLabel(summary.label)}</p>
              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-slate-500">Earnings</p>
                  <p className="font-mono text-base font-semibold tracking-tight text-white">
                    {formatCurrency(summary.earnings)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Kept</p>
                  <p className={`font-mono text-base font-semibold tracking-tight ${summary.kept >= 0 ? 'text-positive' : 'text-red-400'}`}>
                    {formatCurrency(summary.kept)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Set aside</p>
                  <p className="font-mono text-sm font-semibold tracking-tight text-slate-200">
                    {formatCurrency(summary.estimatedTax)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Mileage</p>
                  <p className="font-mono text-sm font-semibold tracking-tight text-slate-200">
                    {formatCurrency(summary.mileageClaimValue)} claimed
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-2">
        <button type="button" onClick={() => setShowDrillDown(true)} className="text-xs text-brand hover:underline">
          Drill down →
        </button>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Based on your {formatNumber(settings.taxSetAsidePercent, 1)}% set-aside rule.
      </p>

      {showDrillDown && (
        <MonthlyDrillDown
          month={new Date().getMonth()}
          year={new Date().getFullYear()}
          dailyLogs={logs}
          onDayClick={() => setShowDrillDown(false)}
          onClose={() => setShowDrillDown(false)}
        />
      )}
    </section>
  );
};
