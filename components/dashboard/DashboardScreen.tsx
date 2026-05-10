import React, { useEffect, useMemo, useRef, useState } from 'react';
const { memo } = React;
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  Clock3,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import {
  ActiveWorkSession,
  ActiveWorkSessionExpenseDraft,
  CompletedShiftSummary,
  DailyWorkLog,
  Expense,
  ExpenseCategory,
  ProviderSplit,
  RecurringExpense,
  Settings,
  Trip,
} from '../../types';
import { ActionStrip } from './ActionStrip';
import { BentoHero } from './BentoHero';
import { CollapsibleSection } from './CollapsibleSection';
import { IntelligenceFeed } from './IntelligenceFeed';
import { MonthlySummaryCard } from './MonthlySummaryCard';
import { PlatformBreakdownCard } from './PlatformBreakdownCard';
import { QuickAddForm } from './QuickAddForm';
import { StoryStrip } from './StoryStrip';
import type { StoryCardProps } from './StoryCard';
import { WeeklySummary } from './WeeklySummary';
import { getHabitState } from '../../utils/habitEngine';
import { useRecurringExpensesDue } from '../../hooks/useRecurringExpensesDue';
import { stampSettings } from '../../services/settingsService';
import { generateInsights } from '../../utils/insights';
import { getMissedDays } from '../../utils/missedDays';
import { getProviderOptions } from '../../utils/providers';
import { DriverPrediction, generatePredictions } from '../../utils/predictions';
import { calculateTimestampShiftDurationHours } from '../../utils/shiftDuration';
import { predictNextShift } from '../../utils/shiftPredictor';
import { calculateExpenseTaxClassification } from '../../shared/calculations/expenses';
import { calcMileageAllowance } from '../../shared/calculations/mileage';
import { filterToCurrentTaxYear, todayUK, toUKDateString, UK_TZ, ukWeekStart } from '../../utils/ukDate';
import {
  getEnergyQuantityUnitForCategory,
  getVehicleEnergyExpenseCategory,
  getVehicleEnergyExpenseDescription,
  getVehicleEnergyQuantityUnit,
  isVehicleEnergyExpenseCategory,
} from '../../utils/vehicleFuel';
import {
  formatCurrency,
  formatNumber,
  getNumericInputProps,
  inputClasses,
  panelClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
  subtlePanelClasses,
} from '../../utils/ui';

const DRAFT_STORAGE_KEY = 'dbt_draftEndShift';
const LAST_END_ODOMETER_KEY = 'dbt_lastEndOdometer';
const PREDICTION_DISMISS_FOR_MS = 24 * 60 * 60 * 1000; // 24 hours — short enough to recover from accidental dismiss

const hashPrediction = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
};

export interface DashboardManualEntryRequest {
  token: number;
  date?: string;
}

export interface ManualShiftPayload {
  date: string;
  provider: string;
  hoursWorked: number;
  revenue: number;
  markedNoEarnings?: boolean;
  expenses: ActiveWorkSessionExpenseDraft[];
  startOdometer?: number;
  endOdometer?: number;
  notes?: string;
  providerSplits?: ProviderSplit[];
}

interface DashboardProps {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  activeSession: ActiveWorkSession | null;
  completedShiftSummary: CompletedShiftSummary | null;
  startWorkDayRequest?: number | null;
  manualEntryRequest?: DashboardManualEntryRequest | null;
  onStartWorkDayRequestHandled?: () => void;
  onManualEntryRequestHandled?: () => void;
  onStartSession: (options: { provider: string; startOdometer?: number }) => void;
  onUpdateSession: (updates: Partial<ActiveWorkSession>) => void;
  onCompleteSession: (session: ActiveWorkSession) => CompletedShiftSummary;
  onSaveManualShift: (payload: ManualShiftPayload) => CompletedShiftSummary;
  onShowCompletedSummary: (summary: CompletedShiftSummary) => void;
  onDismissCompletedSummary: () => void;
  onShareCompletedSummary: (summaryText: string) => void | Promise<void>;
  onAddCompletedShiftExpense: (summary: CompletedShiftSummary) => void;
  onAddCompletedShiftMiles: (summary: CompletedShiftSummary) => void;
  onOpenReminderSettings: () => void;
  onSetPredictionReminder: () => void;
  onNavigateToTax: () => void;
  onOpenBackfill: () => void;
  onOpenWorkLog: () => void;
  onAddExpense: (expense: Expense) => void;
  onUpdateSettings: (settings: Settings) => void;
  backupCode?: string;
  onRestoreFromBackupCode?: (code: string) => void | Promise<void>;
}

type EndSheetMode = 'active' | 'manual';
type FuelChoice = 'yes' | 'no';

interface ProviderDraftRow {
  id: string;
  provider: string;
  revenue: string;
  jobCount: string;
}

interface EndShiftDraft {
  providers: ProviderDraftRow[];
  endOdometerValue: string;
  fuelChoice: FuelChoice;
  fuelAmountValue: string;
  fuelLitersValue: string;
  notesValue: string;
  extraExpenseAmountValue: string;
  extraExpenseDescriptionValue: string;
  optionalExpanded: boolean;
}

type SaveShiftOptions = {
  markedNoEarnings?: boolean;
};

