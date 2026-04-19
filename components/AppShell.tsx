import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calculator,
  Car,
  Clock3,
  CreditCard,
  Download,
  MessageSquare,
  HelpCircle,
  Home,
  LucideIcon,
  MoreHorizontal,
  Receipt,
  Settings as SettingsIcon,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ActiveWorkSession,
  AppTab,
  CompletedShiftSummary,
  Coordinate,
  DailyWorkLog,
  Expense,
  ExpenseCategory,
  PlayerStats,
  Settings,
  Trip,
  getCurrentTaxYearLabel,
} from '../types';
import { Dashboard, DashboardManualEntryRequest, ManualShiftPayload } from './Dashboard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { SyncIndicator } from './SyncIndicator';
import { FeedbackSheet } from './FeedbackSheet';
import { OnboardingModal } from './OnboardingModal';
import { SetupReminderBanner } from './SetupReminderBanner';
import { UpdateBanner } from './UpdateBanner';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { Toast } from './Toast';
import * as Sentry from '../src/sentry';
import { getAnimationClass, useReducedMotion } from '../utils/animations';
import { escapeCsvCell } from '../utils/csv';
import { generateInsights } from '../utils/insights';
import { todayUK, ukWeekStart } from '../utils/ukDate';
import { useBackupRestore } from '../hooks/useBackupRestore';
import { useAppState, type ToastState } from '../hooks/useAppState';
import { useExport } from '../hooks/useExport';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHydration } from '../hooks/useHydration';
import { usePersistence } from '../hooks/usePersistence';
import { useReceiptMigration } from '../hooks/useReceiptMigration';
import { useSyncOrchestrator } from '../hooks/useSyncOrchestrator';
import { trackEvent } from '../services/analyticsService';
import {
  dialogBackdropClasses,
  dialogPanelClasses,
  formatCurrency,
  iconButtonClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
} from '../utils/ui';

const ExpenseLog = lazy(() => import('./ExpenseLog').then((m) => ({ default: m.ExpenseLog })));
const MileageLog = lazy(() => import('./MileageLog').then((m) => ({ default: m.MileageLog })));
const WorkLog = lazy(() => import('./WorkLog').then((m) => ({ default: m.WorkLog })));
const TaxLogic = lazy(() => import('./TaxLogic').then((m) => ({ default: m.TaxLogic })));
const TaxAssistant = lazy(() => import('./TaxAssistant').then((m) => ({ default: m.TaxAssistant })));
const DebtManager = lazy(() => import('./DebtManager').then((m) => ({ default: m.DebtManager })));
const SettingsPanel = lazy(() => import('./Settings').then((m) => ({ default: m.SettingsPanel })));
const BackfillSheet = lazy(() => import('./BackfillSheet').then((m) => ({ default: m.BackfillSheet })));
const FaqSheet = lazy(() => import('./FaqSheet').then((m) => ({ default: m.FaqSheet })));

const getTodayKey = todayUK;
const nowIso = () => new Date(Date.now()).toISOString();
const TAX_REMINDER_KEY_PREFIX = 'dbt_tax_reminder_shown_';
const DELETED_IDS_KEY = 'driver_deleted_ids';

type DeletedIdsState = {
  workLogs: string[];
  mileageLogs: string[];
  expenses: string[];
  shifts: string[];
};

const createEmptyDeletedIds = (): DeletedIdsState => ({
  workLogs: [],
  mileageLogs: [],
  expenses: [],
  shifts: [],
});

const loadDeletedIds = (): DeletedIdsState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETED_IDS_KEY) ?? '{}') as Partial<DeletedIdsState>;
    return {
      workLogs: Array.isArray(parsed.workLogs) ? parsed.workLogs : [],
      mileageLogs: Array.isArray(parsed.mileageLogs) ? parsed.mileageLogs : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
    };
  } catch {
    return createEmptyDeletedIds();
  }
};

const pageMeta: Record<AppTab, { title: string; description: string }> = {
  dashboard: { title: 'Dashboard', description: 'Revenue, mileage, and tax readiness at a glance.' },
  mileage: { title: 'Mileage', description: 'Keep an HMRC-ready log of every trip.' },
  expenses: { title: 'Expenses', description: 'Capture receipts and track business costs.' },
  worklog: { title: 'Work Log', description: 'Review shifts, earnings, and efficiency.' },
  tax: { title: 'Tax', description: 'Estimate liability using 2025/26 rules.' },
  debt: { title: 'Debt Manager', description: 'Plan repayments alongside driving income.' },
  settings: { title: 'Settings', description: 'Control claim method, allocations, and backups.' },
};

const primaryTabs: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'mileage', label: 'Mileage', icon: Car },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'worklog', label: 'Work Log', icon: Clock3 },
  { id: 'tax', label: 'Tax', icon: Calculator },
];

