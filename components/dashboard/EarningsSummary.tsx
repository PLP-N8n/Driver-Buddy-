import React from 'react';
import { Clock3 } from 'lucide-react';
import { formatCurrency, formatNumber, panelClasses, primaryButtonClasses, secondaryButtonClasses, subtlePanelClasses } from '../../utils/ui';

type EarningsSummaryProps = {
  activeSession: { startedAt: string } | null;
  todayLogsCount: number;
  outcomeStats: {
    earned: number;
    kept: number;
    setAside: number;
  };
  activeDurationHours: number;
  weekRevenue: number;
  weeklyRevenueTarget: number;
  weekProgressPercent: number;
  onEndShift: () => void;
  onQuickAddRevenue: () => void;
  onStartShift: () => void;
  onAddShift: () => void;
  liveRevenue: number;
  liveMiles: number;
  liveTax: number;
  formatTime: (value: string) => string;
};

const summaryStatClass = 'rounded-2xl border border-surface-border bg-surface-raised px-4 py-3';

export const EarningsSummary: React.FC<EarningsSummaryProps> = ({
  activeSession,
  todayLogsCount,
  outcomeStats,
  activeDurationHours,
  weekRevenue,
  weeklyRevenueTarget,
  weekProgressPercent,
  onEndShift,
  onQuickAddRevenue,
  onStartShift,
  onAddShift,
  liveRevenue,
  liveMiles,
  liveTax,
  formatTime,
}) => (
  <>
    <section className={`${panelClasses} overflow-hidden p-5`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            {activeSession ? 'Shift active' : todayLogsCount > 0 ? 'Today' : 'Ready for today?'}
          </p>
          <h1 className="mt-2 font-mono text-3xl font-semibold tracking-tight text-white">{formatCurrency(outcomeStats.earned)}</h1>
          <p className="mt-1 text-sm text-slate-400">{activeSession ? 'Live outcome from your current session.' : 'What today looks like so far.'}</p>
        </div>
        {activeSession && (
          <div className="rounded-full border border-positive/30 bg-positive-muted px-3 py-2 text-xs font-semibold text-positive">
            {formatNumber(activeDurationHours, 2)}h live
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className={summaryStatClass}>
          <p className="text-xs text-slate-500">Earned</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-white">{formatCurrency(outcomeStats.earned)}</p>
        </div>
        <div className={summaryStatClass}>
          <p className="text-xs text-slate-500">Kept</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-white">{formatCurrency(outcomeStats.kept)}</p>
        </div>
        <div className={summaryStatClass}>
          <p className="text-xs text-slate-500">Set aside</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-white">{formatCurrency(outcomeStats.setAside)}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between text-sm text-slate-300">
          <span>Weekly progress</span>
          <span>{formatCurrency(weekRevenue)} / {formatCurrency(weeklyRevenueTarget)} wk</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${weekProgressPercent}%` }} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {activeSession ? (
          <>
            <button type="button" onClick={onEndShift} className={`${primaryButtonClasses} justify-center`}>
              End shift
            </button>
            <button type="button" onClick={onQuickAddRevenue} className={`${secondaryButtonClasses} justify-center`}>
              + £10 quick add
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onStartShift} className={`${primaryButtonClasses} justify-center`}>
              Start Shift
            </button>
            <button type="button" onClick={onAddShift} className={`${secondaryButtonClasses} justify-center`}>
              Add shift
            </button>
          </>
        )}
      </div>
    </section>

    {activeSession && (
      <section className={`${panelClasses} p-5`}>
        <div className="flex items-center gap-3 text-positive">
          <Clock3 className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Session running</span>
        </div>
        <p className="mt-3 text-sm text-slate-400">Started at {formatTime(activeSession.startedAt)}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="text-xs text-slate-500">Earnings</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-white">{formatCurrency(liveRevenue)}</p>
          </div>
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="text-xs text-slate-500">Miles</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-white">{formatNumber(liveMiles, 1)} mi</p>
          </div>
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="text-xs text-slate-500">Tax so far</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-tight text-white">{formatCurrency(liveTax)}</p>
          </div>
        </div>
      </section>
    )}
  </>
);