const createEmptyDraft = (defaultProvider = 'Work Day'): EndShiftDraft => ({
  providers: [{ id: '1', provider: defaultProvider, revenue: '', jobCount: '' }],
  endOdometerValue: '',
  fuelChoice: 'no',
  fuelAmountValue: '',
  fuelLitersValue: '',
  notesValue: '',
  extraExpenseAmountValue: '',
  extraExpenseDescriptionValue: '',
  optionalExpanded: false,
});

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString('en-GB', {
    timeZone: UK_TZ,
    hour: 'numeric',
    minute: '2-digit',
  });

const formatDateKey = (date: Date) => toUKDateString(date);

const getWeekRange = (dateValue: string, startDay: Settings['workWeekStartDay']) => {
  const start = ukWeekStart(dateValue, startDay);
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start, end: formatDateKey(endDate) };
};

const getWeekSnapshot = (dailyLogs: DailyWorkLog[], settings: Settings, dateValue = todayUK()) => {
  const { start, end } = getWeekRange(dateValue, settings.workWeekStartDay);
  const weekLogs = dailyLogs.filter((log) => log.date >= start && log.date <= end);
  const revenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);
  const taxToSetAside = revenue * (settings.taxSetAsidePercent / 100);
  const expenses = weekLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
  const kept = revenue - taxToSetAside - expenses;
  return { revenue, taxToSetAside, kept };
};

const getDurationHours = (startedAt: string, endedAt = new Date(Date.now()).toISOString()) => {
  return Math.max(0.1, calculateTimestampShiftDurationHours(startedAt, endedAt));
};