const BottomNavButton: React.FC<{
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}> = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    onClick={onClick}
    className={`${
      active ? 'relative bg-brand/[0.07]' : ''
    } flex min-h-[56px] min-w-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 transition-all duration-200 active:scale-95 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]`}
  >
    <div className={`absolute inset-x-3 top-1 h-[3px] rounded-full bg-brand transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`} />
    <Icon className={`h-5 w-5 ${active ? 'text-brand' : 'text-slate-500'}`} />
    <span className={`text-[10px] leading-none tracking-wide ${active ? 'font-semibold text-brand' : 'font-medium text-slate-500'}`}>
      {label}
    </span>
  </button>
);

const MoreSheetButton: React.FC<{
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
}> = ({ icon: Icon, label, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-2xl border border-surface-border bg-surface px-4 py-4 text-left text-white transition-colors duration-150 transition-transform active:scale-95 hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]"
  >
    <div className="rounded-xl bg-surface-raised p-3 text-slate-200">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  </button>
);

export function AppShell() {
  const prefersReducedMotion = useReducedMotion();
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const exportModalRef = useRef<HTMLDivElement | null>(null);
  const [deletedIds, setDeletedIds] = useState<DeletedIdsState>(() => loadDeletedIds());
  const {
    activeTab,
    setActiveTab,
    trips,
    setTrips,
    expenses,
    setExpenses,
    dailyLogs,
    setDailyLogs,
    activeSession,
    setActiveSession,
    completedShiftSummary,
    setCompletedShiftSummary,
    settings,
    setSettings,
    playerStats,
    setPlayerStats,
    hasHydrated,
    setHasHydrated,
    showMoreMenu,
    setShowMoreMenu,
    showFeedback,
    setShowFeedback,
    showFaq,
    setShowFaq,
    showExportModal,
    setShowExportModal,
    showOnboarding,
    setShowOnboarding,
    quickLogRequest,
    setQuickLogRequest,
    startWorkDayRequest,
    setStartWorkDayRequest,
    manualEntryRequest,
    setManualEntryRequest,
    isBackfillOpen,
    setIsBackfillOpen,
    toast,
    setToast,
    showTaxReminder,
    setShowTaxReminder,
  } = useAppState();
  const persistDeletedIds = (next: DeletedIdsState) => {
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(next));
  };
  const appendDeletedId = (key: keyof DeletedIdsState, id: string) => {
    setDeletedIds((current) => {
      if (current[key].includes(id)) {
        return current;
      }

      const next = { ...current, [key]: [...current[key], id] };
      persistDeletedIds(next);
      return next;
    });
  };
  const appendDeletedDailyLogId = (id: string) => {
    setDeletedIds((current) => {
      const workLogs = current.workLogs.includes(id) ? current.workLogs : [...current.workLogs, id];
      const shifts = current.shifts.includes(id) ? current.shifts : [...current.shifts, id];
      if (workLogs === current.workLogs && shifts === current.shifts) {
        return current;
      }

      const next = {
        ...current,
        workLogs,
        shifts,
      };
      persistDeletedIds(next);
      return next;
    });
  };
  const clearDeletedIds = () => {
    setDeletedIds((current) => {
      if (!current.workLogs.length && !current.mileageLogs.length && !current.expenses.length && !current.shifts.length) {
        return current;
      }

      const next = createEmptyDeletedIds();
      persistDeletedIds(next);
      return next;
    });
  };
  useFocusTrap(moreMenuRef, showMoreMenu, () => setShowMoreMenu(false));
  useFocusTrap(exportModalRef, showExportModal, () => setShowExportModal(false));
  const { isOnline, connectivityBanner } = useSyncOrchestrator({
    trips,
    expenses,
    dailyLogs,
    settings,
    deletedIds,
    hasHydrated,
    onPushSuccess: clearDeletedIds,
  });

  const showToast = (message: string, type: ToastState['type'] = 'success', duration = 3000) => {
    setToast({ id: Date.now(), message, type, duration });
  };
  const navigateToTab = (tab: AppTab, options?: { preserveQuickLog?: boolean }) => {
    if (!options?.preserveQuickLog) {
      setQuickLogRequest(null);
    }
    setActiveTab(tab);
  };
  const hasEverBeenAdvanced = playerStats.totalLogs >= 3 || localStorage.getItem('dbt_advanced') === '1';
  const isAdvancedUser = hasHydrated ? hasEverBeenAdvanced : true;
  useEffect(() => {
    trackEvent('app_open');
  }, []);
  useEffect(() => {
    if (playerStats.totalLogs >= 3) localStorage.setItem('dbt_advanced', '1');
  }, [playerStats.totalLogs]);
  useEffect(() => {
    const today = todayUK();
    const currentYear = Number(today.slice(0, 4));
    const windowStart = `${currentYear}-01-31`;
    const windowEnd = `${currentYear}-04-05`;
    const storageKey = `${TAX_REMINDER_KEY_PREFIX}${currentYear}`;

    if (today < windowStart || today > windowEnd || localStorage.getItem(storageKey) === 'true') {
      return;
    }

    setShowTaxReminder(true);
  }, []);

  useEffect(() => {
    setPlayerStats((current) =>
      current.totalLogs === dailyLogs.length
        ? current
        : {
            ...current,
            totalLogs: dailyLogs.length,
          }
    );
  }, [dailyLogs.length]);
  useEffect(() => {
    if (!hasHydrated) return;
    if (isAdvancedUser) return;
    if (activeTab === 'debt') {
      navigateToTab('dashboard');
    }
  }, [activeTab, isAdvancedUser, hasHydrated]);
  useEffect(() => {
    if (!quickLogRequest) return;
    if (quickLogRequest.tab !== activeTab) {
      setQuickLogRequest(null);
    }
  }, [activeTab, quickLogRequest]);
  useEffect(() => {
    const theme = settings.colorTheme === 'LIGHT' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [settings.colorTheme]);
  const addTrip = (trip: Trip) => {
    setTrips((current) => [...current, { ...trip, updatedAt: nowIso() }]);
    trackEvent('trip_logged');
  };
  const deleteTrip = (id: string) => {
    setTrips((current) => current.filter((trip) => trip.id !== id));
    appendDeletedId('mileageLogs', id);
    trackEvent('trip_deleted');
  };
  const updateTrip = (id: string, updates: Partial<Trip>) =>
    setTrips((current) => current.map((trip) => (trip.id === id ? { ...trip, ...updates, updatedAt: nowIso() } : trip)));
  const addExpense = (expense: Expense) => {
    setExpenses((current) => [...current, { ...expense, updatedAt: nowIso() }]);
    trackEvent('expense_added', { category: expense.category });
  };
  const deleteExpense = (id: string) => {
    setExpenses((current) => current.filter((expense) => expense.id !== id));
    appendDeletedId('expenses', id);
    trackEvent('expense_deleted');
  };
  const updateExpense = (expense: Expense) =>
    setExpenses((current) => current.map((item) => (item.id === expense.id ? { ...expense, updatedAt: nowIso() } : item)));
  const addDailyLog = (log: DailyWorkLog) => {
    setDailyLogs((current) => [...current, { ...log, updatedAt: nowIso() }]);
    trackEvent('shift_logged', { platform: log.provider });
  };
  const deleteDailyLog = (id: string) => {
    setDailyLogs((current) => current.filter((log) => log.id !== id));
    appendDeletedDailyLogId(id);
    trackEvent('shift_deleted');
  };
  const updateDailyLog = (log: DailyWorkLog) =>
    setDailyLogs((current) => current.map((item) => (item.id === log.id ? { ...log, updatedAt: nowIso() } : item)));

  const calculateMileageClaim = (miles: number) => {
    const totalBusinessMiles = trips.filter((trip) => trip.purpose === 'Business').reduce((sum, trip) => sum + trip.totalMiles, 0);
    const remainingAtPrimaryRate = Math.max(0, 10000 - totalBusinessMiles);
    const milesAtPrimaryRate = Math.min(miles, remainingAtPrimaryRate);
    const milesAtSecondaryRate = Math.max(0, miles - milesAtPrimaryRate);
    return milesAtPrimaryRate * settings.businessRateFirst10k + milesAtSecondaryRate * settings.businessRateAfter10k;
  };

  const announceDownload = (recordCount: number) => {
    showToast(`Downloading ${recordCount} records...`, 'info', 1000);
  };

  const queueDownload = (recordCount: number, callback: () => void) => {
    announceDownload(recordCount);
    window.setTimeout(callback, 1000);
  };

  const triggerTextDownload = (filename: string, content: string, mimeType = 'text/csv') => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  };
  const {
    backupCode,
    setBackupCode,
    restoreStatusMessage,
    handleBackup,
    handleRestore,
    handleCopyBackupCode,
    handleRestoreFromBackupCode,
  } = useBackupRestore({
    trips,
    expenses,
    dailyLogs,
    settings,
    playerStats,
    showToast,
    setTrips,
    setExpenses,
    setDailyLogs,
    setSettings,
    setPlayerStats,
    triggerTextDownload,
    queueDownload,
  });
  useHydration({
    setTrips,
    setExpenses,
    setDailyLogs,
    setActiveSession,
    setCompletedShiftSummary,
    setSettings,
    setPlayerStats,
    setHasHydrated,
    setBackupCode,
  });
  usePersistence({
    trips,
    expenses,
    dailyLogs,
    activeSession,
    completedShiftSummary,
    settings,
    playerStats,
    activeTab,
    isAdvancedUser,
    showToast,
  });
  useReceiptMigration({
    expenses,
    hasHydrated,
    isOnline,
    setExpenses,
  });
  const { exportConfig, setExportConfig, handleExport, handleHmrcSummaryExport } = useExport({
    trips,
    expenses,
    dailyLogs,
    settings,
    trackEvent,
    triggerTextDownload,
    queueDownload,
    setShowExportModal,
  });

  const startActiveSession = ({ provider, startOdometer }: { provider: string; startOdometer?: number }) => {
    Sentry.addBreadcrumb({ category: 'shift', message: 'shift_started' });
    trackEvent('shift_started', { date: getTodayKey() });
    setCompletedShiftSummary(null);
    setActiveSession({
      id: `${Date.now()}_session`,
      date: todayUK(),
      startedAt: nowIso(),
      provider,
      startOdometer,
      expenses: [],
    });
    navigateToTab('dashboard');
  };

  const updateActiveSession = (updates: Partial<ActiveWorkSession>) =>
    setActiveSession((current) => (current ? { ...current, ...updates } : current));

  const finalizeActiveSession = (session: ActiveWorkSession): CompletedShiftSummary => {
    Sentry.addBreadcrumb({ category: 'shift', message: 'shift_completed' });
    trackEvent('shift_completed', { date: session.date });
    const endedAt = nowIso();
    const updatedAt = nowIso();
    const revenue = Number(session.revenue ?? 0);
    const miles = Number(session.miles ?? 0);
    const sessionExpenses = session.expenses ?? [];
    const expensesTotal = sessionExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const fuelLiters = sessionExpenses
      .filter((expense) => expense.category === ExpenseCategory.FUEL)
      .reduce((sum, expense) => sum + (expense.liters ?? 0), 0);
    const taxToSetAside = revenue * (settings.taxSetAsidePercent / 100);
    const mileageClaim = calculateMileageClaim(miles);
    const realProfit = revenue - taxToSetAside - expensesTotal;
    const startedAtDate = new Date(session.startedAt);
    const endedAtDate = new Date(endedAt);
    const durationMs = Math.max(endedAtDate.getTime() - startedAtDate.getTime(), 0);
    const hoursWorked = Math.max(0.1, durationMs / (1000 * 60 * 60));
    const logId = `${Date.now()}_log`;

    let linkedTripId: string | undefined;
    let linkedTripForInsights: Trip | null = null;
    if (miles > 0) {
      const derivedStartOdometer =
        session.startOdometer ??
        (settings.financialYearStartOdometer
          ? settings.financialYearStartOdometer + trips.reduce((sum, trip) => sum + trip.totalMiles, 0)
          : 0);

      linkedTripId = `${Date.now()}_trip`;
      linkedTripForInsights = {
        id: linkedTripId,
        date: session.date,
        startLocation: 'Work Day Start',
        endLocation: 'Work Day End',
        startOdometer: Number(derivedStartOdometer.toFixed(1)),
        endOdometer: Number((derivedStartOdometer + miles).toFixed(1)),
        totalMiles: miles,
        purpose: 'Business',
        notes: 'Auto-created from Work Day',
        updatedAt,
      };
      addTrip(linkedTripForInsights);
    }

    sessionExpenses.forEach((expense) => {
      addExpense({
        id: expense.id,
        date: session.date,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        liters: expense.liters,
        updatedAt,
      });
    });

    const completedLog: DailyWorkLog = {
      id: logId,
      date: session.date,
      provider: session.provider || 'Work Day',
      hoursWorked: Number(hoursWorked.toFixed(2)),
      revenue,
      fuelLiters: fuelLiters > 0 ? Number(fuelLiters.toFixed(2)) : undefined,
      expensesTotal: expensesTotal > 0 ? Number(expensesTotal.toFixed(2)) : 0,
      notes: 'Captured from the Driver Buddy shift flow',
      milesDriven: miles > 0 ? Number(miles.toFixed(1)) : 0,
      linkedTripId,
      startedAt: session.startedAt,
      endedAt,
      providerSplits: session.providerSplits,
      updatedAt,
    };

    addDailyLog(completedLog);

    const allLogs = [...dailyLogs, completedLog];
    const weekStart = ukWeekStart(session.date, settings.workWeekStartDay);
    const weekLogs = allLogs.filter((log) => ukWeekStart(log.date, settings.workWeekStartDay) === weekStart);
    const weekRevenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);
    const weekTaxToSetAside = weekRevenue * (settings.taxSetAsidePercent / 100);
    const weekExpenses = weekLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
    const weekKept = weekRevenue - weekTaxToSetAside - weekExpenses;

    setActiveSession(null);

    return {
      id: `${Date.now()}_summary`,
      date: session.date,
      startedAt: session.startedAt,
      endedAt,
      hoursWorked: Number(hoursWorked.toFixed(2)),
      revenue,
      taxToSetAside,
      mileageClaim,
      expensesTotal,
      realProfit,
      miles,
      fuelLiters,
        insights: generateInsights(
          completedLog,
          allLogs,
          settings,
          linkedTripForInsights ? [...trips, linkedTripForInsights] : trips
        ),
      weekRevenue,
      weekTaxToSetAside,
      weekKept,
      workDayCount: allLogs.length,
    };
  };

  const saveManualShift = (payload: ManualShiftPayload): CompletedShiftSummary => {
    trackEvent('shift_completed', { date: payload.date, mode: 'manual' });
    if (payload.date < getTodayKey()) {
      trackEvent('log_backfilled', { date: payload.date });
    }

    const startedAt = new Date(`${payload.date}T09:00:00`).toISOString();
    const endedAt = new Date(new Date(startedAt).getTime() + payload.hoursWorked * 60 * 60 * 1000).toISOString();
    const updatedAt = nowIso();
    const expensesTotal = payload.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const fuelLiters = payload.expenses
      .filter((expense) => expense.category === ExpenseCategory.FUEL)
      .reduce((sum, expense) => sum + (expense.liters ?? 0), 0);
    const miles =
      payload.startOdometer != null && payload.endOdometer != null
        ? Math.max(0, payload.endOdometer - payload.startOdometer)
        : 0;
    const taxToSetAside = payload.revenue * (settings.taxSetAsidePercent / 100);
    const mileageClaim = calculateMileageClaim(miles);
    const realProfit = payload.revenue - taxToSetAside - expensesTotal;

    let linkedTripId: string | undefined;
    let linkedTripForInsights: Trip | null = null;
    if (miles > 0) {
      linkedTripId = `${Date.now()}_trip`;
      linkedTripForInsights = {
        id: linkedTripId,
        date: payload.date,
        startLocation: 'Manual shift start',
        endLocation: 'Manual shift end',
        startOdometer: payload.startOdometer ?? 0,
        endOdometer: payload.endOdometer ?? (payload.startOdometer ?? 0) + miles,
        totalMiles: miles,
        purpose: 'Business',
        notes: 'Auto-created from quick add shift',
        updatedAt,
      };
      addTrip(linkedTripForInsights);
    }

    payload.expenses.forEach((expense) => {
      addExpense({
        id: expense.id,
        date: payload.date,
        category: expense.category,
        amount: expense.amount,
        description: expense.description,
        liters: expense.liters,
        updatedAt,
      });
    });

    const completedLog: DailyWorkLog = {
      id: `${Date.now()}_manual_log`,
      date: payload.date,
      provider: payload.provider,
      hoursWorked: payload.hoursWorked,
      revenue: payload.revenue,
      fuelLiters: fuelLiters > 0 ? Number(fuelLiters.toFixed(2)) : undefined,
      expensesTotal: expensesTotal > 0 ? Number(expensesTotal.toFixed(2)) : 0,
      notes: payload.notes,
      milesDriven: miles > 0 ? Number(miles.toFixed(1)) : 0,
      linkedTripId,
      startedAt,
      endedAt,
      providerSplits: payload.providerSplits,
      updatedAt,
    };

    addDailyLog(completedLog);

    const allLogs = [...dailyLogs, completedLog];
    const weekStart = ukWeekStart(payload.date, settings.workWeekStartDay);
    const weekLogs = allLogs.filter((log) => ukWeekStart(log.date, settings.workWeekStartDay) === weekStart);
    const weekRevenue = weekLogs.reduce((sum, log) => sum + log.revenue, 0);
    const weekTaxToSetAside = weekRevenue * (settings.taxSetAsidePercent / 100);
    const weekExpenses = weekLogs.reduce((sum, log) => sum + (log.expensesTotal ?? 0), 0);
    const weekKept = weekRevenue - weekTaxToSetAside - weekExpenses;

    return {
      id: `${Date.now()}_manual_summary`,
      date: payload.date,
      startedAt,
      endedAt,
      hoursWorked: Number(payload.hoursWorked.toFixed(2)),
      revenue: payload.revenue,
      taxToSetAside,
      mileageClaim,
      expensesTotal,
      realProfit,
      miles,
      fuelLiters,
        insights: generateInsights(
          completedLog,
          allLogs,
          settings,
          linkedTripForInsights ? [...trips, linkedTripForInsights] : trips
        ),
      weekRevenue,
      weekTaxToSetAside,
      weekKept,
      workDayCount: allLogs.length,
    };
  };

  const handleAddDailyLog = (log: DailyWorkLog) => {
    addDailyLog(log);
    showToast('Saved', 'success', 1500);
  };

  const handleUpdateDailyLog = (log: DailyWorkLog) => {
    updateDailyLog(log);
    showToast('Saved', 'success', 1500);
  };

  const handleFinalizeActiveSession = (session: ActiveWorkSession) => {
    const summary = finalizeActiveSession(session);
    showToast('Saved', 'success', 1500);
    return summary;
  };

  const handleSaveManualShift = (payload: ManualShiftPayload) => {
    const summary = saveManualShift(payload);
    showToast('Saved', 'success', 1500);
    return summary;
  };

  const dismissCompletedShiftSummary = () => setCompletedShiftSummary(null);

  const handleLiveShiftSave = (data: { miles: number; durationHours: number; revenue: number; provider: string; path?: Coordinate[] }) => {
    const today = todayUK();
    const updatedAt = nowIso();
    if (data.miles > 0) {
      const startOdo = settings.financialYearStartOdometer
        ? settings.financialYearStartOdometer + trips.reduce((sum, trip) => sum + trip.totalMiles, 0)
        : 0;

      addTrip({
        id: `${Date.now()}_trip`,
        date: today,
        startLocation: 'Live Shift Start',
        endLocation: 'Live Shift End',
        startOdometer: parseFloat(startOdo.toFixed(1)),
        endOdometer: parseFloat((startOdo + data.miles).toFixed(1)),
        totalMiles: data.miles,
        purpose: 'Business',
        notes: `Live tracked shift (${data.durationHours.toFixed(2)}h)`,
        path: data.path,
        updatedAt,
      });
    }

    addDailyLog({
      id: `${Date.now()}_log`,
      date: today,
      provider: data.provider || 'Live Shift',
      revenue: data.revenue,
      hoursWorked: data.durationHours,
      fuelLiters: 0,
      updatedAt,
    });
    showToast('Saved', 'success', 1500);
  };

  const handleBackfillSettingsUpdate = (nextSettings: Settings) => {
    const addedDayOff = nextSettings.dayOffDates.find((date) => !settings.dayOffDates.includes(date));
    if (addedDayOff) {
      trackEvent('day_off_marked', { date: addedDayOff });
    }

    setSettings(nextSettings);
  };

  const currentMeta = pageMeta[activeTab];
  const totalRevenue = dailyLogs.reduce((sum, log) => sum + log.revenue, 0);
  const totalTaxSetAside = totalRevenue * (settings.taxSetAsidePercent / 100);
  const contentAnimationClass = getAnimationClass('animate-content-in', prefersReducedMotion);
  const openQuickLog = (tab: 'mileage' | 'worklog' | 'expenses') => {
    navigateToTab(tab, { preserveQuickLog: true });
    setQuickLogRequest({ tab, token: Date.now() });
  };
  const openDashboardManualEntry = (date?: string) => {
    navigateToTab('dashboard');
    setManualEntryRequest({ token: Date.now(), date });
  };
  const moreMenuItems = useMemo(
    () => [
      ...(isAdvancedUser
        ? [{ label: 'Debt Manager', description: 'Track balances and repayment priority.', icon: CreditCard, action: () => navigateToTab('debt') }]
        : []),
      { label: 'Settings', description: 'Claim method, allocations, and backups.', icon: SettingsIcon, action: () => navigateToTab('settings') },
      { label: 'Download Tax Summary CSV', description: 'Formatted for HMRC self-assessment.', icon: Download, action: () => setShowExportModal(true) },
      { label: 'Send Feedback', description: 'Report a bug or suggest an improvement.', icon: MessageSquare, action: () => { setShowMoreMenu(false); setShowFeedback(true); } },
    ],
    [isAdvancedUser]
  );

  return (
    <div className="min-h-screen bg-surface-deep text-slate-50 theme-app">
      <header className="app-header fixed inset-x-0 top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-brand/15 p-2 text-brand">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand/80">DriverTax Pro</p>
              <p className="truncate text-sm font-semibold text-white sm:text-base">{currentMeta.title}</p>
              <p className="hidden max-w-xl truncate text-xs text-slate-400 sm:block">{currentMeta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/6 bg-surface-raised px-3 py-2 text-xs text-slate-300 sm:inline-flex">
              {getCurrentTaxYearLabel()}
            </span>
            <SyncIndicator />
            <button
              type="button"
              aria-label="Help & FAQ"
              onClick={() => setShowFaq(true)}
              className={iconButtonClasses}
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Open settings"
              onClick={() => navigateToTab('settings')}
              className={iconButtonClasses}
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {connectivityBanner && (
        <div
          data-testid="offline-banner"
          className="fixed inset-x-0 top-[72px] z-40 border-b border-surface-border bg-surface/95 px-4 py-2 text-center text-sm text-slate-200 backdrop-blur-xl"
        >
          {connectivityBanner === 'offline'
            ? "You're offline - your data is safe and saved locally"
            : 'Back online'}
        </div>
      )}

      <main className={`app-main min-h-screen pb-[11.5rem] ${connectivityBanner ? 'pt-[116px]' : 'pt-[76px]'}`}>
        <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {showTaxReminder && (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-amber-100">
                  Self Assessment deadline: 31 January. Your tax pack is ready to download.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem(`${TAX_REMINDER_KEY_PREFIX}${Number(todayUK().slice(0, 4))}`, 'true');
                      setShowTaxReminder(false);
                      navigateToTab('tax');
                    }}
                    className={primaryButtonClasses}
                  >
                    Download now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem(`${TAX_REMINDER_KEY_PREFIX}${Number(todayUK().slice(0, 4))}`, 'true');
                      setShowTaxReminder(false);
                    }}
                    className={secondaryButtonClasses}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </section>
          )}
          <SetupReminderBanner onOpenSetup={() => setShowOnboarding(true)} />
          {!hasHydrated ? (
            <section className="rounded-[28px] border border-white/6 bg-surface/90 p-6 shadow-xl shadow-black/20 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Spinner />
                <div>
                  <p className="text-sm font-semibold text-white">Loading your driver workspace</p>
                  <p className="text-sm text-slate-400">Restoring trips, expenses, work logs, and tax settings.</p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="rounded-3xl border border-white/6 bg-surface-raised/70 p-4">
                    <Skeleton className="h-4 w-24" variant="text" />
                    <Skeleton className="mt-4 h-10 w-36" variant="text" />
                    <Skeleton className="mt-6 h-24 w-full" />
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
              <div key={activeTab} className={contentAnimationClass}>
                {activeTab === 'dashboard' && (
                  <div className="space-y-4">
                    <WeeklyReviewCard dailyLogs={dailyLogs} trips={trips} settings={settings} />
                    <Dashboard
                      trips={trips}
                      expenses={expenses}
                      dailyLogs={dailyLogs}
                      settings={settings}
                      activeSession={activeSession}
                      completedShiftSummary={completedShiftSummary}
                      startWorkDayRequest={startWorkDayRequest}
                      manualEntryRequest={manualEntryRequest}
                      onStartWorkDayRequestHandled={() => setStartWorkDayRequest(null)}
                      onManualEntryRequestHandled={() => setManualEntryRequest(null)}
                      onStartSession={startActiveSession}
                      onUpdateSession={updateActiveSession}
                      onCompleteSession={handleFinalizeActiveSession}
                      onSaveManualShift={handleSaveManualShift}
                      onShowCompletedSummary={setCompletedShiftSummary}
                      onDismissCompletedSummary={dismissCompletedShiftSummary}
                      onOpenBackfill={() => setIsBackfillOpen(true)}
                      onOpenTaxTab={() => navigateToTab('tax')}
                    />
                  </div>
                )}
                {activeTab === 'mileage' && (
                  <MileageLog
                    trips={trips}
                    onAddTrip={addTrip}
                    onDeleteTrip={deleteTrip}
                    onUpdateTrip={updateTrip}
                    settings={settings}
                    openFormSignal={quickLogRequest?.tab === 'mileage' ? quickLogRequest.token : undefined}
                    onOpenFormHandled={() => setQuickLogRequest(null)}
                  />
                )}
                {activeTab === 'expenses' && (
                  <ExpenseLog
                    expenses={expenses}
                    settings={settings}
                    onAddExpense={addExpense}
                    onUpdateExpense={updateExpense}
                    onDeleteExpense={deleteExpense}
                    openFormSignal={quickLogRequest?.tab === 'expenses' ? quickLogRequest.token : undefined}
                    onOpenFormHandled={() => setQuickLogRequest(null)}
                  />
                )}
                {activeTab === 'worklog' && (
                  <WorkLog
                    logs={dailyLogs}
                    settings={settings}
                    onAddLog={handleAddDailyLog}
                    onUpdateLog={handleUpdateDailyLog}
                    onDeleteLog={deleteDailyLog}
                    onAddTrip={addTrip}
                    onUpdateTrip={updateTrip}
                    onDeleteTrip={deleteTrip}
                    onNavigateToMileage={() => navigateToTab('mileage')}
                    openFormSignal={quickLogRequest?.tab === 'worklog' ? quickLogRequest.token : undefined}
                    onOpenFormHandled={() => setQuickLogRequest(null)}
                  />
                )}
                {activeTab === 'tax' && (
                  <div className="space-y-4">
                    <TaxLogic
                      trips={trips}
                      expenses={expenses}
                      dailyLogs={dailyLogs}
                      settings={settings}
                      onUpdateSettings={setSettings}
                      isAdvancedUser={isAdvancedUser}
                      onDownloadRecords={queueDownload}
                    />
                    {isAdvancedUser && <TaxAssistant />}
                  </div>
                )}
                {activeTab === 'debt' && isAdvancedUser && <DebtManager settings={settings} dailyLogs={dailyLogs} onUpdateSettings={setSettings} />}
                {activeTab === 'settings' && (
                  <SettingsPanel
                    settings={settings}
                    onUpdateSettings={setSettings}
                    onBackup={handleBackup}
                    onExportCSV={() => setShowExportModal(true)}
                    onExportHmrcSummary={handleHmrcSummaryExport}
                    onRestore={handleRestore}
                    backupCode={backupCode}
                    onCopyBackupCode={handleCopyBackupCode}
                    onRestoreFromBackupCode={handleRestoreFromBackupCode}
                    dataCounts={{ logs: dailyLogs.length, expenses: expenses.length, trips: trips.length }}
                    restoreStatusMessage={restoreStatusMessage}
                  />
                )}
              </div>
            </Suspense>
          )}
        </div>
      </main>

      {isBackfillOpen && (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
          <BackfillSheet
            dailyLogs={dailyLogs}
            totalLogs={playerStats.totalLogs}
            settings={settings}
            isOpen={isBackfillOpen}
            onOpenChange={setIsBackfillOpen}
            onUpdateSettings={handleBackfillSettingsUpdate}
            onAddShift={(date) => openDashboardManualEntry(date)}
          />
        </Suspense>
      )}

      {!showMoreMenu && !showFeedback && !showFaq && !showExportModal && !isBackfillOpen && (
      <div className="bottom-dock fixed left-0 right-0 z-50 px-4 pb-1">
        <div className="app-dock mx-auto flex max-w-sm gap-2 rounded-[24px] p-1.5 dock-shadow">
          {isAdvancedUser && (
            <button
              type="button"
              aria-label="Quick add trip"
              onClick={() => openQuickLog('mileage')}
              className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 transition-all duration-150 hover:bg-indigo-500/15 active:scale-95"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15">
                <Car className="h-4 w-4 text-indigo-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">Trip</span>
            </button>
          )}
          <button
            type="button"
            aria-label="Quick add shift"
            onClick={() => openQuickLog('worklog')}
            className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 transition-all duration-150 hover:bg-emerald-500/15 active:scale-95"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
              <Clock3 className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Shift</span>
          </button>
          {isAdvancedUser && (
            <button
              type="button"
              aria-label="Quick add expense"
              onClick={() => openQuickLog('expenses')}
              className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 transition-all duration-150 hover:bg-amber-500/15 active:scale-95"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">
                <Receipt className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Expense</span>
            </button>
          )}
        </div>
      </div>
      )}

      <nav className="app-nav fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-xl pb-safe">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-around px-2 sm:px-4">
          {primaryTabs.map((tab) => (
            <BottomNavButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} onClick={() => navigateToTab(tab.id)} />
          ))}
          <BottomNavButton
            active={activeTab === 'debt' || activeTab === 'settings'}
            icon={MoreHorizontal}
            label="More"
            onClick={() => setShowMoreMenu(true)}
          />
        </div>
      </nav>

      {showMoreMenu && (
        <div className={sheetBackdropClasses} onClick={() => setShowMoreMenu(false)}>
          <div
            ref={moreMenuRef}
            role="dialog"
            aria-modal="true"
            aria-label="More actions"
            className={sheetPanelClasses}
            onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">More</h2>
                <p className="text-sm text-slate-400">Settings, downloads, and the rest of your toolkit.</p>
              </div>
              <button
                type="button"
                aria-label="Close more menu"
                onClick={() => setShowMoreMenu(false)}
                className={iconButtonClasses}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {moreMenuItems.map((item) => (
                <MoreSheetButton
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  onClick={() => {
                    item.action();
                    setShowMoreMenu(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}


      {showExportModal && (
        <div className={dialogBackdropClasses} onClick={() => setShowExportModal(false)}>
          <div
            ref={exportModalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Download tax summary CSV"
            className={`${dialogPanelClasses} max-w-md`}
            onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Download Tax Summary CSV</h2>
                <p className="text-sm text-slate-400">Choose which logs to include in the tax summary CSV.</p>
              </div>
              <button
                type="button"
                aria-label="Close export modal"
                onClick={() => setShowExportModal(false)}
                className={iconButtonClasses}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-5">
              {([
                ['Mileage log', 'includeTrips'],
                ['Expenses', 'includeExpenses'],
                ['Work log', 'includeWorkLogs'],
              ] as const).map(([label, key]) => (
                <label htmlFor={`export-${key}`} key={key} className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-raised px-4 py-3">
                  <span className="text-sm text-slate-200">{label}</span>
                  <input
                    id={`export-${key}`}
                    type="checkbox"
                    checked={exportConfig[key as keyof typeof exportConfig]}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setExportConfig({ ...exportConfig, [key]: event.target.checked })}
                    className="h-4 w-4 rounded border-surface-border bg-surface text-brand focus:ring-brand"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-surface-border px-5 py-4">
              <span className="text-sm text-slate-400">Revenue tracked: <span className="font-mono text-white">{formatCurrency(totalRevenue)}</span></span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowExportModal(false)} className={secondaryButtonClasses}>
                  Cancel
                </button>
                <button
                  type="button"
                  title="Formatted for HMRC self-assessment"
                  onClick={handleExport}
                  className={primaryButtonClasses}
                >
                  <Download className="h-4 w-4" />
                  <span>Download Tax Summary CSV</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {totalTaxSetAside > 0 && activeTab !== 'settings' && activeTab !== 'dashboard' && (
        <div className="pointer-events-none fixed right-4 top-20 z-30 hidden rounded-full border border-brand/20 bg-brand/10 px-3 py-2 text-xs text-brand lg:block">
          Tax pot <span className="ml-1 font-mono text-white">{formatCurrency(totalTaxSetAside)}</span>
        </div>
      )}

      <FeedbackSheet isOpen={showFeedback} onClose={() => setShowFeedback(false)} currentPage={activeTab} />
      {showFaq && (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
          <FaqSheet isOpen={showFaq} onClose={() => setShowFaq(false)} />
        </Suspense>
      )}
      <UpdateBanner />
      {showOnboarding && (
        <OnboardingModal
          settings={settings}
          onSkip={() => setShowOnboarding(false)}
          onComplete={(updates, options) => {
            setSettings((s) => ({ ...s, ...updates }));
            setShowOnboarding(false);
            showToast('Onboarding completed.');
            if (options?.startWorkDay) {
              navigateToTab('dashboard');
              setStartWorkDayRequest(Date.now());
            }
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex justify-center px-4">
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => setToast((current) => (current?.id === toast.id ? null : current))}
          />
        </div>
      )}
    </div>
  );
}
