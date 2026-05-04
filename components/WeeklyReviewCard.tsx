import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, X } from 'lucide-react';
import { DailyWorkLog, Settings, Trip } from '../types';
import { todayUK, toUKDateString, ukWeekStart } from '../utils/ukDate';
import { formatCurrency, formatNumber, panelClasses, secondaryButtonClasses, subtlePanelClasses } from '../utils/ui';

const STORAGE_KEY = 'dbt_lastWeeklyReview';

const getSetAsideStatus = (revenue: number, settings: Settings) => ({
  savedByRule: revenue * (settings.taxSetAsidePercent / 100),
});

interface WeeklyReviewCardProps {
  dailyLogs: DailyWorkLog[];
  trips: Trip[];
  settings: Settings;
}

export const WeeklyReviewCard: React.FC<WeeklyReviewCardProps> = ({ dailyLogs, trips, settings }) => {
  const [isVisible, setIsVisible] = useState(false);

  const reviewWindow = useMemo(() => {
    const today = todayUK();
    const currentWeekStart = ukWeekStart(today, settings.workWeekStartDay);
    const previousWeekStart = new Date(`${currentWeekStart}T12:00:00Z`);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
    const previousWeekEnd = new Date(previousWeekStart);
    previousWeekEnd.setUTCDate(previousWeekEnd.getUTCDate() + 6);

    return {
      reviewKey: toUKDateString(previousWeekStart),
      start: toUKDateString(previousWeekStart),
      end: toUKDateString(previousWeekEnd),
      startLabel: previousWeekStart.toLocaleDateString('en-GB', {
        timeZone: 'Europe/London',
        day: 'numeric',
        month: 'short',
      }),
      endLabel: previousWeekEnd.toLocaleDateString('en-GB', {
        timeZone: 'Europe/London',
        day: 'numeric',
        month: 'short',
      }),
    };
  }, [settings.workWeekStartDay]);

  const reviewLogs = useMemo(
    () => dailyLogs.filter((log) => log.date >= reviewWindow.start && log.date <= reviewWindow.end),
    [dailyLogs, reviewWindow.end, reviewWindow.start]
  );
  const reviewTrips = useMemo(
    () =>
      trips.filter(
        (trip) =>
          trip.purpose === 'Business' &&
          trip.date >= reviewWindow.start &&
          trip.date <= reviewWindow.end
      ),
    [reviewWindow.end, reviewWindow.start, trips]
  );

  const reviewMiles = useMemo(
    () => reviewTrips.reduce((sum, trip) => sum + trip.totalMiles, 0),
    [reviewTrips]
  );

  const reviewSummary = useMemo(() => {
    const totalEarned = reviewLogs.reduce((sum, log) => sum + log.revenue, 0);
    const totalExpenses = reviewLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
    const totalKept = totalEarned - totalEarned * (settings.taxSetAsidePercent / 100) - totalExpenses;
    const platformRevenue = new Map<string, number>();

    for (const log of reviewLogs) {
      platformRevenue.set(log.provider || 'Other', (platformRevenue.get(log.provider || 'Other') ?? 0) + log.revenue);
    }

    const [topPlatform = 'Your main platform'] = [...platformRevenue.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
    const setAsideStatus = getSetAsideStatus(totalEarned, settings);
    const shortfall = Math.max(0, settings.weeklyRevenueTarget - totalEarned);
    const recommendation =
      shortfall > 0
        ? `Work 2 more ${topPlatform} shifts next week to close the ${formatCurrency(shortfall)} gap to your weekly target`
        : `Keep leaning on ${topPlatform} if you want to stay ahead of your ${formatCurrency(settings.weeklyRevenueTarget)} target`;

    return {
      totalEarned,
      totalKept,
      topPlatform,
      setAsideStatus,
      recommendation,
    };
  }, [reviewLogs, reviewMiles, settings]);

  useEffect(() => {
    if (reviewLogs.length === 0) {
      setIsVisible(false);
      return;
    }

    setIsVisible(localStorage.getItem(STORAGE_KEY) !== reviewWindow.reviewKey);
  }, [reviewLogs.length, reviewWindow.reviewKey]);

  if (!isVisible) {
    return null;
  }

  return (
    <section data-testid="weekly-review-card" className={`${panelClasses} overflow-hidden p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <CalendarDays className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Weekly review</span>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">Week of {reviewWindow.startLabel} - {reviewWindow.endLabel}</h2>
        </div>
        <button
          type="button"
          aria-label="Dismiss weekly review"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, reviewWindow.reviewKey);
            setIsVisible(false);
          }}
          className="rounded-xl border border-surface-border bg-surface-raised p-2 text-slate-300 transition-colors hover:bg-surface-border"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total earned</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(reviewSummary.totalEarned)}</p>
        </div>
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total kept</p>
          <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(reviewSummary.totalKept)}</p>
        </div>
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Top platform</p>
          <p className="mt-2 text-lg font-semibold text-white">{reviewSummary.topPlatform}</p>
        </div>
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Business miles</p>
          <p className="mt-2 text-lg font-semibold text-white">{formatNumber(reviewMiles, 0)} mi</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-surface-border bg-surface-raised px-4 py-3">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Set-aside rule</p>
        <p className="mt-2 text-sm text-slate-200">
          {formatCurrency(reviewSummary.setAsideStatus.savedByRule)} saved by your rule. See Tax tab for the actual estimate.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Recommendation</p>
        <p className="mt-2 text-sm text-slate-100">{reviewSummary.recommendation}</p>
      </div>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, reviewWindow.reviewKey);
          setIsVisible(false);
        }}
        className={`${secondaryButtonClasses} mt-4 justify-center`}
      >
        <span>Hide review</span>
        <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
};
