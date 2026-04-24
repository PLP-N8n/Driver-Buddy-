import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BatteryCharging,
  CalendarDays,
  Car,
  Check,
  Clock3,
  Copy,
  Download,
  HelpCircle,
  KeyRound,
  LucideIcon,
  Moon,
  Package,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sun,
  Truck,
  Upload,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react';
import { DriverRole, Settings, VehicleFuelType } from '../types';
import { LinkedDevicesPanel } from './LinkedDevicesPanel';
import { PlaidSyncToggle } from './PlaidSyncToggle';
import { ReceiptSyncPanel } from './ReceiptSyncPanel';
import { ensureReminderPermission, getReminderPermission, type ReminderPermissionState } from '../services/reminderService';
import {
  fieldLabelClasses,
  getNumericInputProps,
  inputClasses,
  panelClasses,
  secondaryButtonClasses,
  subtlePanelClasses,
} from '../utils/ui';

interface SettingsProps {
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
  onBackup: () => void;
  onExportCSV: () => void;
  onExportHmrcSummary: () => void;
  onRestore: (event: React.ChangeEvent<HTMLInputElement>) => void;
  backupCode: string;
  onCopyBackupCode: () => void | Promise<void>;
  onRestoreFromBackupCode: (code: string) => void | Promise<void>;
  isPreparingRestore?: boolean;
  dataCounts: {
    logs: number;
    expenses: number;
    trips: number;
  };
  restoreStatusMessage: string | null;
  reminderFocusSignal?: number;
  onReminderFocusHandled?: () => void;
}

const roleOptions: Array<{ role: DriverRole; label: string; description: string; icon: LucideIcon }> = [
  { role: 'COURIER', label: 'Courier', description: 'DPD, Evri, Amazon Flex', icon: Package },
  { role: 'FOOD_DELIVERY', label: 'Food Delivery', description: 'Uber Eats, Deliveroo', icon: UtensilsCrossed },
  { role: 'TAXI', label: 'Taxi', description: 'Uber, Bolt, private hire', icon: Car },
  { role: 'LOGISTICS', label: 'Logistics', description: 'Vehicle moves and trade plates', icon: Truck },
  { role: 'OTHER', label: 'Other', description: 'General self-employed driving', icon: HelpCircle },
];

const fuelTypeOptions: Array<{ type: VehicleFuelType; label: string; description: string; icon: LucideIcon }> = [
  { type: 'PETROL', label: 'Petrol', description: 'Fuel receipts and running costs.', icon: Car },
  { type: 'DIESEL', label: 'Diesel', description: 'Fuel receipts and running costs.', icon: Truck },
  { type: 'HYBRID', label: 'Hybrid', description: 'Supports fuel and charging costs.', icon: BatteryCharging },
  { type: 'EV', label: 'Electric', description: 'Track public and home charging.', icon: BatteryCharging },
];

const visibleSettingsSections = {
  debtAllocation: false,
  linkedDevices: false,
  receiptSync: false,
  bankSync: false,
} as const;

