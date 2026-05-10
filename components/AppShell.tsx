import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  HelpCircle,
  Settings as SettingsIcon,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ActiveWorkSession,
  AppTab,
  CompletedShiftSummary,
  DailyWorkLog,
  ExpenseEvidence,
  MileageEvidence,
  PlayerStats,
  ShiftEvidence,
  Settings,
  Trip,
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
import { PageTransition } from './PageTransition';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import { getAnimationClass, useReducedMotion } from '../utils/animations';
import { triggerHaptic } from '../utils/haptics';
import { escapeCsvCell } from '../utils/csv';
import { todayUK } from '../utils/ukDate';
import { computeReceiptStats } from '../utils/receiptStats';
import { useBackupRestore } from '../hooks/useBackupRestore';
import { useAppState } from '../hooks/useAppState';
import { useDriverLedger } from '../hooks/useDriverLedger';
import { useAutoTripDetection } from '../hooks/useAutoTripDetection';
import { AutoTripIndicator } from './AutoTripIndicator';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { useMissedShiftInference } from '../hooks/useMissedShiftInference';
import { MissedShiftPrompt } from './MissedShiftPrompt';
import { useExport } from '../hooks/useExport';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHydration } from '../hooks/useHydration';
import { useStorage } from '../hooks/useStorage';
import { useReceiptMigration } from '../hooks/useReceiptMigration';
import { useReceiptUpload } from '../hooks/useReceiptUpload';
import { setAnalyticsConsent, trackEvent } from '../services/analyticsService';
import { cancelDailyReminder, ensureReminderPermission, scheduleDailyReminder } from '../services/reminderService';
import { stampSettings } from '../services/settingsService';
import { openDriverBuddyDB, getUnresolvedEvidence, putShift, putExpense, putTrip, putEvidence } from '../services/storage';
import {
  reconcileShiftEvidence,
  reconcileExpenseEvidence,
  reconcileMileageEvidence,
} from '../services/reconciliation';
import type { DisputeCandidate, DisputeGroup } from './DisputeSheet';
import {
  dialogBackdropClasses,
  dialogPanelClasses,
  formatCurrency,
  iconButtonClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
} from '../utils/ui';
import { useToastProvider } from './providers/ToastProvider';
import { useSyncProvider } from './providers/SyncProvider';
import { useNavigationProvider } from './providers/NavigationProvider';
import { useShiftFlowProvider } from './providers/ShiftFlowProvider';

const ExpenseLog = lazy(() => import('./ExpenseLog').then((m) => ({ default: m.ExpenseLog })));
const MileageLog = lazy(() => import('./MileageLog').then((m) => ({ default: m.MileageLog })));
const WorkLog = lazy(() => import('./WorkLog').then((m) => ({ default: m.WorkLog })));
const TaxLogic = lazy(() => import('./TaxLogic').then((m) => ({ default: m.TaxLogic })));
const TaxAssistant = lazy(() => import('./TaxAssistant').then((m) => ({ default: m.TaxAssistant })));
const DebtManager = lazy(() => import('./DebtManager').then((m) => ({ default: m.DebtManager })));
const SettingsPanel = lazy(() => import('./Settings').then((m) => ({ default: m.SettingsPanel })));
const BackfillSheet = lazy(() => import('./BackfillSheet').then((m) => ({ default: m.BackfillSheet })));
const FaqSheet = lazy(() => import('./FaqSheet').then((m) => ({ default: m.FaqSheet })));
const DisputeSheet = lazy(() => import('./DisputeSheet').then((m) => ({ default: m.DisputeSheet })));

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

interface TabErrorBoundaryProps { tabName: string; children: React.ReactNode; }
interface TabErrorBoundaryState { hasError: boolean; }

