import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Car, ChevronLeft, ChevronRight, HelpCircle, Package, Truck, UtensilsCrossed } from 'lucide-react';
import { DailyWorkLog, DriverRole, Settings } from '../types';
import { DatePicker } from './DatePicker';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getProvidersByRole } from '../utils/providers';
import { calcMileageAllowanceForMiles } from '../shared/calculations/mileage';
import { todayUK, toUKDateString } from '../utils/ukDate';
import {
  fieldLabelClasses,
  formatCurrency,
  formatNumber,
  getNumericInputProps,
  inputClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  selectClasses,
} from '../utils/ui';

interface OnboardingModalProps {
  settings: Settings;
  onSkip?: () => void;
  onAddLog: (log: DailyWorkLog) => void;
  onComplete: (updates: Partial<Settings>, options?: { startWorkDay?: boolean; hasLoggedShift?: boolean }) => void;
}

const roleOptions: Array<{ role: DriverRole; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { role: 'COURIER', label: 'Courier', icon: Package },
  { role: 'FOOD_DELIVERY', label: 'Food Delivery', icon: UtensilsCrossed },
  { role: 'TAXI', label: 'Taxi', icon: Car },
  { role: 'LOGISTICS', label: 'Logistics', icon: Truck },
  { role: 'OTHER', label: 'Other', icon: HelpCircle },
];

