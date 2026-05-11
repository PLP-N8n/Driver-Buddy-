import React, { useMemo, useRef } from 'react';
const { memo } = React;
import {
  Calculator,
  Car,
  Clock3,
  CreditCard,
  Download,
  Home,
  LucideIcon,
  MessageSquare,
  MoreHorizontal,
  Receipt,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { AppTab } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { triggerHaptic } from '../../utils/haptics';
import { formatCurrency, iconButtonClasses, sheetBackdropClasses, sheetPanelClasses } from '../../utils/ui';

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
}> = memo(({ active, icon: Icon, label, onClick }) => (
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
));

const MoreSheetButton: React.FC<{
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
}> = memo(({ icon: Icon, label, description, onClick }) => (
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
));

export interface NavigationProviderParams {
  activeTab: AppTab;
  showMoreMenu: boolean;
  setShowMoreMenu: (show: boolean) => void;
  navigateToTab: (tab: AppTab, options?: { preserveQuickLog?: boolean }) => void;
  openQuickLog: (tab: 'mileage' | 'worklog' | 'expenses', options?: { date?: string; linkedShiftId?: string }) => void;
  setShowExportModal: (show: boolean) => void;
  setShowFeedback: (show: boolean) => void;
  totalTaxSetAside: number;
  quickDockVisible: boolean;
}

export interface NavigationProviderResult {
  NavBar: React.ReactNode;
  MoreSheet: React.ReactNode;
  QuickDock: React.ReactNode;
  SetAsidePot: React.ReactNode;
}

export function useNavigationProvider({
  activeTab,
  showMoreMenu,
  setShowMoreMenu,
  navigateToTab,
  openQuickLog,
  setShowExportModal,
  setShowFeedback,
  totalTaxSetAside,
  quickDockVisible,
}: NavigationProviderParams): NavigationProviderResult {
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(moreMenuRef, showMoreMenu, () => setShowMoreMenu(false));

  const moreMenuItems = useMemo(
    () => [
      { label: 'Debt Manager', description: 'Track balances and repayment priority.', icon: CreditCard, action: () => navigateToTab('debt') },
      { label: 'Settings', description: 'Claim method, allocations, and backups.', icon: SettingsIcon, action: () => navigateToTab('settings') },
      { label: 'Download Tax Summary CSV', description: 'Formatted for HMRC self-assessment.', icon: Download, action: () => setShowExportModal(true) },
      { label: 'Send Feedback', description: 'Report a bug or suggest an improvement.', icon: MessageSquare, action: () => { setShowMoreMenu(false); setShowFeedback(true); } },
    ],
    [navigateToTab, setShowExportModal, setShowMoreMenu, setShowFeedback],
  );

  const NavBar = (
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
  );

  const MoreSheet = showMoreMenu ? (
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
  ) : null;

  const QuickDock = quickDockVisible ? (
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
  ) : null;

  const SetAsidePot = totalTaxSetAside > 0 && activeTab !== 'settings' && activeTab !== 'dashboard' ? (
    <div className="pointer-events-none fixed right-4 top-20 z-30 hidden rounded-full border border-brand/20 bg-brand/10 px-3 py-2 text-xs text-brand lg:block">
      Set-aside pot <span className="ml-1 font-mono text-white">{formatCurrency(totalTaxSetAside)}</span>
    </div>
  ) : null;

  return { NavBar, MoreSheet, QuickDock, SetAsidePot };
}