class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(): TabErrorBoundaryState { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-slate-400">Something went wrong loading {this.props.tabName}.</p>
          <button onClick={() => this.setState({ hasError: false })} className="mt-3 text-sm text-brand underline">
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppShell() {
  const prefersReducedMotion = useReducedMotion();
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
    showTaxReminder,
    setShowTaxReminder,
  } = useAppState();
  const [showDisputeSheet, setShowDisputeSheet] = useState(false);
  const [disputes, setDisputes] = useState<DisputeGroup[]>([]);
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
    addDailyLog: ledgerAddDailyLog,
    deleteDailyLog,
    updateDailyLog: ledgerUpdateDailyLog,
    startActiveSession: startLedgerActiveSession,
    updateActiveSession,
    finalizeActiveSession: ledgerFinalizeActiveSession,
    saveManualShift: ledgerSaveManualShift,
  } = ledger;

  // Auto trip detection — privacy-first, local-only
  const [gpsMilesToday, setGpsMilesToday] = useState(0);

  // Accumulate GPS miles from auto-detected trips for missed-shift inference
  const handleTripComplete = (trip: Trip) => {
    addTrip(trip);
    setGpsMilesToday((prev) => prev + trip.totalMiles);
  };

  const { state: autoTripState, cancelTrip } = useAutoTripDetection(settings.autoTripDetectionEnabled, handleTripComplete);

  // ── Providers ──────────────────────────────────────────────────────

  const { showToast, ToastContainer } = useToastProvider();

  const {
    isOnline,
    syncStatus,
    triggerPull,
    ConnectivityBanner,
  } = useSyncProvider({
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

  const shiftFlow = useShiftFlowProvider({
    activeSession,
    setActiveSession,
    completedShiftSummary,
    setCompletedShiftSummary,
    startLedgerActiveSession,
    updateActiveSession,
    finalizeActiveSession: ledgerFinalizeActiveSession,
    saveManualShift: ledgerSaveManualShift,
    addDailyLog: ledgerAddDailyLog,
    updateDailyLog: ledgerUpdateDailyLog,
    showToast,
    navigateToTab: (tab, opts) => {
      if (!opts?.preserveQuickLog) setQuickLogRequest(null);
      setActiveTab(tab);
    },
    openQuickLog: (tab, options) => {
      setActiveTab(tab);
      setQuickLogRequest({ tab, token: Date.now(), ...options });
    },
  });

  // ── Navigation helpers ─────────────────────────────────────────────

  const navigateToTab = (tab: AppTab, options?: { preserveQuickLog?: boolean }) => {
    if (!options?.preserveQuickLog) {
      setQuickLogRequest(null);
    }
    setActiveTab(tab);
  };

  const openQuickLog = (
    tab: 'mileage' | 'worklog' | 'expenses',
    options?: { date?: string; linkedShiftId?: string }
  ) => {
    navigateToTab(tab, { preserveQuickLog: true });
    setQuickLogRequest({ tab, token: Date.now(), ...options });
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

  // ── Navigation provider (renders nav UI elements) ──────────────────

  const totalRevenue = dailyLogs.reduce((sum, log) => sum + log.revenue, 0);
  const totalTaxSetAside = totalRevenue * (settings.taxSetAsidePercent / 100);

  const {
    NavBar,
    MoreSheet,
    QuickDock,
    SetAsidePot,
  } = useNavigationProvider({
    activeTab,
    showMoreMenu,
    setShowMoreMenu,
    navigateToTab,
    openQuickLog,
    setShowExportModal,
    setShowFeedback,
    totalTaxSetAside,
    quickDockVisible: !showMoreMenu && !showFeedback && !showFaq && !showExportModal && !isBackfillOpen,
  });

  // ── Pull-to-refresh / Missed-shift inference ───────────────────────

  const { pullState, pullDistance, containerRef: pullRefreshRef } = usePullToRefresh(async () => {
    if (triggerPull) {
      await triggerPull();
    }
  });

  const { phase: missedShiftPhase, inferredShift, onAccept: acceptMissedShift, onReject, onDismissTimeout } = useMissedShiftInference({
    enabled: settings.detectMissedShiftsEnabled,
    dailyLogs,
    settings,
    gpsMilesToday,
    onAcceptShift: (shift) =>
      ledgerSaveManualShift({
        date: shift.date,
        provider: shift.provider,
        hoursWorked: shift.hours,
        revenue: shift.estimatedRevenueAvg,
        expenses: [],
      }),
  });

  // Reset gpsMilesToday at midnight
  useEffect(() => {
    const today = todayUK();
    const check = setInterval(() => {
      if (todayUK() !== today) {
        setGpsMilesToday(0);
      }
    }, 60_000);
    return () => clearInterval(check);
  }, []);

  useFocusTrap(exportModalRef, showExportModal, () => setShowExportModal(false));

  const { rows: receiptRows } = useReceiptUpload();
  const receiptStats = useMemo(() => computeReceiptStats(receiptRows), [receiptRows]);

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
  useStorage({
    trips,
    expenses,
    dailyLogs,
    settings,
    playerStats,
    activeTab,
  });

  // ── Evidence dispute checking ───────────────────────────────────────

  const checkForDisputes = async () => {
    const db = await openDriverBuddyDB();
    try {
      const [shiftEvidence, expenseEvidence, mileageEvidence] = await Promise.all([
        getUnresolvedEvidence(db, 'shift_evidence'),
        getUnresolvedEvidence(db, 'expense_evidence'),
        getUnresolvedEvidence(db, 'mileage_evidence'),
      ]);

      const found: DisputeGroup[] = [];

      if (shiftEvidence.length >= 2) {
        const result = reconcileShiftEvidence(shiftEvidence);
        if (result.status === 'disputed') {
          found.push({ type: 'shift', candidates: result.disputeCandidates as unknown as DisputeCandidate[] });
        }
      }
      if (expenseEvidence.length >= 2) {
        const result = reconcileExpenseEvidence(expenseEvidence);
        if (result.status === 'disputed') {
          found.push({ type: 'expense', candidates: result.disputeCandidates as unknown as DisputeCandidate[] });
        }
      }
      if (mileageEvidence.length >= 2) {
        const result = reconcileMileageEvidence(mileageEvidence);
        if (result.status === 'disputed') {
          found.push({ type: 'mileage', candidates: result.disputeCandidates as unknown as DisputeCandidate[] });
        }
      }

      if (found.length > 0) {
        setDisputes(found);
        setShowDisputeSheet(true);
      }
    } finally {
      db.close();
    }
  };

  useEffect(() => {
    if (!hasHydrated) return;
    void checkForDisputes();
  }, [hasHydrated]);

  // Re-check after sync pulls complete
  useEffect(() => {
    if (!hasHydrated) return;
    if (syncStatus === 'idle') {
      void checkForDisputes();
    }
  }, [syncStatus]);

  const handleDisputeResolve = async (chosenId: string, disputeIndex: number) => {
    const db = await openDriverBuddyDB();
    try {
      const dispute = disputes[disputeIndex];
      if (!dispute) return;

      const chosen = dispute.candidates.find((c) => c.id === chosenId);
      if (!chosen) return;

      const newLedgerId = crypto.randomUUID();
      const now = new Date().toISOString();

      if (dispute.type === 'shift') {
        const result = reconcileShiftEvidence(
          dispute.candidates as unknown as ShiftEvidence[],
        );
        if (result.status === 'promoted') {
          await putShift(db, {
            ...result.ledgerEntry,
            id: newLedgerId,
            resolved_from_evidence: JSON.stringify(result.resolvedEvidenceIds),
            last_resolved_at: now,
            user_override: 0,
          });
        } else {
          await putShift(db, {
            id: newLedgerId,
            date: chosen.date ?? '',
            status: 'completed',
            primary_platform: chosen.platform ?? 'Unknown',
            hours_worked: chosen.hours_worked ?? 0,
            total_earnings: chosen.earnings ?? 0,
            started_at: chosen.started_at ?? null,
            ended_at: chosen.ended_at ?? null,
            start_odometer: chosen.start_odometer ?? null,
            end_odometer: chosen.end_odometer ?? null,
            business_miles: chosen.business_miles ?? null,
            fuel_liters: chosen.fuel_liters ?? null,
            job_count: chosen.job_count ?? null,
            notes: chosen.notes ?? null,
            provider_splits: chosen.provider_splits ? JSON.stringify(chosen.provider_splits) : null,
            resolved_from_evidence: JSON.stringify([chosenId]),
            last_resolved_at: now,
            user_override: 1,
          });
        }
      } else if (dispute.type === 'expense') {
        const result = reconcileExpenseEvidence(
          dispute.candidates as unknown as ExpenseEvidence[],
        );
        if (result.status === 'promoted') {
          await putExpense(db, {
            ...result.ledgerEntry,
            id: newLedgerId,
            resolved_from_evidence: JSON.stringify(result.resolvedEvidenceIds),
            last_resolved_at: now,
            user_override: 0,
          });
        } else {
          await putExpense(db, {
            id: newLedgerId,
            date: chosen.date ?? '',
            category: chosen.category ?? null,
            amount: chosen.amount ?? 0,
            description: chosen.description ?? '',
            receipt_id: chosen.receipt_id ?? null,
            scope: chosen.scope ?? null,
            business_use_percent: chosen.business_use_percent ?? null,
            vehicle_expense_type: chosen.vehicle_expense_type ?? null,
            tax_treatment: chosen.tax_treatment ?? null,
            linked_shift_id: chosen.linked_shift_id ?? null,
            resolved_from_evidence: JSON.stringify([chosenId]),
            last_resolved_at: now,
            user_override: 1,
          });
        }
      } else if (dispute.type === 'mileage') {
        const result = reconcileMileageEvidence(
          dispute.candidates as unknown as MileageEvidence[],
        );
        if (result.status === 'promoted') {
          await putTrip(db, {
            ...result.ledgerEntry,
            id: newLedgerId,
            resolved_from_evidence: JSON.stringify(result.resolvedEvidenceIds),
            last_resolved_at: now,
            user_override: 0,
          });
        } else {
          await putTrip(db, {
            id: newLedgerId,
            date: chosen.date ?? '',
            start_location: chosen.start_location ?? '',
            end_location: chosen.end_location ?? '',
            start_odometer: chosen.start_odometer ?? 0,
            end_odometer: chosen.end_odometer ?? 0,
            total_miles: chosen.total_miles ?? 0,
            purpose: chosen.purpose ?? 'Business',
            notes: chosen.notes ?? '',
            linked_shift_id: chosen.linked_shift_id ?? null,
            path: chosen.path ? JSON.stringify(chosen.path) : undefined,
            resolved_from_evidence: JSON.stringify([chosenId]),
            last_resolved_at: now,
            user_override: 1,
          });
        }
      }

      // Mark all candidates as resolved to the new ledger entry
      const storeName =
        dispute.type === 'shift'
          ? 'shift_evidence'
          : dispute.type === 'expense'
            ? 'expense_evidence'
            : 'mileage_evidence';
      await Promise.all(
        dispute.candidates.map((candidate) =>
          putEvidence(db, storeName, {
            ...candidate,
            resolved_to_ledger_id: newLedgerId,
            dispute_status: 'resolved',
          } as unknown as ShiftEvidence),
        ),
      );

      // Remove resolved dispute from local state
      setDisputes((prev) => prev.filter((_, i) => i !== disputeIndex));
      if (disputes.length <= 1) {
        setShowDisputeSheet(false);
      }

      showToast(
        dispute.type === 'shift'
          ? 'Shift entry saved from evidence.'
          : dispute.type === 'expense'
            ? 'Expense entry saved from evidence.'
            : 'Mileage entry saved from evidence.',
        'success',
      );
    } finally {
      db.close();
    }
  };

  // Ephemeral session state — survives refresh via localStorage
  useEffect(() => {
    if (activeSession) {
      localStorage.setItem('driver_active_session', JSON.stringify(activeSession));
    } else {
      localStorage.removeItem('driver_active_session');
    }
  }, [activeSession]);
  useEffect(() => {
    if (completedShiftSummary) {
      localStorage.setItem('driver_completed_shift_summary', JSON.stringify(completedShiftSummary));
    } else {
      localStorage.removeItem('driver_completed_shift_summary');
    }
  }, [completedShiftSummary]);
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

  const handleBackfillSettingsUpdate = (nextSettings: Settings) => {
    const addedDayOff = nextSettings.dayOffDates.find((date) => !settings.dayOffDates.includes(date));
    if (addedDayOff) {
      trackEvent('day_off_marked', { date: addedDayOff });
    }

    updateSettings(nextSettings);
  };

  const currentMeta = pageMeta[activeTab];
  const contentAnimationClass = getAnimationClass('animate-content-in', prefersReducedMotion);

  // Destructure shift flow callbacks
  const {
    startActiveSession,
    handleAddDailyLog,
    handleUpdateDailyLog,
    handleFinalizeActiveSession,
    handleSaveManualShift,
    dismissCompletedShiftSummary,
    shareCompletedShiftSummary,
    openCompletedShiftExpense,
    openCompletedShiftMiles,
  } = shiftFlow;

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

  return (
    <div
      className="min-h-screen bg-surface-deep text-slate-50 theme-app"
      onPointerDown={(e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const haptic = target.closest('.data-haptic');
        if (haptic) triggerHaptic('light');
      }}
    >
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

      {ConnectivityBanner}

      <PullToRefreshIndicator pullState={pullState} pullDistance={pullDistance} />

      <main ref={pullRefreshRef} className={`app-main min-h-screen pb-[11.5rem] ${ConnectivityBanner ? 'pt-[116px]' : 'pt-[76px]'}`}>
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
              <PageTransition activeKey={activeTab}>
                <div className={contentAnimationClass}>
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
                      backupCode={backupCode}
                      onRestoreFromBackupCode={handleRestoreFromBackupCode}
                      onAddExpense={addExpense}
                      onUpdateSettings={updateSettings}
                    />
                  </div>
                )}
                {activeTab === 'mileage' && (
                  <TabErrorBoundary tabName="Mileage">
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
                  </TabErrorBoundary>
                )}
                {activeTab === 'expenses' && (
                  <TabErrorBoundary tabName="Expenses">
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
                  </TabErrorBoundary>
                )}
                {activeTab === 'worklog' && (
                  <TabErrorBoundary tabName="Work Log">
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
                  </TabErrorBoundary>
                )}
                {activeTab === 'tax' && (
                  <TabErrorBoundary tabName="Tax">
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
                  </TabErrorBoundary>
                )}
                {activeTab === 'debt' && (
                  <TabErrorBoundary tabName="Debt Manager">
                    <DebtManager settings={settings} dailyLogs={dailyLogs} onUpdateSettings={updateSettings} />
                  </TabErrorBoundary>
                )}
                {activeTab === 'settings' && (
                  <TabErrorBoundary tabName="Settings">
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
                  </TabErrorBoundary>
                )}
              </div>
              </PageTransition>
            </Suspense>
          )}
        </div>
      </main>

      {isBackfillOpen && (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
          <TabErrorBoundary tabName="Backfill">
            <BackfillSheet
              dailyLogs={dailyLogs}
              totalLogs={playerStats.totalLogs}
              settings={settings}
              isOpen={isBackfillOpen}
              onOpenChange={setIsBackfillOpen}
              onUpdateSettings={handleBackfillSettingsUpdate}
              onAddShift={(date) => openDashboardManualEntry(date)}
            />
          </TabErrorBoundary>
        </Suspense>
      )}

      <MissedShiftPrompt
        visible={missedShiftPhase === 'prompting' || missedShiftPhase === 'timeout'}
        phase={missedShiftPhase}
        inferredShift={inferredShift}
        onAccept={acceptMissedShift}
        onReject={onReject}
        onDismissTimeout={onDismissTimeout}
      />

      <AutoTripIndicator state={autoTripState} onCancel={cancelTrip} />

      {QuickDock}

      {NavBar}

      {MoreSheet}

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

      {SetAsidePot}

      <FeedbackSheet isOpen={showFeedback} onClose={() => setShowFeedback(false)} currentPage={activeTab} />
      {showDisputeSheet && disputes.length > 0 && (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
          <DisputeSheet
            isOpen={showDisputeSheet}
            onClose={() => setShowDisputeSheet(false)}
            disputes={disputes}
            onResolve={handleDisputeResolve}
          />
        </Suspense>
      )}
      <RestoreReviewDialog
        review={pendingRestoreReview}
        isApplying={isApplyingRestore}
        onConfirm={confirmPendingRestore}
        onCancel={cancelPendingRestore}
      />
      {showFaq && (
        <Suspense fallback={<div className="flex h-64 items-center justify-center"><Spinner /></div>}>
          <TabErrorBoundary tabName="FAQ">
            <FaqSheet isOpen={showFaq} onClose={() => setShowFaq(false)} />
          </TabErrorBoundary>
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

      {ToastContainer}
    </div>
  );
}
