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
  DailyWorkLog,
  PlayerStats,
  Settings,
  getCurrentTaxYearLabel,
} from '../types';
import { Dashboard, DashboardManualEntryRequest, ManualShiftPayload } from './Dashboard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { SyncIndicator } from './SyncIndicator';
import { FeedbackSheet } from './FeedbackSheet';
import { OnboardingModal } from './OnboardingModal';
import { RestoreReviewDialog } from './RestoreReviewDialog';
import { SetupReminderBanner } from './SetupReminderBanner';
import { UpdateBanner } from './UpdateBanner';
import { InstallBanner } from './InstallBanner';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { Toast } from './Toast';
import { getAnimationClass, useReducedMotion } from '../utils/animations';
import { escapeCsvCell } from '../utils/csv';
import { todayUK } from '../utils/ukDate';
import { computeReceiptStats } from '../utils/receiptStats';
import { useBackupRestore } from '../hooks/useBackupRestore';
import { useAppState, type ToastState } from '../hooks/useAppState';
import { useDriverLedger } from '../hooks/useDriverLedger';
import { useAutoTripDetection } from '../hooks/useAutoTripDetection';
import { AutoTripIndicator } from './AutoTripIndicator';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { triggerHaptic } from '../utils/haptics';
import { useExport } from '../hooks/useExport';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHydration } from '../hooks/useHydration';
import { usePersistence } from '../hooks/usePersistence';
import { useReceiptMigration } from '../hooks/useReceiptMigration';
import { useSyncOrchestrator } from '../hooks/useSyncOrchestrator';
import { useReceiptUpload } from '../hooks/useReceiptUpload';
import { setAnalyticsConsent, trackEvent } from '../services/analyticsService';
import { cancelDailyReminder, ensureReminderPermission, scheduleDailyReminder } from '../services/reminderService';
import { stampSettings } from '../services/settingsService';
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

const TAX_REMINDER_KEY_PREFIX = 'dbt_tax_reminder_shown_';
const TAX_RULES_LABEL = `${getCurrentTaxYearLabel()} rules`;