const getLastFuelExpense = (expenses: Expense[], targetDate: string) =>
  [...expenses]
    .filter((expense) => isVehicleEnergyExpenseCategory(expense.category))
    .sort((left, right) => right.date.localeCompare(left.date))
    .find((expense) => {
      const target = new Date(`${targetDate}T12:00:00Z`);
      const expenseDate = new Date(`${expense.date}T12:00:00Z`);
      const diffDays = Math.abs(target.getTime() - expenseDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    });

const getShiftTimestamp = (log: DailyWorkLog) => {
  const timestamp = new Date(log.endedAt ?? log.updatedAt ?? `${log.date}T12:00:00Z`).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getMostRecentShift = (logs: DailyWorkLog[]) =>
  [...logs].sort((left, right) => {
    const dateOrder = right.date.localeCompare(left.date);
    return dateOrder || getShiftTimestamp(right) - getShiftTimestamp(left);
  })[0] ?? null;

const getCompletedShiftLog = (logs: DailyWorkLog[], summary: CompletedShiftSummary) => {
  if (summary.shiftId) {
    const matchingLog = logs.find((log) => log.id === summary.shiftId);
    if (matchingLog) return matchingLog;
  }

  const sameDateLogs = logs.filter((log) => log.date === summary.date);
  return getMostRecentShift(sameDateLogs.length > 0 ? sameDateLogs : logs);
};

const getOdometerTemplate = (trips: Trip[], settings: Settings, targetDate: string) => {
  const previousTrip = [...trips]
    .filter((trip) => trip.date <= targetDate)
    .sort((left, right) => right.date.localeCompare(left.date))[0];

  return previousTrip?.endOdometer ?? (settings.financialYearStartOdometer || 0);
};

const getProgressPercent = (current: number, target: number) => {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
};

const pillButtonClass = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
    active ? 'bg-brand text-white' : 'border border-surface-border bg-surface-raised text-slate-300'
  }`;

const summaryStatClass = 'rounded-2xl border border-surface-border bg-surface-raised px-4 py-3';
const getPredictionId = (prediction: DriverPrediction) => hashPrediction(`${prediction.type}:${prediction.message}`);

const RecentShiftItem: React.FC<{ log: DailyWorkLog }> = memo(({ log }) => (
  <div className={`${subtlePanelClasses} flex items-center justify-between px-4 py-3`}>
    <div>
      <p className="text-sm font-medium text-white">
        {new Date(`${log.date}T12:00:00Z`).toLocaleDateString('en-GB', {
          timeZone: UK_TZ,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })}
      </p>
      <p className="text-xs text-slate-500">
        {log.provider}{log.hoursWorked > 0 ? ` · ${formatNumber(log.hoursWorked, 1)} hrs` : ''}{log.jobCount ? ` · ${log.jobCount} jobs` : ''}
      </p>
    </div>
    <div className="text-right">
      <p className="font-mono text-sm font-semibold tracking-tight text-white">{formatCurrency(log.revenue)}</p>
      {log.hoursWorked > 0 && (
        <p className="font-mono text-xs tracking-tight text-slate-500">{formatCurrency(log.revenue / log.hoursWorked)}/hr</p>
      )}
    </div>
  </div>
));

export const DashboardScreen: React.FC<DashboardProps> = ({
  trips,
  expenses,
  dailyLogs,
  settings,
  activeSession,
  completedShiftSummary,
  startWorkDayRequest,
  manualEntryRequest,
  onStartWorkDayRequestHandled,
  onManualEntryRequestHandled,
  onStartSession,
  onUpdateSession,
  onCompleteSession,
  onSaveManualShift,
  onShowCompletedSummary,
  onDismissCompletedSummary,
  onShareCompletedSummary,
  onAddCompletedShiftExpense,
  onAddCompletedShiftMiles,
  onOpenReminderSettings,
  onSetPredictionReminder,
  onNavigateToTax,
  onOpenBackfill,
  onOpenWorkLog,
  onAddExpense,
  onUpdateSettings,
  backupCode,
  onRestoreFromBackupCode,
}) => {
  const [showStartSheet, setShowStartSheet] = useState(false);
  const [showEndSheet, setShowEndSheet] = useState(false);
  const [endSheetMode, setEndSheetMode] = useState<EndSheetMode>('active');
  const [startProvider, setStartProvider] = useState('Work Day');
  const [startOdometer, setStartOdometer] = useState('');
  const [endShiftDraft, setEndShiftDraft] = useState<EndShiftDraft>(createEmptyDraft());
  const [manualShiftDate, setManualShiftDate] = useState(todayUK());
  const [manualProvider, setManualProvider] = useState('Work Day');
  const [manualHoursWorked, setManualHoursWorked] = useState('');
  const [manualStartOdometer, setManualStartOdometer] = useState<number | undefined>(undefined);
  const [endingShift, setEndingShift] = useState(false);
  const [dismissedInsight, setDismissedInsight] = useState<string | null>(null);
  const [storedLastEndOdometer, setStoredLastEndOdometer] = useState<number | null>(null);
  const [predictionRefreshToken, setPredictionRefreshToken] = useState(0);
  const [expandedPredictionId, setExpandedPredictionId] = useState<string | null>(null);
  const shownReminderForSummaryIds = useRef<Set<string>>(new Set());

  const todayKey = todayUK();
  const providerOptions = useMemo(() => getProviderOptions(settings.driverRoles ?? ['COURIER'], startProvider), [settings.driverRoles, startProvider]);
  const todayLogs = useMemo(() => dailyLogs.filter((log) => log.date === todayKey), [dailyLogs, todayKey]);
  const recentLogs = useMemo(() => [...dailyLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [dailyLogs]);
  const mostRecentShift = useMemo(() => getMostRecentShift(dailyLogs), [dailyLogs]);
  const completedShiftLog = useMemo(
    () => (completedShiftSummary ? getCompletedShiftLog(dailyLogs, completedShiftSummary) : null),
    [completedShiftSummary, dailyLogs]
  );
  const missedDays = useMemo(() => getMissedDays(dailyLogs, settings.dayOffDates), [dailyLogs, settings.dayOffDates]);
  const visibleMissedDays = dailyLogs.length > 0 ? missedDays : [];
  const dueRecurringExpenses = useRecurringExpensesDue(settings.recurringExpenses, todayKey, settings.workWeekStartDay);
  const handleLogRecurring = (item: RecurringExpense) => {
    const taxClassification = calculateExpenseTaxClassification({
      amount: item.amount,
      category: item.category,
      claimMethod: settings.claimMethod,
      isVatClaimable: false,
      scope: 'business',
    });

    onAddExpense({
      id: Date.now().toString(),
      date: todayKey,
      category: item.category,
      amount: item.amount,
      description: item.description,
      isVatClaimable: false,
      ...taxClassification,
      sourceType: 'manual',
      reviewStatus: 'confirmed',
      updatedAt: new Date().toISOString(),
    });
    onUpdateSettings(stampSettings({
      ...settings,
      recurringExpenses: settings.recurringExpenses.map((r) =>
        r.id === item.id ? { ...r, lastLoggedDate: todayKey } : r
      ),
    }));
  };
  const trackedMilesForSession = useMemo(() => {
    if (!activeSession) return 0;
    return trips
      .filter((trip) => trip.date === activeSession.date && trip.purpose === 'Business')
      .reduce((sum, trip) => sum + trip.totalMiles, 0);
  }, [activeSession, trips]);

  const activeDurationHours = activeSession ? getDurationHours(activeSession.startedAt) : 0;
  const activeSessionExpenses = activeSession?.expenses ?? [];
  const activeExpenseTotal = activeSessionExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const activeFuelLiters = activeSessionExpenses
    .filter((expense) => expense.category === ExpenseCategory.FUEL)
    .reduce((sum, expense) => sum + (expense.liters ?? 0), 0);
  const liveRevenue = activeSession?.revenue ?? 0;
  const liveMiles = activeSession?.miles ?? trackedMilesForSession;
  const liveSetAside = liveRevenue * (settings.taxSetAsidePercent / 100);
  const liveKept = liveRevenue - liveSetAside - activeExpenseTotal;
  const habitState = useMemo(() => getHabitState(dailyLogs, settings), [dailyLogs, settings]);
  const hasHabitCard =
    habitState.currentStreak >= 3 ||
    Boolean(habitState.reengagementMessage) ||
    (habitState.weeklyTarget > 0 && habitState.weeklyProgress >= 0.9 && habitState.weeklyRevenue < habitState.weeklyTarget);

  const todayRevenue = todayLogs.reduce((sum, log) => sum + log.revenue, 0);
  const todayExpenses = todayLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
  const todaySetAside = todayRevenue * (settings.taxSetAsidePercent / 100);
  const todayKept = todayRevenue - todaySetAside - todayExpenses;

  const outcomeStats = activeSession
    ? { earned: liveRevenue, kept: liveKept, setAside: liveSetAside }
    : { earned: todayRevenue, kept: todayKept, setAside: todaySetAside };

  const weekSnapshot = useMemo(() => getWeekSnapshot(dailyLogs, settings), [dailyLogs, settings]);
  const weekRevenue = weekSnapshot.revenue + (activeSession?.date === todayKey ? liveRevenue : 0);
  const weekProgressPercent = getProgressPercent(weekRevenue, settings.weeklyRevenueTarget);
  const activePrediction = useMemo(
    () =>
      activeSession
        ? predictNextShift(dailyLogs, {
            referenceDate: activeSession.date,
            lastEndOdometer: storedLastEndOdometer,
          })
        : predictNextShift(dailyLogs, {
            referenceDate: todayKey,
            lastEndOdometer: storedLastEndOdometer,
          }),
    [activeSession, dailyLogs, storedLastEndOdometer, todayKey]
  );
  const rankedPredictions = useMemo(() => generatePredictions(dailyLogs, settings), [dailyLogs, settings]);
  const topPrediction = useMemo(() => {
    return rankedPredictions.find((prediction) => {
      const key = `dbt_dismissed_prediction_${hashPrediction(`${prediction.type}:${prediction.message}`)}`;
      const dismissedAt = Number(localStorage.getItem(key) ?? 0);
      return !dismissedAt || Date.now() - dismissedAt > PREDICTION_DISMISS_FOR_MS;
    }) ?? null;
  }, [predictionRefreshToken, rankedPredictions]);
  const manualPrediction = useMemo(
    () =>
      predictNextShift(dailyLogs, {
        referenceDate: manualShiftDate,
        lastEndOdometer: storedLastEndOdometer,
      }),
    [dailyLogs, manualShiftDate, storedLastEndOdometer]
  );
  const taxYearTotals = useMemo(() => {
    const currentYearLogs = filterToCurrentTaxYear(dailyLogs);
    const currentYearTrips = filterToCurrentTaxYear(trips);
    const totalRevenue = currentYearLogs.reduce((sum, log) => sum + log.revenue, 0);
    const totalExpenses = currentYearLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
    const totalBusinessMiles = currentYearTrips
      .filter((trip) => trip.purpose === 'Business')
      .reduce((sum, trip) => sum + trip.totalMiles, 0);
    const mileageClaim = calcMileageAllowance(
      totalBusinessMiles,
      settings.businessRateFirst10k,
      settings.businessRateAfter10k
    );

    return {
      totalRevenue,
      totalExpenses,
      totalBusinessMiles,
      mileageClaim,
      taxSetAside: totalRevenue * (settings.taxSetAsidePercent / 100),
      workDays: currentYearLogs.length,
    };
  }, [dailyLogs, settings, trips]);

  const storiesData = useMemo(() => {
    const stories: StoryCardProps[] = [];
    if (recentLogs[0]) {
      stories.push({
        type: 'recentShift',
        title: 'Recent Shift',
        body: `${recentLogs[0].provider} · ${formatCurrency(recentLogs[0].revenue)}`,
        cta: 'View',
        onCta: () => onOpenWorkLog(),
      });
    }
    if (topPrediction) {
      stories.push({
        type: 'prediction',
        title: 'Insight',
        body: topPrediction.message,
        cta: topPrediction.actionLabel || 'Set Reminder',
        onCta: () => onSetPredictionReminder(),
      });
    }
    if (visibleMissedDays[0]) {
      stories.push({
        type: 'missedDay',
        title: 'Missed Day',
        body: `You didn't log ${visibleMissedDays[0]}. Backfill it now.`,
        cta: 'Backfill',
        onCta: () => onOpenBackfill(),
      });
    }
    const dueRecurringExpense = dueRecurringExpenses[0];
    if (dueRecurringExpense) {
      stories.push({
        type: 'recurring',
        title: 'Recurring Due',
        body: `${dueRecurringExpense.description} · ${formatCurrency(dueRecurringExpense.amount)}`,
        cta: 'Log Now',
        onCta: () => handleLogRecurring(dueRecurringExpense),
      });
    }
    if (hasHabitCard && habitState.currentStreak >= 3) {
      stories.push({
        type: 'habit',
        title: 'Streak',
        body: `${habitState.currentStreak} day streak! Keep it up.`,
        cta: 'Nice',
        onCta: () => {},
      });
    }
    return stories;
  }, [recentLogs, topPrediction, visibleMissedDays, dueRecurringExpenses, hasHabitCard, habitState]);

  const dashboardInsight = useMemo(() => {
    const sourceLog =
      activeSession
        ? ({
            id: activeSession.id,
            date: activeSession.date,
            provider: activeSession.provider || mostRecentShift?.provider || 'Work Day',
            hoursWorked: activeDurationHours,
            revenue: liveRevenue,
            fuelLiters: activeFuelLiters || undefined,
            expensesTotal: activeExpenseTotal || undefined,
            milesDriven: liveMiles || undefined,
          } satisfies DailyWorkLog)
        : todayLogs.length > 0
          ? ({
              id: `today-${todayKey}`,
              date: todayKey,
              provider: todayLogs[0]?.provider || 'Work Day',
              hoursWorked: todayLogs.reduce((sum, log) => sum + log.hoursWorked, 0),
              revenue: todayRevenue,
              fuelLiters: todayLogs.reduce((sum, log) => sum + (log.fuelLiters ?? 0), 0) || undefined,
              expensesTotal: todayExpenses || undefined,
              milesDriven: todayLogs.reduce((sum, log) => sum + (log.milesDriven ?? 0), 0) || undefined,
            } satisfies DailyWorkLog)
          : mostRecentShift;

    if (!sourceLog) return null;

    const insightList = generateInsights(
      sourceLog,
      sourceLog.id.startsWith('today-') || sourceLog.id === activeSession?.id ? [...dailyLogs, sourceLog] : dailyLogs,
      settings,
      trips,
      expenses
    );

    return insightList[0] ?? null;
  }, [
    activeDurationHours,
    activeExpenseTotal,
    activeFuelLiters,
    activeSession,
    dailyLogs,
    expenses,
    liveMiles,
    liveRevenue,
    mostRecentShift,
    settings,
    todayExpenses,
    todayKey,
    todayLogs,
    trips,
    todayRevenue,
  ]);

  const summaryInsight = completedShiftSummary?.insights[0]
    ?? (completedShiftSummary
      ? generateInsights(
          {
            id: completedShiftSummary.id,
            date: completedShiftSummary.date,
            provider: completedShiftLog?.provider || mostRecentShift?.provider || 'Work Day',
            hoursWorked: completedShiftSummary.hoursWorked ?? getDurationHours(completedShiftSummary.startedAt, completedShiftSummary.endedAt),
            revenue: completedShiftSummary.revenue,
            fuelLiters: completedShiftSummary.fuelLiters || undefined,
            expensesTotal: completedShiftSummary.expensesTotal || undefined,
            milesDriven: completedShiftSummary.miles || undefined,
          },
          dailyLogs,
          settings,
          trips,
          expenses
        )[0]
      : null);

  useEffect(() => {
    const storedValue = localStorage.getItem(LAST_END_ODOMETER_KEY);
    if (!storedValue) return;

    const parsed = Number.parseFloat(storedValue);
    if (Number.isFinite(parsed)) {
      setStoredLastEndOdometer(parsed);
    }
  }, []);

  useEffect(() => {
    if (dashboardInsight && dashboardInsight !== dismissedInsight) {
      setDismissedInsight(null);
    }
  }, [dashboardInsight, dismissedInsight]);

  useEffect(() => {
    if (!topPrediction) {
      setExpandedPredictionId(null);
      return;
    }

    const predictionId = hashPrediction(`${topPrediction.type}:${topPrediction.message}`);
    if (expandedPredictionId && expandedPredictionId !== predictionId) {
      setExpandedPredictionId(null);
    }
  }, [expandedPredictionId, topPrediction]);

  const openStartSheet = () => {
    const prediction = predictNextShift(dailyLogs, {
      referenceDate: todayKey,
      lastEndOdometer: storedLastEndOdometer,
    });

    setStartProvider(prediction.provider || 'Work Day');
    setStartOdometer(prediction.startOdometer != null ? String(prediction.startOdometer) : '');
    setShowStartSheet(true);
  };

  useEffect(() => {
    if (!startWorkDayRequest) return;
    openStartSheet();
    onStartWorkDayRequestHandled?.();
  }, [onStartWorkDayRequestHandled, startWorkDayRequest]);

  const applyDraftForContext = (mode: EndSheetMode, dateValue: string, defaultDraft: EndShiftDraft) => {
    const storedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    const draftScope = mode === 'active' && activeSession ? activeSession.id : `manual-${dateValue}`;

    if (!storedDraft) {
      setEndShiftDraft(defaultDraft);
      return;
    }

    try {
      const parsed = JSON.parse(storedDraft) as { scope: string; values: EndShiftDraft & { earningsValue?: string } };
      if (parsed.scope === draftScope) {
        const restored = parsed.values;
        // Migrate old drafts that stored a single earningsValue instead of providers array
        if (!restored.providers) {
          restored.providers = [{
            id: '1',
            provider: defaultDraft.providers[0]?.provider ?? 'Work Day',
            revenue: restored.earningsValue ?? '',
            jobCount: '',
          }];
        }
        setEndShiftDraft(restored);
        return;
      }
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }

    setEndShiftDraft(defaultDraft);
  };

  const openManualEntry = (dateValue = todayKey) => {
    const prediction = predictNextShift(dailyLogs, {
      referenceDate: dateValue,
      lastEndOdometer: storedLastEndOdometer,
    });
    const defaultStartOdometer = prediction.startOdometer ?? getOdometerTemplate(trips, settings, dateValue);
    const defaultEndOdometer =
      prediction.startOdometer != null && prediction.estimatedHours > 0 && mostRecentShift?.milesDriven != null && mostRecentShift.milesDriven > 0
        ? String(Number((defaultStartOdometer + mostRecentShift.milesDriven).toFixed(1)))
        : '';
    const recentFuelExpense = getLastFuelExpense(expenses, dateValue);
    const recentEnergyQuantity = recentFuelExpense?.energyQuantity ?? recentFuelExpense?.liters;

    const defaultProvider = prediction.provider || mostRecentShift?.provider || 'Work Day';
    setManualShiftDate(dateValue);
    setManualProvider(defaultProvider);
    setManualHoursWorked(prediction.estimatedHours > 0 ? String(prediction.estimatedHours) : '');
    setManualStartOdometer(Number.isFinite(defaultStartOdometer) ? defaultStartOdometer : undefined);
    setEndSheetMode('manual');
    const manualDefaultDraft: EndShiftDraft = {
      ...createEmptyDraft(defaultProvider),
      endOdometerValue: defaultEndOdometer,
      fuelChoice: recentFuelExpense ? 'yes' : 'no',
      fuelAmountValue: recentFuelExpense ? String(recentFuelExpense.amount) : '',
      fuelLitersValue: recentEnergyQuantity ? String(recentEnergyQuantity) : '',
    };
    applyDraftForContext('manual', dateValue, manualDefaultDraft);
    setShowEndSheet(true);
  };

  useEffect(() => {
    if (!manualEntryRequest?.token) return;
    openManualEntry(manualEntryRequest.date ?? todayKey);
    onManualEntryRequestHandled?.();
  }, [manualEntryRequest, onManualEntryRequestHandled, todayKey]);

  useEffect(() => {
    if (!showEndSheet) return;

    const scope = endSheetMode === 'active' && activeSession ? activeSession.id : `manual-${manualShiftDate}`;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ scope, values: endShiftDraft }));
  }, [activeSession, endShiftDraft, endSheetMode, manualShiftDate, showEndSheet]);

  const openActiveEndSheet = () => {
    if (!activeSession) return;

    const estimatedEndOdometer =
      activeSession.startOdometer != null
        ? String(Number((activeSession.startOdometer + (activeSession.miles ?? trackedMilesForSession ?? 0)).toFixed(1)))
        : '';
    const recentFuelExpense = getLastFuelExpense(expenses, activeSession.date);
    const recentEnergyQuantity = recentFuelExpense?.energyQuantity ?? recentFuelExpense?.liters;

    setEndSheetMode('active');
    const activeDefaultDraft: EndShiftDraft = {
      ...createEmptyDraft(activeSession.provider ?? 'Work Day'),
      providers: [{
        id: '1',
        provider: activeSession.provider ?? 'Work Day',
        revenue: activeSession.revenue != null ? String(activeSession.revenue) : '',
        jobCount: '',
      }],
      endOdometerValue: estimatedEndOdometer,
      fuelChoice: recentFuelExpense ? 'yes' : 'no',
      fuelAmountValue: recentFuelExpense ? String(recentFuelExpense.amount) : '',
      fuelLitersValue: recentEnergyQuantity ? String(recentEnergyQuantity) : '',
      notesValue: '',
    };
    applyDraftForContext('active', activeSession.date, activeDefaultDraft);
    setShowEndSheet(true);
  };

  const startSession = () => {
    const parsedOdometer = Number.parseFloat(startOdometer);
    onStartSession({
      provider: startProvider || activePrediction.provider || 'Work Day',
      startOdometer: Number.isFinite(parsedOdometer) ? parsedOdometer : undefined,
    });
    setShowStartSheet(false);
    setStartOdometer('');
    setStartProvider(activePrediction.provider || 'Work Day');
  };

  const closeEndSheet = () => {
    setShowEndSheet(false);
  };

  const updateEndShiftDraft = (patch: Partial<EndShiftDraft>) => {
    setEndShiftDraft((current) => ({ ...current, ...patch }));
  };

  const saveShift = (options: SaveShiftOptions = {}) => {
    const parsedProviders = endShiftDraft.providers.map((row) => ({
      ...row,
      provider: row.provider.trim(),
      parsedRevenue: Number.parseFloat(row.revenue),
    }));
    const earningProviders = parsedProviders.filter((row) => Number.isFinite(row.parsedRevenue) && row.parsedRevenue > 0);
    const fallbackProvider = parsedProviders[0] ?? {
      id: 'manual',
      provider: manualProvider || activeSession?.provider || 'Work Day',
      revenue: '',
      jobCount: '',
      parsedRevenue: 0,
    };
    const providersToSave = earningProviders.length > 0
      ? earningProviders
      : options.markedNoEarnings
        ? [fallbackProvider]
        : [];
    const revenue = providersToSave.reduce(
      (sum, row) => sum + (Number.isFinite(row.parsedRevenue) && row.parsedRevenue > 0 ? row.parsedRevenue : 0),
      0
    );
    if (revenue <= 0 && !options.markedNoEarnings) {
      return;
    }
    const markedNoEarnings = revenue === 0 && Boolean(options.markedNoEarnings);
    const providerSplits: ProviderSplit[] = providersToSave.map((row) => {
      const jobCount = Number.parseInt(row.jobCount, 10);
      return {
        provider: row.provider || manualProvider || 'Work Day',
        revenue: Number.isFinite(row.parsedRevenue) && row.parsedRevenue > 0 ? row.parsedRevenue : 0,
        ...(Number.isFinite(jobCount) && jobCount > 0 && { jobCount }),
      };
    });
    const savedProviderSplits = markedNoEarnings ? [] : providerSplits;
    const primaryProvider = providerSplits[0]?.provider ?? (manualProvider || 'Work Day');

    const manualHoursValue = Number.parseFloat(manualHoursWorked || '0');
    if (endSheetMode === 'manual' && (!Number.isFinite(manualHoursValue) || manualHoursValue <= 0)) {
      return;
    }

    const endOdometer = Number.parseFloat(endShiftDraft.endOdometerValue);
    const fuelAmount = Number.parseFloat(endShiftDraft.fuelAmountValue);
    const energyQuantity = Number.parseFloat(endShiftDraft.fuelLitersValue);
    const extraExpenseAmount = Number.parseFloat(endShiftDraft.extraExpenseAmountValue);
    const expenseItems: ActiveWorkSessionExpenseDraft[] = [];

    if (endShiftDraft.fuelChoice === 'yes' && Number.isFinite(fuelAmount) && fuelAmount > 0) {
      const category = getVehicleEnergyExpenseCategory(settings);
      const unit = getEnergyQuantityUnitForCategory(category) ?? getVehicleEnergyQuantityUnit(settings);
      const quantity = Number.isFinite(energyQuantity) && energyQuantity > 0 ? energyQuantity : undefined;
      expenseItems.push({
        id: `${Date.now()}_fuel`,
        category,
        amount: fuelAmount,
        energyQuantity: quantity,
        energyUnit: quantity ? unit : undefined,
        liters: unit === 'litre' ? quantity : undefined,
        description: getVehicleEnergyExpenseDescription(settings),
      });
    }

    if (Number.isFinite(extraExpenseAmount) && extraExpenseAmount > 0) {
      expenseItems.push({
        id: `${Date.now()}_extra`,
        category: ExpenseCategory.OTHER,
        amount: extraExpenseAmount,
        description: endShiftDraft.extraExpenseDescriptionValue || 'Shift expense',
      });
    }

    setEndingShift(true);

    try {
      const summary =
        endSheetMode === 'active' && activeSession
          ? onCompleteSession({
              ...activeSession,
              provider: primaryProvider,
              revenue,
              markedNoEarnings,
              miles:
                Number.isFinite(endOdometer) && activeSession.startOdometer != null
                  ? Math.max(0, endOdometer - activeSession.startOdometer)
                  : activeSession.miles ?? trackedMilesForSession,
              expenses: expenseItems,
              providerSplits: savedProviderSplits,
            })
          : onSaveManualShift({
              date: manualShiftDate,
              provider: primaryProvider,
              hoursWorked: manualHoursValue,
              revenue,
              markedNoEarnings,
              expenses: expenseItems,
              startOdometer: manualStartOdometer,
              endOdometer: Number.isFinite(endOdometer) ? endOdometer : undefined,
              notes: endShiftDraft.notesValue || undefined,
              providerSplits: savedProviderSplits,
            });

      if (Number.isFinite(endOdometer)) {
        localStorage.setItem(LAST_END_ODOMETER_KEY, String(endOdometer));
        setStoredLastEndOdometer(endOdometer);
      }
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setShowEndSheet(false);
      window.setTimeout(() => {
        onShowCompletedSummary(summary);
        setEndingShift(false);
      }, 350);
    } catch {
      setEndingShift(false);
    }
  };

  const dismissPrediction = (predictionMessage: string, predictionType: string) => {
    const key = `dbt_dismissed_prediction_${hashPrediction(`${predictionType}:${predictionMessage}`)}`;
    localStorage.setItem(key, String(Date.now()));
    setPredictionRefreshToken((current) => current + 1);
    setExpandedPredictionId(null);
  };

  const summaryHoursWorked =
    completedShiftSummary?.hoursWorked ?? (completedShiftSummary ? getDurationHours(completedShiftSummary.startedAt, completedShiftSummary.endedAt) : 0);
  const summaryHourlyRate =
    completedShiftSummary && summaryHoursWorked > 0
      ? completedShiftSummary.revenue / summaryHoursWorked
      : 0;
  const summaryProgressPercent = completedShiftSummary
    ? getProgressPercent(completedShiftSummary.weekRevenue, settings.weeklyRevenueTarget)
    : 0;
  const completedSummaryLogId = completedShiftSummary?.shiftId ?? completedShiftSummary?.id;
  const isCompletedSummaryFirstShift = Boolean(
    completedShiftSummary &&
    dailyLogs.length === 1 &&
    dailyLogs[0]?.id === completedSummaryLogId &&
    !shownReminderForSummaryIds.current.has(completedShiftSummary.id)
  );
  const markCompletedSummaryReminderHandled = () => {
    if (!completedShiftSummary) return;
    shownReminderForSummaryIds.current.add(completedShiftSummary.id);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-1 pb-4 pt-2">
      {completedShiftSummary ? (
        <WeeklySummary
          completedShiftSummary={completedShiftSummary}
          completedLog={completedShiftLog}
          trips={trips}
          expenses={expenses}
          summaryHoursWorked={summaryHoursWorked}
          summaryHourlyRate={summaryHourlyRate}
          summaryInsight={summaryInsight ?? null}
          summaryProgressPercent={summaryProgressPercent}
          weeklyRevenueTarget={settings.weeklyRevenueTarget}
          isFirstShift={isCompletedSummaryFirstShift}
          onDismissCompletedSummary={onDismissCompletedSummary}
          onShareSummary={onShareCompletedSummary}
          onAddExpense={() => onAddCompletedShiftExpense(completedShiftSummary)}
          onAddMiles={() => onAddCompletedShiftMiles(completedShiftSummary)}
          onSetReminder={onOpenReminderSettings}
          onReminderNudgeHandled={markCompletedSummaryReminderHandled}
        />
      ) : (
        <>
          <BentoHero
            taxMeterProps={{ trips, expenses, dailyLogs, settings, onNavigateToTax }}
            todayRevenue={todayRevenue}
            weekRevenue={weekRevenue}
            weeklyRevenueTarget={settings.weeklyRevenueTarget}
            weekProgressPercent={weekProgressPercent}
            taxSaved={taxYearTotals.taxSetAside}
            totalBusinessMiles={taxYearTotals.totalBusinessMiles}
            activeSession={activeSession}
            activeDurationHours={activeDurationHours}
            hasAnyLoggedShifts={dailyLogs.length > 0}
            onTileClick={(tile) => {
              if (tile === 'today') onNavigateToTax();
              if (tile === 'week') onNavigateToTax();
              if (tile === 'tax') onNavigateToTax();
              if (tile === 'miles') onOpenWorkLog();
            }}
          />

          <ActionStrip
            activeSession={activeSession ? { startedAt: activeSession.startedAt } : null}
            activeDurationHours={activeDurationHours}
            hasAnyLoggedShifts={dailyLogs.length > 0}
            backupCode={backupCode}
            onStartShift={openStartSheet}
            onEndShift={openActiveEndSheet}
            onQuickAddRevenue={() => onUpdateSession({ revenue: liveRevenue + 10 })}
            onAddShift={() => openManualEntry()}
            onRestoreFromBackupCode={onRestoreFromBackupCode}
          />

          <StoryStrip stories={storiesData} />

          <CollapsibleSection title="Platform Breakdown" defaultExpanded>
            <PlatformBreakdownCard logs={dailyLogs} />
          </CollapsibleSection>

          <CollapsibleSection title="Monthly Summary">
            <MonthlySummaryCard
              logs={dailyLogs}
              trips={trips}
              expenses={expenses}
              settings={settings}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Intelligence Feed" defaultExpanded>
            <IntelligenceFeed
              dashboardInsight={dashboardInsight}
              dismissedInsight={dismissedInsight}
              onDismissInsight={setDismissedInsight}
              topPrediction={topPrediction}
              isPredictionExpanded={topPrediction ? expandedPredictionId === getPredictionId(topPrediction) : false}
              onTogglePrediction={() => {
                if (!topPrediction) return;
                const predictionId = getPredictionId(topPrediction);
                setExpandedPredictionId((current) => (current === predictionId ? null : predictionId));
              }}
              onDismissPrediction={dismissPrediction}
              onSetReminder={onSetPredictionReminder}
              missedDays={visibleMissedDays}
              onOpenBackfill={onOpenBackfill}
              dueRecurringExpenses={dueRecurringExpenses}
              onLogRecurring={handleLogRecurring}
            />
          </CollapsibleSection>

          {recentLogs.length > 0 && (
            <section className={`${panelClasses} p-5`}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent shifts</p>
              <div className="mt-3 space-y-2">
                {recentLogs.map((log) => (
                  <RecentShiftItem key={log.id} log={log} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <QuickAddForm
        showStartSheet={showStartSheet}
        showEndSheet={showEndSheet}
        endingShift={endingShift}
        providerOptions={providerOptions}
        startProvider={startProvider}
        onStartProviderChange={setStartProvider}
        startOdometer={startOdometer}
        onStartOdometerChange={setStartOdometer}
        storedLastEndOdometer={storedLastEndOdometer}
        activePrediction={activePrediction}
        onCloseStartSheet={() => setShowStartSheet(false)}
        onStartSession={startSession}
        onCloseEndSheet={closeEndSheet}
        endSheetMode={endSheetMode}
        activeDurationHours={activeDurationHours}
        manualShiftDate={manualShiftDate}
        manualPrediction={manualPrediction}
        manualProviderOptions={getProviderOptions(settings.driverRoles ?? ['COURIER'], manualProvider)}
        endShiftProviderOptions={getProviderOptions(
          settings.driverRoles ?? ['COURIER'],
          endSheetMode === 'active' ? activeSession?.provider : manualProvider,
          ...endShiftDraft.providers.map((row) => row.provider)
        )}
        manualProvider={manualProvider}
        onManualProviderChange={setManualProvider}
        manualHoursWorked={manualHoursWorked}
        onManualHoursWorkedChange={setManualHoursWorked}
        endShiftDraft={endShiftDraft}
        onUpdateEndShiftDraft={updateEndShiftDraft}
        onSaveShift={saveShift}
        activeSessionEstimatedRevenue={activePrediction}
        settings={settings}
      />
    </div>
  );
};
