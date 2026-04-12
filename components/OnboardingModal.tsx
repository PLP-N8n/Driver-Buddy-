import React, { useMemo, useRef, useState } from 'react';
import { Car, ChevronLeft, ChevronRight, HelpCircle, Package, Truck, UtensilsCrossed } from 'lucide-react';
import { DriverRole, Settings } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { primaryButtonClasses, secondaryButtonClasses } from '../utils/ui';

interface OnboardingModalProps {
  settings: Settings;
  onSkip?: () => void;
  onComplete: (updates: Partial<Settings>, options?: { startWorkDay?: boolean }) => void;
}

const roleOptions: Array<{ role: DriverRole; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { role: 'COURIER', label: 'Courier', icon: Package },
  { role: 'FOOD_DELIVERY', label: 'Food Delivery', icon: UtensilsCrossed },
  { role: 'TAXI', label: 'Taxi', icon: Car },
  { role: 'LOGISTICS', label: 'Logistics', icon: Truck },
  { role: 'OTHER', label: 'Other', icon: HelpCircle },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ settings, onSkip, onComplete }) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedRole, setSelectedRole] = useState<DriverRole>(settings.driverRoles[0] ?? 'COURIER');
  const [claimMethod, setClaimMethod] = useState<Settings['claimMethod']>(settings.claimMethod);
  const [mileageTrackingEnabled, setMileageTrackingEnabled] = useState(settings.mileageTrackingEnabled);

  useFocusTrap(modalRef, true);

  const updates = useMemo<Partial<Settings>>(
    () => ({
      driverRoles: [selectedRole],
      claimMethod,
      mileageTrackingEnabled,
    }),
    [claimMethod, mileageTrackingEnabled, selectedRole]
  );

  const finishOnboarding = () => {
    localStorage.setItem('drivertax_onboarded', '1');
    onComplete(updates, { startWorkDay: true });
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
            <p className="mt-1 text-sm text-slate-300">Step {step} of 4</p>
          </div>
          {step > 1 ? (
            <button type="button" onClick={() => setStep((current) => (current > 1 ? ((current - 1) as 1 | 2 | 3 | 4) : current))} className={secondaryButtonClasses}>
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
            <h2 className="text-2xl font-semibold text-white">Do you want to track mileage?</h2>
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => setMileageTrackingEnabled(true)}
                className={`w-full rounded-3xl border p-4 text-left transition-colors ${
                  mileageTrackingEnabled ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300'
                }`}
              >
                Yes, I&apos;ll log miles
              </button>
              <button
                type="button"
                onClick={() => setMileageTrackingEnabled(false)}
                className={`w-full rounded-3xl border p-4 text-left transition-colors ${
                  !mileageTrackingEnabled ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300'
                }`}
              >
                Skip for now
              </button>
            </div>
            <button type="button" onClick={() => setStep(4)} className={`${primaryButtonClasses} mt-6 w-full justify-center`}>
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-2xl font-semibold text-white">You&apos;re ready</h2>
            <p className="mt-3 text-sm text-slate-300">Track your work. Know your real take-home after tax.</p>
            <button type="button" onClick={finishOnboarding} className={`${primaryButtonClasses} mt-6 w-full justify-center`}>
              Finish setup
            </button>
            <p className="mt-4 text-center text-xs text-slate-500">Most drivers log their first day in under 20 seconds</p>
          </>
        )}
      </div>
    </div>
  );
};
