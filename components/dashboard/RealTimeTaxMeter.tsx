import React, { useMemo } from 'react';
import { AlertTriangle, Calendar, PiggyBank, Receipt, TrendingUp } from 'lucide-react';
import { DailyWorkLog, Expense, Settings, Trip } from '../../types';
import { buildTaxAnalysis } from '../../utils/tax';
import { filterToCurrentTaxYear, todayUK, ukTaxYearEnd, ukTaxYearStart } from '../../utils/ukDate';
import { formatCurrency, formatNumber } from '../../utils/ui';

function daysUntilTaxDeadline(): number {
  const today = new Date(`${todayUK()}T12:00:00Z`);
  const year = today.getMonth() > 4 ? today.getFullYear() + 1 : today.getFullYear();
  const jan31 = new Date(`${year}-01-31T12:00:00Z`);
  const jul31 = new Date(`${year}-07-31T12:00:00Z`);
  const daysToJan = Math.ceil((jan31.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const daysToJul = Math.ceil((jul31.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysToJan >= 0 && daysToJan < daysToJul) return daysToJan;
  if (daysToJul >= 0) return daysToJul;
  // After Jul 31, next deadline is Jan 31 of following year
  const nextJan = new Date(`${year + 1}-01-31T12:00:00Z`);
  return Math.ceil((nextJan.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getNextDeadlineLabel(): string {
  const today = new Date(`${todayUK()}T12:00:00Z`);
  const year = today.getMonth() > 4 ? today.getFullYear() + 1 : today.getFullYear();
  const jan31 = new Date(`${year}-01-31T12:00:00Z`);
  const jul31 = new Date(`${year}-07-31T12:00:00Z`);
  const daysToJan = Math.ceil((jan31.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const daysToJul = Math.ceil((jul31.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysToJan >= 0 && daysToJan < daysToJul) return '31 Jan';
  if (daysToJul >= 0) return '31 Jul';
  return '31 Jan';
}

type RealTimeTaxMeterProps = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  onNavigateToTax: () => void;
};

export const RealTimeTaxMeter: React.FC<RealTimeTaxMeterProps> = ({
  trips,
  expenses,
  dailyLogs,
  settings,
  onNavigateToTax,
}) => {
  const analysis = useMemo(() => {
    const yearLogs = filterToCurrentTaxYear(dailyLogs);
    const yearTrips = filterToCurrentTaxYear(trips);
    const yearExpenses = filterToCurrentTaxYear(expenses);
    return buildTaxAnalysis({
      trips: yearTrips,
      expenses: yearExpenses,
      dailyLogs: yearLogs,
      settings,
    });
  }, [trips, expenses, dailyLogs, settings]);

  const activeProjection =
    settings.claimMethod === 'ACTUAL'
      ? analysis.actualProjection
      : analysis.simplifiedProjection;

  const totalTax =
    activeProjection.estimatedTax +
    activeProjection.estimatedClass2NI +
    activeProjection.estimatedClass4NI;

  const personalAllowancePercent =
    activeProjection.personalAllowance > 0
      ? Math.min(100, (activeProjection.personalAllowanceUsed / activeProjection.personalAllowance) * 100)
      : 0;

  const taxBand = useMemo(() => {
    const profit = activeProjection.taxableProfit;
    if (profit <= 0) return { label: 'No tax due', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    if (settings.isScottishTaxpayer) return { label: 'Scottish tax rates', color: 'text-sky-400', bg: 'bg-sky-500/10' };
    if (profit <= 12570) return { label: 'Within allowance', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
    if (profit <= 50270) return { label: 'Basic rate (20%)', color: 'text-amber-400', bg: 'bg-amber-500/10' };
    if (profit <= 125140) return { label: 'Higher rate (40%)', color: 'text-orange-400', bg: 'bg-orange-500/10' };
    return { label: 'Additional rate (45%)', color: 'text-red-400', bg: 'bg-red-500/10' };
  }, [activeProjection.taxableProfit, settings.isScottishTaxpayer]);

  const deadlineDays = daysUntilTaxDeadline();
  const deadlineLabel = getNextDeadlineLabel();
  const weeklyTarget = settings.weeklyRevenueTarget;

  const currentYearLabel = useMemo(() => {
    const start = ukTaxYearStart();
    const end = ukTaxYearEnd();
    return `${start.slice(0, 4)}/${end.slice(2, 4)}`;
  }, []);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90 p-5 backdrop-blur-xl"
      onClick={onNavigateToTax}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onNavigateToTax();
      }}
    >
      {/* Glass highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-white/10">
            <Receipt className="h-4 w-4 text-indigo-300" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Tax Year {currentYearLabel}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${taxBand.bg} ${taxBand.color} ring-1 ring-white/5`}>
          <AlertTriangle className="h-3 w-3" />
          {taxBand.label}
        </div>
      </div>

      {/* Main Tax Owed */}
      <div className="mt-5">
        <p className="text-xs text-slate-500">Estimated tax owed</p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="text-3xl font-bold tracking-tight text-white">
            {formatCurrency(totalTax)}
          </p>
          <span className="text-xs text-slate-500">
            ({settings.claimMethod === 'SIMPLIFIED' ? 'Simplified miles' : 'Actual costs'})
          </span>
        </div>
      </div>

      {/* Breakdown grid */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Income tax</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(activeProjection.estimatedTax)}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Class 4 NI</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(activeProjection.estimatedClass4NI)}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Profit after tax</p>
          <p className="mt-1 text-sm font-semibold text-emerald-400">
            {formatCurrency(activeProjection.taxableProfit - totalTax)}
          </p>
        </div>
      </div>

      {/* Personal allowance bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Personal allowance used</span>
          <span className="text-slate-400">{Math.round(personalAllowancePercent)}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all duration-700 ease-out"
            style={{ width: `${personalAllowancePercent}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-slate-600">
          {formatCurrency(activeProjection.personalAllowanceUsed)} of {formatCurrency(activeProjection.personalAllowance)} allowance
        </p>
      </div>

      {/* Deadline + Action row */}
      <div className="mt-4 flex items-center justify-between rounded-xl bg-white/5 p-3 ring-1 ring-white/5">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <div>
            <p className="text-xs text-slate-400">
              Next deadline: <span className="font-medium text-white">{deadlineLabel}</span>
            </p>
            <p className="text-[10px] text-slate-600">
              {deadlineDays > 0 ? `${deadlineDays} days remaining` : 'Deadline passed'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-indigo-300">
          <TrendingUp className="h-3 w-3" />
          <span>View full tax breakdown</span>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
          <PiggyBank className="h-3.5 w-3.5 text-emerald-400" />
          <div>
            <p className="text-[10px] text-slate-600">Revenue</p>
            <p className="text-xs font-semibold text-white">{formatCurrency(analysis.totalRevenue)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
          <Receipt className="h-3.5 w-3.5 text-sky-400" />
          <div>
            <p className="text-[10px] text-slate-600">Deductions</p>
            <p className="text-xs font-semibold text-white">
              {formatCurrency(
                settings.claimMethod === 'SIMPLIFIED'
                  ? analysis.simplifiedDeduction
                  : analysis.actualDeduction
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