const getYesterdayUK = () => {
  const date = new Date(`${todayUK()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return toUKDateString(date);
};

const getDefaultProviderForRole = (role: DriverRole) => getProvidersByRole(role)[0] ?? 'Other';

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ settings, onSkip, onAddLog, onComplete }) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRole, setSelectedRole] = useState<DriverRole>(settings.driverRoles[0] ?? 'COURIER');
  const [claimMethod, setClaimMethod] = useState<Settings['claimMethod']>(settings.claimMethod);
  const [quickWinDate, setQuickWinDate] = useState(getYesterdayUK);
  const [quickWinProvider, setQuickWinProvider] = useState(() => getDefaultProviderForRole(settings.driverRoles[0] ?? 'COURIER'));
  const [quickWinEarnings, setQuickWinEarnings] = useState('');
  const [quickWinHours, setQuickWinHours] = useState('');
  const [quickWinMiles, setQuickWinMiles] = useState('');
  const [quickWinResult, setQuickWinResult] = useState<{
    gross: number;
    kept: number;
    setAsidePercent: number;
    miles: number;
    mileageClaim: number;
  } | null>(null);

  useFocusTrap(modalRef, true);

  const quickWinProviderOptions = useMemo(() => getProvidersByRole(selectedRole), [selectedRole]);

  useEffect(() => {
    setQuickWinProvider((current) =>
      quickWinProviderOptions.includes(current) ? current : quickWinProviderOptions[0] ?? 'Other'
    );
  }, [quickWinProviderOptions]);

  const updates = useMemo<Partial<Settings>>(
    () => ({
      driverRoles: [selectedRole],
      claimMethod,
    }),
    [claimMethod, selectedRole]
  );

  const quickWinGross = Number.parseFloat(quickWinEarnings);
  const quickWinHoursValue = Number.parseFloat(quickWinHours);
  const canShowQuickWin =
    Boolean(quickWinDate) &&
    Number.isFinite(quickWinGross) &&
    quickWinGross > 0 &&
    Number.isFinite(quickWinHoursValue) &&
    quickWinHoursValue > 0;

  const completeOnboarding = (options?: { startWorkDay?: boolean; hasLoggedShift?: boolean }) => {
    localStorage.setItem('drivertax_onboarded', '1');
    onComplete(updates, options);
  };

  const handleShowQuickWin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canShowQuickWin) return;

    const gross = Number(quickWinGross.toFixed(2));
    const hoursWorked = Number(quickWinHoursValue.toFixed(2));
    const parsedMiles = Number.parseFloat(quickWinMiles);
    const miles = Number.isFinite(parsedMiles) && parsedMiles > 0 ? Number(parsedMiles.toFixed(1)) : 0;
    const setAside = gross * (settings.taxSetAsidePercent / 100);

    onAddLog({
      id: `log_onboarding_${Date.now()}`,
      date: quickWinDate,
      provider: quickWinProvider,
      hoursWorked,
      revenue: gross,
      expensesTotal: 0,
      milesDriven: miles > 0 ? miles : undefined,
      notes: 'Logged during onboarding',
    });

    setQuickWinResult({
      gross,
      kept: gross - setAside,
      setAsidePercent: settings.taxSetAsidePercent,
      miles,
      mileageClaim: calcMileageAllowanceForMiles(miles, 0),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Onboarding"
        className="w-full max-w-md rounded-[28px] border border-surface-border bg-surface/95 p-6 shadow-2xl shadow-black/40"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Getting Started</p>
            <p className="mt-1 text-sm text-slate-300">{quickWinResult ? 'Your result' : `Step ${step} of 3`}</p>
          </div>
          {step > 1 && !quickWinResult ? (
            <button type="button" onClick={() => setStep((current) => (current > 1 ? ((current - 1) as 1 | 2 | 3) : current))} className={secondaryButtonClasses}>
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}
        </div>

        {step === 1 && (
          <>
            <h2 className="text-2xl font-semibold text-white">What kind of driver are you?</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {roleOptions.map(({ role, label, icon: Icon }) => {
                const active = selectedRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setSelectedRole(role)}
                    className={`flex min-h-[76px] flex-col items-start justify-between rounded-3xl border p-4 text-left transition-colors ${
                      active ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? 'text-brand' : 'text-slate-400'}`} />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => setStep(2)} className={`${primaryButtonClasses} mt-6 w-full justify-center`}>
              Continue <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('drivertax_onboarded', '1');
                onSkip?.();
              }}
              className="mt-3 w-full text-center text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              Skip for now
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-2xl font-semibold text-white">How do you want to claim expenses?</h2>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setClaimMethod('SIMPLIFIED')}
                className={`w-full rounded-3xl border p-4 text-left transition-colors ${
                  claimMethod === 'SIMPLIFIED' ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300'
                }`}
              >
                <p className="text-sm font-semibold">Simplified</p>
                <p className="mt-1 text-sm text-slate-400">45p/mile - most drivers choose this</p>
              </button>
              <button
                type="button"
                onClick={() => setClaimMethod('ACTUAL')}
                className={`w-full rounded-3xl border p-4 text-left transition-colors ${
                  claimMethod === 'ACTUAL' ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300'
                }`}
              >
                <p className="text-sm font-semibold">Actual expenses</p>
              </button>
            </div>
            <button type="button" onClick={() => setStep(3)} className={`${primaryButtonClasses} mt-6 w-full justify-center`}>
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {step === 3 && (
          <>
            {quickWinResult ? (
              <div aria-live="polite">
                <h2 className="text-2xl font-semibold text-white">You earned {formatCurrency(quickWinResult.gross)}</h2>
                <div className="mt-5 space-y-3 rounded-2xl border border-surface-border bg-surface-raised p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-base text-slate-300">You&apos;d keep:</span>
                    <span className="font-mono text-xl font-semibold text-white">{formatCurrency(quickWinResult.kept)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-base text-slate-300">Set-aside rule:</span>
                    <span className="font-mono text-base font-semibold text-white">{formatNumber(quickWinResult.setAsidePercent, 1)}%</span>
                  </div>
                  {quickWinResult.miles > 0 && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-base text-slate-300">Mileage claim:</span>
                      <span className="font-mono text-base font-semibold text-white">{formatCurrency(quickWinResult.mileageClaim)}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => completeOnboarding({ startWorkDay: true, hasLoggedShift: true })}
                  className={`${primaryButtonClasses} mt-6 w-full justify-center`}
                >
                  Let&apos;s go <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-semibold text-white">See what you keep</h2>
                <p className="mt-3 text-sm text-slate-300">Log one past shift and see your take-home after your set-aside.</p>
                <form onSubmit={handleShowQuickWin} className="mt-5 space-y-4">
                  <DatePicker
                    id="quick-win-date"
                    label="Date"
                    value={quickWinDate}
                    onChange={setQuickWinDate}
                  />

                  <div>
                    <label htmlFor="quick-win-provider" className={fieldLabelClasses}>
                      Platform
                    </label>
                    <select
                      id="quick-win-provider"
                      value={quickWinProvider}
                      onChange={(event) => setQuickWinProvider(event.target.value)}
                      className={selectClasses}
                      required
                    >
                      {quickWinProviderOptions.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="quick-win-earnings" className={fieldLabelClasses}>
                      Earnings
                    </label>
                    <div className="relative">
                      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                        &pound;
                      </span>
                      <input
                        id="quick-win-earnings"
                        {...getNumericInputProps('decimal')}
                        value={quickWinEarnings}
                        onChange={(event) => setQuickWinEarnings(event.target.value)}
                        className={`pl-9 ${inputClasses} font-mono`}
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="quick-win-hours" className={fieldLabelClasses}>
                      Hours worked
                    </label>
                    <input
                      id="quick-win-hours"
                      {...getNumericInputProps('decimal')}
                      value={quickWinHours}
                      onChange={(event) => setQuickWinHours(event.target.value)}
                      className={`${inputClasses} font-mono`}
                      placeholder="0.0"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="quick-win-miles" className={fieldLabelClasses}>
                      Business miles (optional)
                    </label>
                    <input
                      id="quick-win-miles"
                      {...getNumericInputProps('decimal')}
                      value={quickWinMiles}
                      onChange={(event) => setQuickWinMiles(event.target.value)}
                      className={`${inputClasses} font-mono`}
                      placeholder="0"
                    />
                  </div>

                  <button type="submit" disabled={!canShowQuickWin} className={`${primaryButtonClasses} w-full justify-center`}>
                    Show me
                  </button>
                  <button
                    type="button"
                    onClick={() => completeOnboarding({ startWorkDay: false, hasLoggedShift: false })}
                    className="mt-3 w-full text-center text-sm text-slate-500 transition-colors hover:text-slate-300"
                  >
                    Skip for now
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