const pageMeta: Record<AppTab, { title: string; description: string }> = {
  dashboard: { title: 'Dashboard', description: 'Revenue, mileage, and tax readiness at a glance.' },
  mileage: { title: 'Mileage', description: 'Keep an HMRC-ready log of every trip.' },
  expenses: { title: 'Expenses', description: 'Capture receipts and track business costs.' },
  worklog: { title: 'Work Log', description: 'Review shifts, earnings, and efficiency.' },
  tax: { title: 'Tax', description: `Estimate liability using ${TAX_RULES_LABEL}.` },
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
  const [showDailyReminderPrompt, setShowDailyReminderPrompt] = useState(false);
  const [reminderSettingsFocusRequest, setReminderSettingsFocusRequest] = useState<number | null>(null);
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
  const updateSettings: React.Dispatch<React.SetStateAction<Settings>> = (nextSettings) => {
    setSettings((current) => stampSettings(typeof nextSettings === 'function' ? nextSettings(current) : nextSettings));
  };
  const ledger = useDriverLedger({
    trips,
    setTrips,
    expenses,
    setExpenses,
    dailyLogs,
    setDailyLogs,
    activeSession,
    setActiveSession,
    setCompletedShiftSummary,
    settings,
  });
  const {
    deletedIds,
    clearDeletedIds,
    addTrip,
    deleteTrip,
    updateTrip,
    linkTripToShift,
    addExpense,
    deleteExpense,
    reclassifyExpensesForMethod,
    updateExpense,
    addDailyLog,
    deleteDailyLog,
    updateDailyLog,
    startActiveSession: startLedgerActiveSession,
    updateActiveSession,
    finalizeActiveSession,
    saveManualShift,
  } = ledger;

  // Auto trip detection — privacy-first, local-only
  const { state: autoTripState, startTrip: cancelAutoTrip } = useAutoTripDetection(settings.autoTripDetectionEnabled, addTrip);

  // Pull-to-refresh on mobile
  const { pullState, pullDistance, containerRef: pullRefreshRef } = usePullToRefresh(async () => {
    if (triggerPull) {
      await triggerPull();
    }
  });

  useFocusTrap(moreMenuRef, showMoreMenu, () => setShowMoreMenu(false));
  useFocusTrap(exportModalRef, showExportModal, () => setShowExportModal(false));
  const { isOnline, connectivityBanner, syncStatus, triggerPull } = useSyncOrchestrator({
    trips,
    setTrips,
    expenses,
    setExpenses,
    dailyLogs,
    setDailyLogs,
    settings,
    setSettings,
    deletedIds,
    hasHydrated,
    onPushSuccess: clearDeletedIds,
  });

  const { rows: receiptRows } = useReceiptUpload();
  const receiptStats = useMemo(() => computeReceiptStats(receiptRows), [receiptRows]);

  const showToast = (message: string, type: ToastState['type'] = 'success', duration = 3000) => {
    setToast({ id: Date.now(), message, type, duration });
  };
  const navigateToTab = (tab: AppTab, options?: { preserveQuickLog?: boolean }) => {
    if (!options?.preserveQuickLog) {
      setQuickLogRequest(null);
    }
    setActiveTab(tab);
  };
  useEffect(() => {
    setAnalyticsConsent(Boolean(settings.analyticsConsent));
  }, [settings.analyticsConsent]);
  useEffect(() => {
    if (!settings.analyticsConsent) return;
    trackEvent('app_open');
  }, [settings.analyticsConsent]);
  useEffect(() => {
    try {
      localStorage.removeItem('dbt_advanced');
      localStorage.removeItem('dbt_featuresUnlocked');
    } catch {}
  }, []);
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
    pendingRestoreReview,
    isPreparingRestore,
    isApplyingRestore,
    confirmPendingRestore,
    cancelPendingRestore,
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
    setSettings: updateSettings,
    setPlayerStats,
    triggerTextDownload,
    queueDownload,
    clearDeletedIds,
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

  const startActiveSession = (payload: { provider: string; startOdometer?: number }) => {
    startLedgerActiveSession(payload);
    navigateToTab('dashboard');
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

  const shareCompletedShiftSummary = async (summaryText: string) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Driver Buddy shift summary',
          text: summaryText,
        });
        showToast('Shared', 'success', 1500);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(summaryText);
      showToast('Copied summary', 'success', 1500);
    } catch {
      showToast('Could not share summary', 'error');
    }
  };

  const handleBackfillSettingsUpdate = (nextSettings: Settings) => {
    const addedDayOff = nextSettings.dayOffDates.find((date) => !settings.dayOffDates.includes(date));
    if (addedDayOff) {
      trackEvent('day_off_marked', { date: addedDayOff });
    }

    updateSettings(nextSettings);
  };

  const currentMeta = pageMeta[activeTab];
  const totalRevenue = dailyLogs.reduce((sum, log) => sum + log.revenue, 0);
  const totalTaxSetAside = totalRevenue * (settings.taxSetAsidePercent / 100);
  const contentAnimationClass = getAnimationClass('animate-content-in', prefersReducedMotion);
  const openQuickLog = (
    tab: 'mileage' | 'worklog' | 'expenses',
    options?: { date?: string; linkedShiftId?: string }
  ) => {
    navigateToTab(tab, { preserveQuickLog: true });
    setQuickLogRequest({ tab, token: Date.now(), ...options });
  };
  const openCompletedShiftExpense = (summary: CompletedShiftSummary) => {
    openQuickLog('expenses', {
      date: summary.date,
      linkedShiftId: summary.shiftId ?? summary.id,
    });
  };
  const openCompletedShiftMiles = (summary: CompletedShiftSummary) => {
    openQuickLog('mileage', {
      date: summary.date,
      linkedShiftId: summary.shiftId ?? summary.id,
    });
  };
  const openReminderSettings = () => {
    navigateToTab('settings');
    setReminderSettingsFocusRequest(Date.now());
  };
  const setPredictionReminder = () => {
    const reminderTime = settings.reminderTime || '18:00';

    if (settings.reminderEnabled) {
      showToast(`Reminder already set for ${reminderTime}`, 'info', 2500);
      return;
    }

    updateSettings((current) => ({
      ...current,
      reminderEnabled: true,
      reminderTime: current.reminderTime || '18:00',
    }));
    void ensureReminderPermission();
    openReminderSettings();
    showToast(`Reminder set for ${reminderTime}`, 'success', 2000);
  };
  const openDashboardManualEntry = (date?: string) => {
    navigateToTab('dashboard');
    setManualEntryRequest({ token: Date.now(), date });
  };
  const openDailyReminderShiftFlow = () => {
    setShowDailyReminderPrompt(false);
    openQuickLog('worklog');
  };
  useEffect(() => {
    if (!hasHydrated) return;

    if (!settings.reminderEnabled || !settings.reminderTime) {
      cancelDailyReminder();
      setShowDailyReminderPrompt(false);
      return;
    }

    scheduleDailyReminder(
      {
        reminderEnabled: settings.reminderEnabled,
        reminderTime: settings.reminderTime,
      },
      {
        onInAppReminder: () => setShowDailyReminderPrompt(true),
        onNotificationClick: openDailyReminderShiftFlow,
      }
    );

    return () => cancelDailyReminder();
  }, [hasHydrated, settings.reminderEnabled, settings.reminderTime]);
  useEffect(() => {
    if (!hasHydrated) return;

    const url = new URL(window.location.href);
    const requestedTab = url.searchParams.get('tab') as AppTab | null;
    const requestedAction = url.searchParams.get('action');
    const validTabs = new Set<AppTab>(['dashboard', 'mileage', 'expenses', 'worklog', 'tax', 'debt', 'settings']);
    let handled = false;

    if (requestedTab && validTabs.has(requestedTab)) {
      navigateToTab(requestedTab);
      handled = true;
    }

    switch (requestedAction) {
      case 'add-trip':
        openQuickLog('mileage');
        handled = true;
        break;
      case 'add-expense':
        openQuickLog('expenses');
        handled = true;
        break;
      case 'add-shift':
        openQuickLog('worklog');
        handled = true;
        break;
      case 'start-shift':
        navigateToTab('dashboard');
        setStartWorkDayRequest(Date.now());
        handled = true;
        break;
      case 'tax':
        navigateToTab('tax');
        handled = true;
        break;
    }

    if (handled) {
      url.searchParams.delete('tab');
      url.searchParams.delete('action');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [hasHydrated]);
  const moreMenuItems = useMemo(
    () => [
      { label: 'Debt Manager', description: 'Track balances and repayment priority.', icon: CreditCard, action: () => navigateToTab('debt') },
      { label: 'Settings', description: 'Claim method, allocations, and backups.', icon: SettingsIcon, action: () => navigateToTab('settings') },
      { label: 'Download Tax Summary CSV', description: 'Formatted for HMRC self-assessment.', icon: Download, action: () => setShowExportModal(true) },
      { label: 'Send Feedback', description: 'Report a bug or suggest an improvement.', icon: MessageSquare, action: () => { setShowMoreMenu(false); setShowFeedback(true); } },
    ],
    []
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand/80">Driver Buddy</p>
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

      <PullToRefreshIndicator pullState={pullState} pullDistance={pullDistance} />

      <main ref={pullRefreshRef} className={`app-main min-h-screen pb-[11.5rem] ${connectivityBanner ? 'pt-[116px]' : 'pt-[76px]'}`}>
        <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          {showTaxReminder && (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-amber-100">
                  Self Assessment deadline: 31 January. Your accountant records are ready to download.
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
          {showDailyReminderPrompt && (
            <section className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-cyan-100">Driver Buddy</p>
                  <p className="text-sm text-cyan-50">Still need to log today?</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={openDailyReminderShiftFlow} className={primaryButtonClasses}>
                    Log shift
                  </button>
                  <button type="button" onClick={() => setShowDailyReminderPrompt(false)} className={secondaryButtonClasses}>
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
                      onShareCompletedSummary={shareCompletedShiftSummary}
                      onAddCompletedShiftExpense={openCompletedShiftExpense}
                      onAddCompletedShiftMiles={openCompletedShiftMiles}
                      onOpenReminderSettings={openReminderSettings}
                      onSetPredictionReminder={setPredictionReminder}
                      onNavigateToTax={() => navigateToTab('tax')}
                      onOpenBackfill={() => setIsBackfillOpen(true)}
                      onOpenWorkLog={() => openQuickLog('worklog')}
                      onAddExpense={addExpense}
                      onUpdateSettings={updateSettings}
                    />
                  </div>
                )}
                {activeTab === 'mileage' && (
                  <MileageLog
                    trips={trips}
                    onAddTrip={addTrip}
                    onDeleteTrip={deleteTrip}
                    onUpdateTrip={updateTrip}
                    onLinkTripToShift={linkTripToShift}
                    settings={settings}
                    openFormSignal={quickLogRequest?.tab === 'mileage' ? quickLogRequest.token : undefined}
                    openFormDefaults={quickLogRequest?.tab === 'mileage' ? {
                      date: quickLogRequest.date,
                      linkedShiftId: quickLogRequest.linkedShiftId,
                    } : undefined}
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
                    showToast={showToast}
                    openFormSignal={quickLogRequest?.tab === 'expenses' ? quickLogRequest.token : undefined}
                    openFormDefaults={quickLogRequest?.tab === 'expenses' ? {
                      date: quickLogRequest.date,
                      linkedShiftId: quickLogRequest.linkedShiftId,
                    } : undefined}
                    onOpenFormHandled={() => setQuickLogRequest(null)}
                  />
                )}
                {activeTab === 'worklog' && (
                  <WorkLog
                    logs={dailyLogs}
                    trips={trips}
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
                      onUpdateSettings={updateSettings}
                      onDownloadRecords={queueDownload}
                    />
                    <TaxAssistant />
                  </div>
                )}
                {activeTab === 'debt' && <DebtManager settings={settings} dailyLogs={dailyLogs} onUpdateSettings={updateSettings} />}
                {activeTab === 'settings' && (
                  <SettingsPanel
                    settings={settings}
                    onUpdateSettings={updateSettings}
                    expenses={expenses}
                    reclassifyExpensesForMethod={reclassifyExpensesForMethod}
                    onBackup={handleBackup}
                    onExportCSV={() => setShowExportModal(true)}
                    onExportHmrcSummary={handleHmrcSummaryExport}
                    onRestore={handleRestore}
                    backupCode={backupCode}
                    onCopyBackupCode={handleCopyBackupCode}
                    onRestoreFromBackupCode={handleRestoreFromBackupCode}
                    isPreparingRestore={isPreparingRestore}
                    dataCounts={{ logs: dailyLogs.length, expenses: expenses.length, trips: trips.length }}
                    restoreStatusMessage={restoreStatusMessage}
                    reminderFocusSignal={reminderSettingsFocusRequest ?? undefined}
                    onReminderFocusHandled={() => setReminderSettingsFocusRequest(null)}
                    syncStatus={syncStatus}
                    receiptStats={receiptStats}
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

      <AutoTripIndicator state={autoTripState} onCancel={cancelAutoTrip} />

      {!showMoreMenu && !showFeedback && !showFaq && !showExportModal && !isBackfillOpen && (
      <div className="bottom-dock fixed left-0 right-0 z-50 px-4 pb-1">
        <div className="app-dock mx-auto flex max-w-sm gap-2 rounded-[24px] p-1.5 dock-shadow">
          <button
            type="button"
            aria-label="Quick add trip"
            onClick={() => { triggerHaptic('light'); openQuickLog('mileage'); }}
            className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 transition-all duration-150 hover:bg-indigo-500/15 active:scale-95"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15">
              <Car className="h-4 w-4 text-indigo-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-400">Trip</span>
          </button>
          <button
            type="button"
            aria-label="Quick add shift"
            onClick={() => { triggerHaptic('light'); openQuickLog('worklog'); }}
            className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 transition-all duration-150 hover:bg-emerald-500/15 active:scale-95"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
              <Clock3 className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Shift</span>
          </button>
          <button
            type="button"
            aria-label="Quick add expense"
            onClick={() => { triggerHaptic('light'); openQuickLog('expenses'); }}
            className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 transition-all duration-150 hover:bg-amber-500/15 active:scale-95"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">
              <Receipt className="h-4 w-4 text-amber-400" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Expense</span>
          </button>
        </div>
      </div>
      )}

      <nav className="app-nav fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-xl pb-safe">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-around px-2 sm:px-4">
          {primaryTabs.map((tab) => (
            <BottomNavButton key={tab.id} active={activeTab === tab.id} icon={tab.icon} label={tab.label} onClick={() => { triggerHaptic('light'); navigateToTab(tab.id); }} />
          ))}
          <BottomNavButton
            active={activeTab === 'debt' || activeTab === 'settings'}
            icon={MoreHorizontal}
            label="More"
            onClick={() => { triggerHaptic('light'); setShowMoreMenu(true); }}
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
          Set-aside pot <span className="ml-1 font-mono text-white">{formatCurrency(totalTaxSetAside)}</span>
        </div>
      )}

      <FeedbackSheet isOpen={showFeedback} onClose={() => setShowFeedback(false)} currentPage={activeTab} />
      <RestoreReviewDialog
        review={pendingRestoreReview}
        isApplying={isApplyingRestore}
        onConfirm={confirmPendingRestore}
        onCancel={cancelPendingRestore}
      />
      {showFaq && (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
          <FaqSheet isOpen={showFaq} onClose={() => setShowFaq(false)} />
        </Suspense>
      )}
      <UpdateBanner />
      <InstallBanner />
      {showOnboarding && (
        <OnboardingModal
          settings={settings}
          onAddLog={handleAddDailyLog}
          onSkip={() => setShowOnboarding(false)}
          onComplete={(updates, options) => {
            updateSettings((s) => ({ ...s, ...updates }));
            setShowOnboarding(false);
            showToast('Onboarding completed.');
            navigateToTab('dashboard');
            if (options?.startWorkDay && !options.hasLoggedShift) {
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
