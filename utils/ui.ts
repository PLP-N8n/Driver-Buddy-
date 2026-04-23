import { getFocusClasses, getMinTouchTarget } from './accessibility';
import { toUKDateString, ukWeekStart } from './ukDate';

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

export const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0);

export const formatNumber = (value: number, maximumFractionDigits = 1) =>
  new Intl.NumberFormat('en-GB', {
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);

export const toInputDate = (value = new Date()) => toUKDateString(value);

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface FormFieldState {
  value: string;
  error?: string;
  touched: boolean;
  dirty: boolean;
}

export const validateRequired = (value: string): ValidationResult => {
  if (!value || value.trim() === '') {
    return { isValid: false, error: 'This field is required.' };
  }

  return { isValid: true };
};

export const validateNumber = (value: string, min?: number, max?: number): ValidationResult => {
  const number = parseFloat(value);

  if (!Number.isFinite(number)) {
    return { isValid: false, error: 'Please enter a valid number.' };
  }

  if (min !== undefined && number < min) {
    return { isValid: false, error: `Value must be at least ${min}.` };
  }

  if (max !== undefined && number > max) {
    return { isValid: false, error: `Value must be no more than ${max}.` };
  }

  return { isValid: true };
};

export const validatePositiveNumber = (value: string): ValidationResult =>
  validateNumber(value, 0.01);

export const focusRingClasses = getFocusClasses();
export const touchTargetClasses = getMinTouchTarget();
const buttonBaseClasses =
  `inline-flex ${touchTargetClasses} select-none items-center justify-center gap-2 rounded-full px-5 py-3 text-sm transition-colors transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${focusRingClasses}`;

export const fieldLabelClasses = 'mb-2 block text-sm font-medium text-slate-300';
export const inputClasses =
  `w-full min-h-[48px] rounded-xl border border-surface-border bg-surface-raised px-4 py-3 text-base text-white placeholder:text-slate-500 transition-colors duration-150 focus:border-brand ${focusRingClasses}`;
export const selectClasses = `${inputClasses} appearance-none pr-10`;
export const textareaClasses = `${inputClasses} min-h-[96px] resize-y`;
export const primaryButtonClasses =
  `${buttonBaseClasses} bg-brand font-semibold text-white hover:bg-brand-hover`;
export const secondaryButtonClasses =
  `${buttonBaseClasses} border border-surface-border bg-surface-raised font-medium text-white hover:bg-surface-border`;
export const dangerButtonClasses =
  `${buttonBaseClasses} bg-red-500/90 font-medium text-white hover:bg-red-500`;
export const iconButtonClasses =
  `inline-flex h-11 w-11 items-center justify-center rounded-full border border-surface-border bg-surface-raised text-slate-300 transition-colors duration-150 active:scale-95 hover:bg-surface-border ${focusRingClasses}`;
export const filterChipClasses =
  `min-h-[44px] whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors duration-150 active:scale-95 ${focusRingClasses}`;
export const panelClasses = 'rounded-3xl border border-surface-border/80 bg-surface/95 panel-shadow backdrop-blur-xl';
export const subtlePanelClasses = 'rounded-2xl border border-surface-border bg-surface-raised/70 backdrop-blur-xl';
export const mutedTextClasses = 'text-sm text-slate-400';
export const fieldErrorClasses = 'mt-1.5 flex items-center gap-2 text-sm text-red-400';
export const sheetBackdropClasses = 'fixed inset-x-0 top-0 bottom-[64px] z-40 bg-slate-950/80 backdrop-blur-sm';
export const sheetPanelClasses =
  'absolute inset-x-0 bottom-0 max-h-[calc(100vh-64px)] overflow-y-auto rounded-t-3xl border border-surface-border bg-surface px-5 pt-5 pb-sheet shadow-2xl shadow-black/40 animate-sheet-in';
export const dialogBackdropClasses = 'fixed inset-x-0 top-0 bottom-[64px] z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm';
export const dialogPanelClasses =
  'max-h-[calc(100vh-64px)] w-full overflow-y-auto rounded-3xl border border-surface-border bg-surface p-5 shadow-2xl shadow-black/40 animate-scale-in';

export const getNumericInputProps = (mode: 'decimal' | 'numeric' = 'decimal') => ({
  inputMode: mode,
  type: 'text' as const,
});

export const toWeekStartDate = (dateValue: string, startDay: 'MON' | 'SUN' = 'MON') => {
  return new Date(`${ukWeekStart(dateValue, startDay)}T12:00:00Z`);
};

export const getMondayForDate = (dateValue: string) => toWeekStartDate(dateValue, 'MON');

export const formatWeekLabel = (dateValue: string, startDay: 'MON' | 'SUN' = 'MON') =>
  toWeekStartDate(dateValue, startDay).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
  });
