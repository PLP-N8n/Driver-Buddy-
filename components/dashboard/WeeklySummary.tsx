import React from 'react';
import { Bell, Car, Receipt, Share2, Sparkles } from 'lucide-react';
import { calcKept } from '../../shared/calculations/tax';
import type { CompletedShiftSummary } from '../../types';
import { formatCurrency, formatNumber, panelClasses, primaryButtonClasses, secondaryButtonClasses } from '../../utils/ui';

type WeeklySummaryProps = {
  completedShiftSummary: CompletedShiftSummary;
  summaryHoursWorked: number;
  summaryHourlyRate: number;
  summaryInsight: string | null;
  summaryProgressPercent: number;
  weeklyRevenueTarget: number;
  onDismissCompletedSummary: () => void;
  onShareSummary: (summaryText: string) => void | Promise<void>;
  onAddExpense: () => void;
  onAddMiles: () => void;
  onSetReminder: () => void;
};

const summaryStatClass = 'rounded-2xl border border-surface-border bg-surface-raised px-4 py-3';

const buildEarningsSummaryLine = (summary: CompletedShiftSummary) => {
  const parts = [`You kept ${formatCurrency(summary.realProfit)}`];
  const taxSaved = Math.max(0, summary.mileageClaim + summary.expensesTotal);

  if (taxSaved > 0) {
    parts.push(`saved ${formatCurrency(taxSaved)} tax`);
  }

  if (summary.mileageClaim > 0) {
    parts.push(`claimed ${formatCurrency(summary.mileageClaim)} mileage`);
  }

  return parts.join(', ');
};

export const WeeklySummary: React.FC<WeeklySummaryProps> = ({
  completedShiftSummary,
  summaryHoursWorked,
  summaryHourlyRate,
  summaryInsight,
  summaryProgressPercent,
  weeklyRevenueTarget,
  onDismissCompletedSummary,
  onShareSummary,
  onAddExpense,
  onAddMiles,
  onSetReminder,
}) => {
  // Keep this aligned with the shared tax layer instead of relying on a stored snapshot value.
  const kept = calcKept(
    completedShiftSummary.revenue,
    completedShiftSummary.expensesTotal,
    completedShiftSummary.taxToSetAside
  );
  const earningsSummaryLine = buildEarningsSummaryLine(completedShiftSummary);

  return (
    <section data-testid="shift-summary-card" className={`${panelClasses} p-6`}>
      <div className="flex items-center gap-3 text-emerald-300">
        <Sparkles className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-[0.2em]">Shift done</span>
      </div>

      <div className="mt-5 text-center">
        <p className="text-4xl font-semibold tracking-tight text-white">{formatCurrency(completedShiftSummary.revenue)}</p>
        <p className="mt-2 text-sm text-slate-300">
          {formatNumber(summaryHoursWorked, 2)}h · {formatCurrency(summaryHourlyRate)}/hr
        </p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className={summaryStatClass}>
          <p className="text-xs text-slate-500">Kept</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(kept)}</p>
        </div>
        <div className={summaryStatClass}>
          <p className="text-xs text-slate-500">Set aside</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(completedShiftSummary.taxToSetAside)}</p>
        </div>
        <div className={summaryStatClass}>
          <p className="text-xs text-slate-500">Driven</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatNumber(completedShiftSummary.miles, 0)} mi</p>
        </div>
      </div>

      {summaryInsight && (
        <div className="mt-5 rounded-2xl border border-surface-border bg-surface-raised px-4 py-3">
          <p className="text-sm text-slate-100">{summaryInsight}</p>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-surface-border bg-surface-raised px-4 py-4">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>Weekly target</span>
          <span>{formatCurrency(completedShiftSummary.weekRevenue)} / {formatCurrency(weeklyRevenueTarget)}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${summaryProgressPercent}%` }} />
        </div>
      </div>

      <p className="mt-5 text-center text-sm font-medium text-slate-100">{earningsSummaryLine}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => void onShareSummary(earningsSummaryLine)}
          className={`${secondaryButtonClasses} px-3 py-2 text-xs`}
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
        </button>
        <button
          type="button"
          onClick={onAddExpense}
          className={`${secondaryButtonClasses} px-3 py-2 text-xs`}
        >
          <Receipt className="h-4 w-4" />
          <span>Add expense</span>
        </button>
        <button
          type="button"
          onClick={onAddMiles}
          className={`${secondaryButtonClasses} px-3 py-2 text-xs`}
        >
          <Car className="h-4 w-4" />
          <span>Add miles</span>
        </button>
        <button
          type="button"
          onClick={onSetReminder}
          className={`${secondaryButtonClasses} px-3 py-2 text-xs`}
        >
          <Bell className="h-4 w-4" />
          <span>Set reminder</span>
        </button>
      </div>

      <button type="button" onClick={onDismissCompletedSummary} className={`${primaryButtonClasses} mt-5 w-full justify-center`}>
        Done
      </button>
    </section>
  );
};