export const SettingsPanel: React.FC<SettingsProps> = ({
  settings,
  onUpdateSettings,
  onBackup,
  onExportCSV,
  onExportHmrcSummary,
  onRestore,
  backupCode,
  onCopyBackupCode,
  onRestoreFromBackupCode,
  isPreparingRestore = false,
  dataCounts,
  restoreStatusMessage,
  reminderFocusSignal,
  onReminderFocusHandled,
}) => {
  const update = (patch: Partial<Settings>) => onUpdateSettings({ ...settings, ...patch });
  const reminderSectionRef = useRef<HTMLElement | null>(null);
  const reminderTimeInputRef = useRef<HTMLInputElement | null>(null);
  const [restoreCode, setRestoreCode] = useState('');
  const [vehicleTaxInput, setVehicleTaxInput] = useState(settings.vehicleTax ? settings.vehicleTax.toString() : '');
  const [reminderPermission, setReminderPermission] = useState<ReminderPermissionState>(() => getReminderPermission());

  useEffect(() => {
    localStorage.setItem('dtpro_settings_visited', 'true');
  }, []);

  useEffect(() => {
    if (!reminderFocusSignal) return;

    const frame = window.requestAnimationFrame(() => {
      reminderSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const timeInput = reminderTimeInputRef.current;

      if (timeInput) {
        timeInput.focus({ preventScroll: true });
        try {
          timeInput.showPicker?.();
        } catch {
          // Some browsers require a tighter user-activation window; focus is the fallback.
        }
      } else {
        reminderSectionRef.current?.focus({ preventScroll: true });
      }

      onReminderFocusHandled?.();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [onReminderFocusHandled, reminderFocusSignal]);

  const toggleDriverRole = (role: DriverRole) => {
    const nextRoles = settings.driverRoles.includes(role)
      ? settings.driverRoles.filter((currentRole) => currentRole !== role)
      : [...settings.driverRoles, role];

    if (nextRoles.length > 0) {
      update({ driverRoles: nextRoles });
    }
  };

  const handleReminderToggle = async () => {
    if (settings.reminderEnabled) {
      update({ reminderEnabled: false });
      return;
    }

    const permission = await ensureReminderPermission();
    setReminderPermission(permission);
    update({ reminderEnabled: true, reminderTime: settings.reminderTime || '18:00' });
  };

  const reminderStatusText = (() => {
    if (!settings.reminderEnabled) return 'Off';
    if (reminderPermission === 'granted') return `Scheduled daily at ${settings.reminderTime || '18:00'}.`;
    if (reminderPermission === 'denied') return 'Browser notifications are blocked. Driver Buddy will show an in-app prompt while open.';
    if (reminderPermission === 'unsupported') return 'This browser will show an in-app prompt while Driver Buddy is open.';
    return 'Scheduled. Allow browser notifications when prompted for background-style alerts.';
  })();

  return (
    <div className="space-y-4">
      <section data-testid="settings-your-data-section" className={`${panelClasses} p-5`}>
        <div data-testid="settings-your-data-header" className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-surface-raised p-3 text-slate-200">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Settings</h1>
            <p className="text-sm text-slate-400">Control profile, accounting method, allocations, and backups.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {roleOptions.map((option) => {
            const isSelected = settings.driverRoles.includes(option.role);

            return (
              <button
                key={option.role}
                type="button"
                onClick={() => toggleDriverRole(option.role)}
                className={`rounded-2xl border p-4 text-left transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                  isSelected ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300 hover:border-slate-600'
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className={`rounded-full p-2 ${isSelected ? 'bg-brand text-white' : 'bg-surface text-slate-300'}`}>
                    <option.icon className="h-4 w-4" />
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand" />}
                </div>
                <p className="font-medium">{option.label}</p>
                <p className="mt-1 text-xs text-slate-400">{option.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section data-testid="settings-appearance" className={`${panelClasses} p-5`}>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Appearance</h2>
          <p className="text-sm text-slate-400">Switch between dark and light themes to match your driving conditions.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              id: 'DARK' as const,
              title: 'Dark',
              description: 'Low-glare workspace for long logging sessions.',
              icon: Moon,
            },
            {
              id: 'LIGHT' as const,
              title: 'Light',
              description: 'Higher daylight contrast for quick mobile use.',
              icon: Sun,
            },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => update({ colorTheme: option.id })}
              className={`rounded-2xl border p-4 text-left transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                settings.colorTheme === option.id
                  ? 'border-brand bg-brand/10 text-white'
                  : 'border-surface-border bg-surface-raised text-slate-300 hover:border-slate-600'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className={`rounded-full p-2 ${settings.colorTheme === option.id ? 'bg-brand text-white' : 'bg-surface text-slate-300'}`}>
                  <option.icon className="h-4 w-4" />
                </div>
                {settings.colorTheme === option.id && <Check className="h-4 w-4 text-brand" />}
              </div>
              <p className="font-medium">{option.title}</p>
              <p className="mt-1 text-xs text-slate-400">{option.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className={`${panelClasses} p-5`}>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl bg-surface-raised p-3 text-slate-200">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Work week</h2>
            <p className="text-sm text-slate-400">Choose when your work week starts. Affects weekly summaries and targets.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              id: 'MON' as const,
              title: 'Monday',
              description: 'Default, UK standard.',
            },
            {
              id: 'SUN' as const,
              title: 'Sunday',
              description: 'US and personal preference.',
            },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => update({ workWeekStartDay: option.id })}
              className={`rounded-2xl border p-4 text-left transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                settings.workWeekStartDay === option.id
                  ? 'border-brand bg-brand/10 text-white'
                  : 'border-surface-border bg-surface-raised text-slate-300 hover:border-slate-600'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className={`rounded-full p-2 ${settings.workWeekStartDay === option.id ? 'bg-brand text-white' : 'bg-surface text-slate-300'}`}>
                  <CalendarDays className="h-4 w-4" />
                </div>
                {settings.workWeekStartDay === option.id && <Check className="h-4 w-4 text-brand" />}
              </div>
              <p className="font-medium">{option.title}</p>
              <p className="mt-1 text-xs text-slate-400">{option.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className={`${panelClasses} p-5`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={`${subtlePanelClasses} p-4`}>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-white">Tax profile</h2>
              <p className="text-sm text-slate-400">Choose the claim basis and income tax profile used in estimates.</p>
            </div>
            <div className="mb-4">
              <p className="text-sm font-medium text-slate-200">Accounting method</p>
              <p className="mt-1 text-sm text-slate-400">Use one method consistently through the tax year.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => update({ claimMethod: 'SIMPLIFIED' })}
                className={`rounded-full px-4 py-3 text-sm font-semibold transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                  settings.claimMethod === 'SIMPLIFIED' ? 'bg-brand text-white' : 'bg-surface text-slate-300 hover:bg-surface-border'
                }`}
              >
                Simplified
              </button>
              <button
                type="button"
                onClick={() => update({ claimMethod: 'ACTUAL' })}
                className={`rounded-full px-4 py-3 text-sm font-semibold transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                  settings.claimMethod === 'ACTUAL' ? 'bg-brand text-white' : 'bg-surface text-slate-300 hover:bg-surface-border'
                }`}
              >
                Actual costs
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-surface-border bg-surface p-4 text-sm text-slate-300">
              {settings.claimMethod === 'SIMPLIFIED'
                ? 'Mileage covers fuel, insurance, repairs, and vehicle tax. Do not double-claim those receipts.'
                : 'Actual costs require full business-use apportionment and every related vehicle receipt.'}
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-surface-border bg-surface px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">Scottish taxpayer</p>
                <p className="text-xs text-slate-400">Scottish income tax rates apply to your earnings.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.isScottishTaxpayer)}
                aria-label="Scottish taxpayer"
                onClick={() => update({ isScottishTaxpayer: !settings.isScottishTaxpayer })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                  settings.isScottishTaxpayer ? 'bg-brand' : 'bg-surface-raised'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    settings.isScottishTaxpayer ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className={`${subtlePanelClasses} p-4`}>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-white">Vehicle details</h2>
              <p className="text-sm text-slate-400">Keep audit-critical details current.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="block sm:col-span-2">
                <label htmlFor="vehicle-registration" className={fieldLabelClasses}>
                  Vehicle registration
                </label>
                <input
                  id="vehicle-registration"
                  type="text"
                  value={settings.vehicleReg}
                  onChange={(event) => update({ vehicleReg: event.target.value.toUpperCase() })}
                  className={`${inputClasses} uppercase tracking-[0.2em]`}
                  placeholder="AB12 CDE"
                />
              </div>
              <div className="block sm:col-span-2">
                <p className={fieldLabelClasses}>Fuel type</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {fuelTypeOptions.map((option) => {
                    const isSelected = settings.vehicleFuelType === option.type;

                    return (
                      <button
                        key={option.type}
                        type="button"
                        onClick={() => update({ vehicleFuelType: option.type })}
                        className={`rounded-2xl border p-3 text-left transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                          isSelected
                            ? 'border-brand bg-brand/10 text-white'
                            : 'border-surface-border bg-surface text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <option.icon className="h-4 w-4" />
                          {isSelected && <Check className="h-4 w-4 text-brand" />}
                        </div>
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="block">
                <label htmlFor="financial-year-start" className={fieldLabelClasses}>
                  Financial year start
                </label>
                <input
                  id="financial-year-start"
                  type="date"
                  value={settings.financialYearStartDate}
                  onChange={(event) => update({ financialYearStartDate: event.target.value })}
                  className={inputClasses}
                />
              </div>
              <div className="block">
                <label htmlFor="opening-odometer" className={fieldLabelClasses}>
                  Opening odometer
                </label>
                <input
                  id="opening-odometer"
                  {...getNumericInputProps('decimal')}
                  value={settings.financialYearStartOdometer}
                  onChange={(event) => update({ financialYearStartOdometer: event.target.value ? parseInt(event.target.value, 10) : 0 })}
                  className={`${inputClasses} font-mono`}
                  placeholder="45000"
                />
              </div>
              <div className="block sm:col-span-2">
                <label htmlFor="weekly-target" className={fieldLabelClasses}>
                  Weekly earnings target (&pound;)
                </label>
                <input
                  id="weekly-target"
                  {...getNumericInputProps('decimal')}
                  value={settings.weeklyRevenueTarget}
                  onChange={(event) => update({ weeklyRevenueTarget: event.target.value ? parseFloat(event.target.value) : 0 })}
                  className={`${inputClasses} font-mono`}
                  placeholder="600"
                />
              </div>
              <div className="block sm:col-span-2">
                <label htmlFor="vehicle-tax" className={fieldLabelClasses}>
                  Vehicle tax (&pound;/year)
                </label>
                <input
                  id="vehicle-tax"
                  {...getNumericInputProps('decimal')}
                  value={vehicleTaxInput}
                  onChange={(event) => {
                    setVehicleTaxInput(event.target.value);
                    const parsed = parseFloat(event.target.value);
                    if (!event.target.value.endsWith('.') && !isNaN(parsed)) update({ vehicleTax: parsed });
                    else if (!event.target.value) update({ vehicleTax: 0 });
                  }}
                  className={`${inputClasses} font-mono`}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={`${panelClasses} p-5`}>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Mileage rates</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rate-first-10k" className={fieldLabelClasses}>
              First 10,000 miles (p/mile)
            </label>
            <input
              id="rate-first-10k"
              {...getNumericInputProps('decimal')}
              value={Math.round(settings.businessRateFirst10k * 100)}
              onChange={(event) => update({ businessRateFirst10k: event.target.value ? parseFloat(event.target.value) / 100 : 0 })}
              className={`${inputClasses} font-mono`}
              placeholder="45"
            />
          </div>
          <div>
            <label htmlFor="rate-after-10k" className={fieldLabelClasses}>
              After 10,000 miles (p/mile)
            </label>
            <input
              id="rate-after-10k"
              {...getNumericInputProps('decimal')}
              value={Math.round(settings.businessRateAfter10k * 100)}
              onChange={(event) => update({ businessRateAfter10k: event.target.value ? parseFloat(event.target.value) / 100 : 0 })}
              className={`${inputClasses} font-mono`}
              placeholder="25"
            />
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-400">HMRC standard rates - only change if HMRC updates them.</p>
      </section>

      <section className={`${panelClasses} p-5`}>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Set-aside rules</h2>
          <p className="text-sm text-slate-400">Protect part of each shift for tax and maintenance.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label htmlFor="settings-tax-set-aside" className={`${subtlePanelClasses} p-4`}>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-slate-200">Tax pot</span>
              <span className="font-mono text-white">{settings.taxSetAsidePercent}%</span>
            </div>
            <input
              id="settings-tax-set-aside"
              type="range"
              min="0"
              max="40"
              step="1"
              value={settings.taxSetAsidePercent}
              onChange={(event) => update({ taxSetAsidePercent: parseInt(event.target.value, 10) })}
              className="h-2 w-full accent-brand"
            />
          </label>
          <label htmlFor="settings-maintenance-set-aside" className={`${subtlePanelClasses} p-4`}>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-slate-200">Maintenance fund</span>
              <span className="font-mono text-white">{settings.maintenanceSetAsidePercent}%</span>
            </div>
            <input
              id="settings-maintenance-set-aside"
              type="range"
              min="0"
              max="25"
              step="1"
              value={settings.maintenanceSetAsidePercent}
              onChange={(event) => update({ maintenanceSetAsidePercent: parseInt(event.target.value, 10) })}
              className="h-2 w-full accent-amber-500"
            />
          </label>
          {visibleSettingsSections.debtAllocation && (
            <label htmlFor="settings-debt-set-aside" className={`${subtlePanelClasses} p-4`}>
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-slate-200">Debt allocation</span>
                <span className="font-mono text-white">{settings.debtSetAsidePercent}%</span>
              </div>
              <input
                id="settings-debt-set-aside"
                type="range"
                min="0"
                max="50"
                step="1"
                value={settings.debtSetAsidePercent}
                onChange={(event) => update({ debtSetAsidePercent: parseInt(event.target.value, 10) })}
                className="h-2 w-full accent-violet-500"
              />
            </label>
          )}
        </div>
      </section>

      <section ref={reminderSectionRef} tabIndex={-1} className={`${panelClasses} p-5 outline-none`}>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-surface-raised p-3 text-slate-200">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Daily reminder</h2>
            <p className="text-sm text-slate-400">Get a daily nudge to log your shift before the day gets away.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
          <div className={`${subtlePanelClasses} flex items-center justify-between gap-4 px-4 py-3`}>
            <div>
              <p className="text-sm font-medium text-white">Remind me to log today</p>
              <p className="text-xs text-slate-400">{reminderStatusText}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.reminderEnabled}
              aria-label="Daily reminder"
              onClick={() => void handleReminderToggle()}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                settings.reminderEnabled ? 'bg-brand' : 'bg-surface-raised'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  settings.reminderEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <div>
            <label htmlFor="daily-reminder-time" className={fieldLabelClasses}>
              Reminder time
            </label>
            <div className="relative">
              <Clock3 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                ref={reminderTimeInputRef}
                id="daily-reminder-time"
                type="time"
                value={settings.reminderTime || '18:00'}
                onChange={(event) => update({ reminderTime: event.target.value || '18:00' })}
                className={`${inputClasses} pl-11 font-mono`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={`${panelClasses} p-5`}>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Your Data</h2>
          <p className="text-sm text-slate-400">Local-first storage with optional cloud sync and privacy controls.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`${subtlePanelClasses} flex items-center justify-between px-4 py-3`}>
            <span className="text-sm text-slate-300">Work logs</span>
            <span className="font-mono text-white">{dataCounts.logs} entries</span>
          </div>
          <div className={`${subtlePanelClasses} flex items-center justify-between px-4 py-3`}>
            <span className="text-sm text-slate-300">Expenses</span>
            <span className="font-mono text-white">{dataCounts.expenses} entries</span>
          </div>
          <div className={`${subtlePanelClasses} flex items-center justify-between px-4 py-3`}>
            <span className="text-sm text-slate-300">Mileage trips</span>
            <span className="font-mono text-white">{dataCounts.trips} entries</span>
          </div>
          <div className={`${subtlePanelClasses} flex items-center justify-between px-4 py-3`}>
            <span className="text-sm text-slate-300">Data stored</span>
            <span className="font-medium text-white">On this device</span>
          </div>
        </div>
      </section>

      <section className={`${panelClasses} p-5`}>
        <div className="mb-4 flex items-center gap-3">
          <KeyRound className="h-4 w-4 text-slate-400" />
          <div>
            <h2 className="text-base font-semibold text-white">Backup code</h2>
            <p className="text-sm text-slate-400">Use this code on a new device to pull your synced records back in.</p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Backup code</p>
            <code className="block overflow-x-auto rounded-xl border border-surface-border bg-surface px-4 py-3 font-mono text-sm text-slate-100">
              {backupCode}
            </code>
          </div>
          <button type="button" onClick={onCopyBackupCode} className={secondaryButtonClasses}>
            <Copy className="h-4 w-4" />
            <span>Copy backup code</span>
          </button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <input
            type="text"
            value={restoreCode}
            onChange={(event) => setRestoreCode(event.target.value)}
            className={`${inputClasses} font-mono`}
            placeholder="Enter backup code"
          />
          <button
            type="button"
            onClick={() => void onRestoreFromBackupCode(restoreCode)}
            disabled={isPreparingRestore}
            className={secondaryButtonClasses}
          >
            <RotateCcw className="h-4 w-4" />
            <span>{isPreparingRestore ? 'Preparing...' : 'Restore data'}</span>
          </button>
        </div>
        {restoreStatusMessage && <p className="mt-3 text-sm text-emerald-300">{restoreStatusMessage}</p>}
      </section>

      {visibleSettingsSections.linkedDevices && <LinkedDevicesPanel />}

      {visibleSettingsSections.receiptSync && <ReceiptSyncPanel />}

      <section className={`${panelClasses} p-5`}>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-white">Downloads and restore</h2>
          <p className="text-sm text-slate-400">Keep a local copy before clearing browser data or switching devices.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <button type="button" onClick={onBackup} className={secondaryButtonClasses}>
            <Download className="h-4 w-4" />
            <span>Backup JSON</span>
          </button>
          <div>
            <div className="mb-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3">
              <p className="text-xs font-semibold text-indigo-300">Accountant-ready download</p>
              <p className="mt-1 text-xs text-slate-400">
                Download a CSV of your income, expenses, and mileage for your accountant or Self Assessment.
              </p>
            </div>
            <button
              type="button"
              title="Formatted for HMRC self-assessment"
              onClick={onExportCSV}
              className={secondaryButtonClasses}
            >
              <Receipt className="h-4 w-4" />
              <span>Download Accountant CSV</span>
            </button>
          </div>
          <div>
            <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="text-xs font-semibold text-emerald-300">Year-end estimate</p>
              <p className="mt-1 text-xs text-slate-400">
                Download a print-ready HMRC summary with earnings, mileage, expenses, tax estimate, and allowance usage.
              </p>
            </div>
            <button type="button" onClick={onExportHmrcSummary} className={secondaryButtonClasses}>
              <ShieldCheck className="h-4 w-4" />
              <span>HMRC Summary</span>
            </button>
          </div>
          <label htmlFor="restore-backup" className={`${secondaryButtonClasses} relative`}>
            <Upload className="h-4 w-4" />
            <span>Restore data</span>
            <input id="restore-backup" type="file" accept=".json" onChange={onRestore} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <div className="glass-card mt-4 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-400" />
            <p className="text-sm font-semibold text-white">Data and privacy</p>
          </div>
          <p className="text-xs text-slate-400">Your data is stored on this device using your browser&apos;s local storage.</p>
          <p className="text-xs text-slate-400">Optional cloud sync sends your data to our servers so you can restore it on another device.</p>
          <p className="text-xs text-slate-400">Analytics are anonymous and disabled by default.</p>
          <div className={`${subtlePanelClasses} flex items-center justify-between gap-4 px-4 py-3`}>
            <div>
              <p className="text-sm font-medium text-white">Share anonymous usage data</p>
              <p className="text-xs text-slate-400">Helps us improve the app. No personal data is collected.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings.analyticsConsent)}
              aria-label="Share anonymous usage data"
              onClick={() => update({ analyticsConsent: !settings.analyticsConsent })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                settings.analyticsConsent ? 'bg-brand' : 'bg-surface-raised'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  settings.analyticsConsent ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-slate-400">To move your data to a new device, use the backup code above or download a CSV.</p>
        </div>
      </section>

      {visibleSettingsSections.bankSync && (
        <section className={`${panelClasses} p-5`}>
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Bank account sync</h2>
              <span className="rounded-full bg-slate-700/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                New connections coming soon
              </span>
            </div>
            <p className="text-sm text-slate-400">Plaid-powered bank sync is still in development. Existing connections can still be reviewed or disconnected here.</p>
          </div>
          <PlaidSyncToggle />
        </section>
      )}
    </div>
  );
};
