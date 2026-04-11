import { useState } from 'react';
import type {
  ActiveWorkSession,
  AppTab,
  CompletedShiftSummary,
  DailyWorkLog,
  Expense,
  PlayerStats,
  Settings,
  Trip,
} from '../types';
import { DEFAULT_SETTINGS } from '../types';
import type { DashboardManualEntryRequest } from '../components/Dashboard';

const DEFAULT_STATS: PlayerStats = { xp: 0, level: 1, rankTitle: 'Novice Driver', totalLogs: 0 };

export type ToastState = {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
};

export type QuickLogRequest = {
  tab: 'mileage' | 'worklog' | 'expenses';
  token: number;
};

export function useAppState() {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dailyLogs, setDailyLogs] = useState<DailyWorkLog[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveWorkSession | null>(null);
  const [completedShiftSummary, setCompletedShiftSummary] = useState<CompletedShiftSummary | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [playerStats, setPlayerStats] = useState<PlayerStats>(DEFAULT_STATS);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('drivertax_onboarded'));
  const [quickLogRequest, setQuickLogRequest] = useState<QuickLogRequest | null>(null);
  const [startWorkDayRequest, setStartWorkDayRequest] = useState<number | null>(null);
  const [manualEntryRequest, setManualEntryRequest] = useState<DashboardManualEntryRequest | null>(null);
  const [isBackfillOpen, setIsBackfillOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showTaxReminder, setShowTaxReminder] = useState(false);

  return {
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
  };
}
