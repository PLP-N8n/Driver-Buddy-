import type { ActiveWorkSession, AppTab, CompletedShiftSummary, DailyWorkLog } from '../../types';
import type { ManualShiftPayload } from '../Dashboard';
import type { ToastState } from '../../hooks/useAppState';

export interface ShiftFlowProviderParams {
  activeSession: ActiveWorkSession | null;
  setActiveSession: (session: ActiveWorkSession | null) => void;
  completedShiftSummary: CompletedShiftSummary | null;
  setCompletedShiftSummary: (summary: CompletedShiftSummary | null) => void;
  startLedgerActiveSession: (payload: { provider: string; startOdometer?: number }) => void;
  updateActiveSession: (session: ActiveWorkSession) => void;
  finalizeActiveSession: (session: ActiveWorkSession) => CompletedShiftSummary;
  saveManualShift: (payload: ManualShiftPayload) => CompletedShiftSummary;
  addDailyLog: (log: DailyWorkLog) => void;
  updateDailyLog: (log: DailyWorkLog) => void;
  showToast: (message: string, type?: ToastState['type'], duration?: number) => void;
  navigateToTab: (tab: AppTab, options?: { preserveQuickLog?: boolean }) => void;
  openQuickLog: (tab: 'mileage' | 'worklog' | 'expenses', options?: { date?: string; linkedShiftId?: string }) => void;
}

export interface ShiftFlowProviderResult {
  startActiveSession: (payload: { provider: string; startOdometer?: number }) => void;
  handleAddDailyLog: (log: DailyWorkLog) => void;
  handleUpdateDailyLog: (log: DailyWorkLog) => void;
  handleFinalizeActiveSession: (session: ActiveWorkSession) => CompletedShiftSummary;
  handleSaveManualShift: (payload: ManualShiftPayload) => CompletedShiftSummary;
  dismissCompletedShiftSummary: () => void;
  shareCompletedShiftSummary: (summaryText: string) => Promise<void>;
  openCompletedShiftExpense: (summary: CompletedShiftSummary) => void;
  openCompletedShiftMiles: (summary: CompletedShiftSummary) => void;
}

export function useShiftFlowProvider({
  activeSession,
  setActiveSession,
  completedShiftSummary,
  setCompletedShiftSummary,
  startLedgerActiveSession,
  updateActiveSession,
  finalizeActiveSession,
  saveManualShift,
  addDailyLog,
  updateDailyLog,
  showToast,
  navigateToTab,
  openQuickLog,
}: ShiftFlowProviderParams): ShiftFlowProviderResult {
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

  return {
    startActiveSession,
    handleAddDailyLog,
    handleUpdateDailyLog,
    handleFinalizeActiveSession,
    handleSaveManualShift,
    dismissCompletedShiftSummary,
    shareCompletedShiftSummary,
    openCompletedShiftExpense,
    openCompletedShiftMiles,
  };
}
