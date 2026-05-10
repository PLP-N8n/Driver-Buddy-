import React, { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { DailyWorkLog } from '../../types';
import { calcPlatformSummaries } from '../../utils/platformInsights';
import { UK_TZ, ukTaxYearEnd, ukTaxYearStart } from '../../utils/ukDate';
import { formatCurrency, formatNumber, panelClasses } from '../../utils/ui';

type DateRange = {
  from: string;
  to: string;
};

type PlatformBreakdownCardProps = {
  logs: DailyWorkLog[];
  dateRange?: DateRange;
};

const formatDateLabel = (dateValue: string) =>
  new Date(`${dateValue}T12:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: UK_TZ,
    day: 'numeric',
    month: 'short',
  });

const getRangeLabel = (dateRange?: DateRange) =>
  dateRange ? `${formatDateLabel(dateRange.from)} - ${formatDateLabel(dateRange.to)}` : 'This tax year';

const hasEarningsData = (log: DailyWorkLog) =>
  log.revenue > 0 || Boolean(log.providerSplits?.some((split) => split.revenue > 0));

export const PlatformBreakdownCard: React.FC<PlatformBreakdownCardProps> = ({ logs, dateRange }) => {
  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'year'>('week');
  const effectiveRange = dateRange ?? { from: ukTaxYearStart(), to: ukTaxYearEnd() };
  const rangeLabel = getRangeLabel(dateRange);

  const filteredLogs = useMemo(() => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    return logs.filter((log) => {
      if (log.date < effectiveRange.from || log.date > effectiveRange.to) return false;

      const logDate = new Date(`${log.date}T12:00:00Z`);
      if (timeFilter === 'week') {
        return logDate >= weekAgo;
      }
      if (timeFilter === 'month') {
        return logDate.getMonth() === today.getMonth() && logDate.getFullYear() === today.getFullYear();
      }
      return true;
    });
  }, [effectiveRange.from, effectiveRange.to, logs, timeFilter]);

  const summaries = useMemo(() => calcPlatformSummaries(filteredLogs), [filteredLogs]);
  const shiftCount = filteredLogs.filter(hasEarningsData).length;

  const visibleSummaries = summaries.slice(0, 5);
  const highestEarnings = visibleSummaries[0]?.totalEarnings ?? 0;
  const hasEnoughData = summaries.length >= 2 && shiftCount >= 3;
  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`;

  return (
    <section className={`${panelClasses} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-400">
            <BarChart3 className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Platform breakdown</p>
          </div>
          <p className="mt-1 text-sm text-slate-500">{rangeLabel}</p>
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-brand">
          {formatNumber(shiftCount, 0)} shifts
        </p>
      </div>

      <div className="mb-4 mt-4 flex gap-2">
        {(['week', 'month', 'year'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setTimeFilter(filter)}
            className={tabClass(timeFilter === filter)}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {!hasEnoughData && (
        <p className="mt-4 text-sm text-slate-500">
          Log at least 3 earning shifts across 2 platforms to compare performance.
        </p>
      )}

      {hasEnoughData && (
        <div className="mt-5 divide-y divide-surface-border/70">
          {visibleSummaries.map((summary) => {
            const barWidth = highestEarnings > 0 ? (summary.totalEarnings / highestEarnings) * 100 : 0;

            return (
              <div key={summary.provider} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{summary.provider}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatCurrency(summary.totalEarnings)} total | {formatNumber(summary.shiftCount, 0)} shift{summary.shiftCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-base font-semibold tracking-tight text-white">
                    {formatCurrency(summary.hourlyRate)} / hr
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${barWidth}%` }}
                    aria-label={`${summary.provider} earns ${formatNumber(summary.earningsShare, 0)}% of platform earnings`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">Hours are estimated from shift records</p>
    </section>
  );
};
