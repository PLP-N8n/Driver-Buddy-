import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CreditCard, Repeat, Target, Trash2 } from 'lucide-react';
import { DailyWorkLog, Debt, Settings } from '../types';
import {
  fieldErrorClasses,
  fieldLabelClasses,
  formatCurrency,
  formatNumber,
  getNumericInputProps,
  inputClasses,
  panelClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  subtlePanelClasses,
  validatePositiveNumber,
  validateRequired,
} from '../utils/ui';

interface DebtManagerProps {
  settings: Settings;
  dailyLogs: DailyWorkLog[];
  onUpdateSettings: (settings: Settings) => void;
}

export const DebtManager: React.FC<DebtManagerProps> = ({ settings, dailyLogs, onUpdateSettings }) => {
  const [newDebt, setNewDebt] = useState<Partial<Debt>>({ name: '', balance: 0, apr: 0, minPayment: 0 });
  const [balanceInput, setBalanceInput] = useState('');
  const [aprInput, setAprInput] = useState('');
  const [minPaymentInput, setMinPaymentInput] = useState('');
  const [formError, setFormError] = useState('');
  const [newDD, setNewDD] = useState<{ name: string; amount: string; dueDay: string }>({ name: '', amount: '', dueDay: '1' });
  const [ddError, setDdError] = useState('');

  const analysis = useMemo(() => {
    const totalRevenue = dailyLogs.reduce((sum, log) => sum + log.revenue, 0);
    const uniqueDays = new Set(dailyLogs.map((log) => log.date)).size || 1;
    const avgDailyRevenue = totalRevenue / uniqueDays;
    const projectedMonthlyAllocation = avgDailyRevenue * 22 * (settings.debtSetAsidePercent / 100);
    const totalDebt = settings.debts.reduce((sum, debt) => sum + debt.balance, 0);
    const totalMonthlyDDs = (settings.directDebits ?? []).reduce((sum, dd) => sum + dd.amount, 0);
    const totalMinPayments = settings.debts.reduce((sum, debt) => sum + debt.minPayment, 0);
    const effectivePayment = Math.max(projectedMonthlyAllocation, totalMinPayments);
    const monthsToFreedom = effectivePayment > 0 ? totalDebt / effectivePayment : 0;

    return {
      totalDebt,
      totalMonthlyDDs,
      projectedMonthlyAllocation,
      totalMinPayments,
      monthsToFreedom,
      isAllocationSufficient: projectedMonthlyAllocation >= totalMinPayments,
    };
  }, [dailyLogs, settings.debtSetAsidePercent, settings.debts, settings.directDebits]);

  const sortedDebts = [...settings.debts].sort((left, right) =>
    settings.debtStrategy === 'AVALANCHE' ? right.apr - left.apr : left.balance - right.balance
  );
  const directDebits = settings.directDebits ?? [];

  const addDebt = () => {
    const nameValidation = validateRequired(newDebt.name ?? '');
    if (!nameValidation.isValid) {
      setFormError(nameValidation.error ?? 'Enter a debt name.');
      return;
    }

    const balanceValidation = validatePositiveNumber(balanceInput);
    if (!balanceValidation.isValid) {
      setFormError(balanceValidation.error ?? 'Enter a positive balance.');
      return;
    }

    onUpdateSettings({
      ...settings,
      debts: [
        ...settings.debts,
        {
          id: Date.now().toString(),
          name: (newDebt.name ?? '').trim(),
          balance: parseFloat(balanceInput) || 0,
          apr: parseFloat(aprInput) || 0,
          minPayment: parseFloat(minPaymentInput) || 0,
        },
      ],
    });
    setNewDebt({ name: '', balance: 0, apr: 0, minPayment: 0 });
    setBalanceInput('');
    setAprInput('');
    setMinPaymentInput('');
    setFormError('');
  };

  const addDirectDebit = () => {
    const nameValidation = validateRequired(newDD.name);
    if (!nameValidation.isValid) {
      setDdError(nameValidation.error ?? 'Enter a direct debit name.');
      return;
    }

    const amountValidation = validatePositiveNumber(newDD.amount);
    if (!amountValidation.isValid) {
      setDdError(amountValidation.error ?? 'Enter a positive monthly amount.');
      return;
    }

    const dueDay = parseInt(newDD.dueDay, 10);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
      setDdError('Due day must be between 1 and 28.');
      return;
    }

    onUpdateSettings({
      ...settings,
      directDebits: [
        ...(settings.directDebits ?? []),
        {
          id: Date.now().toString(),
          name: newDD.name.trim(),
          amount: parseFloat(newDD.amount),
          dueDay,
        },
      ],
    });
    setNewDD({ name: '', amount: '', dueDay: '1' });
    setDdError('');
  };

  return (
    <div className="space-y-4">
      <section className={`${panelClasses} p-5`}>
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-lg font-semibold text-white">Debt manager</p>
            <p className="mt-1 text-sm text-slate-400">Keep debt strategy tied to your actual driving income and allocation rate.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={`${subtlePanelClasses} p-4`}>
              <p className="text-sm text-slate-400">Total debt</p>
              <p className="mt-2 font-mono text-2xl text-red-400">{formatCurrency(analysis.totalDebt)}</p>
            </div>
            <div className={`${subtlePanelClasses} p-4`}>
              <p className="text-sm text-slate-400">Freedom estimate</p>
              <p className="mt-2 font-mono text-2xl text-white">
                {analysis.totalDebt === 0 ? 'Debt free' : `${formatNumber(analysis.monthsToFreedom, 1)} mo`}
              </p>
            </div>
            <div className={`${subtlePanelClasses} p-4`}>
              <p className="text-sm text-slate-400">Monthly DDs</p>
              <p className="mt-2 font-mono text-2xl text-white">{formatCurrency(analysis.totalMonthlyDDs)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <section className={`${panelClasses} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Allocation rule</h3>
                <p className="text-sm text-slate-400">Projected monthly contribution: {formatCurrency(analysis.projectedMonthlyAllocation)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs ${analysis.isAllocationSufficient ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-300'}`}>
                {analysis.isAllocationSufficient ? 'Covers minimums' : 'Below minimums'}
              </span>
            </div>
            <input
              id="debt-set-aside"
              type="range"
              min="0"
              max="50"
              step="1"
              value={settings.debtSetAsidePercent}
              onChange={(event) => onUpdateSettings({ ...settings, debtSetAsidePercent: parseInt(event.target.value, 10) })}
              className="h-2 w-full accent-brand"
            />
            <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
              <span>Debt set-aside</span>
              <span className="font-mono text-white">{settings.debtSetAsidePercent}%</span>
            </div>
            {!analysis.isAllocationSufficient && (
              <p className="mt-3 text-sm text-red-400">
                Current allocation does not cover minimum payments. Increase the slider or rebalance your plan.
              </p>
            )}
          </section>

          <section className={`${panelClasses} p-5`}>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-white">Payoff strategy</h3>
              <p className="text-sm text-slate-400">Choose the priority order you want to follow.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, debtStrategy: 'AVALANCHE' })}
                className={`rounded-xl border p-4 text-left transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${settings.debtStrategy === 'AVALANCHE' ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300'}`}
              >
                <ArrowDown className="mb-3 h-5 w-5" />
                <p className="font-medium">Avalanche</p>
                <p className="mt-1 text-sm text-slate-400">Highest APR first.</p>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, debtStrategy: 'SNOWBALL' })}
                className={`rounded-xl border p-4 text-left transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${settings.debtStrategy === 'SNOWBALL' ? 'border-brand bg-brand/10 text-white' : 'border-surface-border bg-surface-raised text-slate-300'}`}
              >
                <ArrowUp className="mb-3 h-5 w-5" />
                <p className="font-medium">Snowball</p>
                <p className="mt-1 text-sm text-slate-400">Smallest balance first.</p>
              </button>
            </div>
          </section>

          <section className={`${panelClasses} p-5`}>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-white">Add debt</h3>
              <p className="text-sm text-slate-400">Enter the current balance, APR, and minimum payment.</p>
            </div>
            <div className="space-y-4">
              <div className="block">
                <label htmlFor="debt-name" className={fieldLabelClasses}>
                  Name
                </label>
                <input
                  id="debt-name"
                  type="text"
                  value={newDebt.name || ''}
                  onChange={(event) => {
                    setNewDebt({ ...newDebt, name: event.target.value });
                    if (formError) setFormError('');
                  }}
                  className={`${inputClasses} ${formError ? 'border-red-400' : ''}`}
                  placeholder="Van finance"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="block">
                  <label htmlFor="debt-balance" className={fieldLabelClasses}>
                    Balance
                  </label>
                  <input
                    id="debt-balance"
                    {...getNumericInputProps('decimal')}
                    value={balanceInput}
                    onChange={(event) => {
                      setBalanceInput(event.target.value);
                      if (formError) setFormError('');
                    }}
                    className={`${inputClasses} font-mono ${formError ? 'border-red-400' : ''}`}
                    placeholder="0.00"
                  />
                </div>
                <div className="block">
                  <label htmlFor="debt-apr" className={fieldLabelClasses}>
                    APR
                  </label>
                  <input
                    id="debt-apr"
                    {...getNumericInputProps('decimal')}
                    value={aprInput}
                    onChange={(event) => {
                      setAprInput(event.target.value);
                      if (formError) setFormError('');
                    }}
                    className={`${inputClasses} font-mono`}
                    placeholder="0.0"
                  />
                </div>
              </div>
              <div className="block">
                <label htmlFor="debt-min-payment" className={fieldLabelClasses}>
                  Minimum payment
                </label>
                <input
                  id="debt-min-payment"
                  {...getNumericInputProps('decimal')}
                  value={minPaymentInput}
                  onChange={(event) => {
                    setMinPaymentInput(event.target.value);
                    if (formError) setFormError('');
                  }}
                  className={`${inputClasses} font-mono`}
                  placeholder="0.00"
                />
              </div>
              {formError && <p className={fieldErrorClasses} role="alert">{formError}</p>}
              <button type="button" onClick={addDebt} className={primaryButtonClasses}>
                Add debt
              </button>
            </div>
          </section>
        </div>

        <section className={`${panelClasses} p-5`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Priority queue</h3>
              <p className="text-sm text-slate-400">Ordered by your selected payoff strategy.</p>
            </div>
            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs text-purple-400">{settings.debtStrategy}</span>
          </div>

          {sortedDebts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CreditCard className="mb-3 h-12 w-12 text-slate-500" />
              <p className="font-medium text-slate-300">No debts tracked yet</p>
              <p className="mt-1 text-sm text-slate-500">Add a debt to see your payoff timeline and auto-allocate income to clear it faster.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedDebts.map((debt, index) => {
                const projectedPercent = Math.min(100, Math.max(4, debt.minPayment > 0 ? (debt.minPayment / Math.max(debt.balance, 1)) * 100 : 0));
                return (
                  <article key={debt.id} className={`${subtlePanelClasses} p-4 transition-transform duration-150 active:scale-[0.98]`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                          {index === 0 && (
                            <span className="rounded-full bg-brand/20 px-2 py-0.5 text-xs text-brand">
                              <Target className="mr-1 inline h-3.5 w-3.5" />
                              Focus
                            </span>
                          )}
                          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-slate-300">APR {debt.apr}%</span>
                          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">{settings.debtStrategy}</span>
                        </div>
                        <p className="truncate text-base font-medium text-white">{debt.name}</p>
                        <p className="mt-2 font-mono text-xl text-red-400">{formatCurrency(debt.balance)}</p>
                        <p className="mt-1 text-xs text-slate-500">Minimum payment {formatCurrency(debt.minPayment)}</p>
                        <div className="mt-3">
                          <div className="h-2 rounded-full bg-surface-raised">
                            <div className="h-2 rounded-full bg-brand" style={{ width: `${projectedPercent}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{formatNumber(projectedPercent, 1)}% monthly balance coverage</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings({ ...settings, debts: settings.debts.filter((item) => item.id !== debt.id) })
                        }
                        className={secondaryButtonClasses}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <section className={`${panelClasses} p-5`}>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-white">Direct debits</h3>
          <p className="text-sm text-slate-400">Fixed monthly outgoings that come out regardless of earnings.</p>
        </div>

        {directDebits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Repeat className="mb-3 h-10 w-10 text-slate-500" />
            <p className="font-medium text-slate-300">No direct debits added yet.</p>
          </div>
        ) : (
          <div className="mb-4 space-y-3">
            {directDebits.map((dd) => (
              <article key={dd.id} className={`${subtlePanelClasses} p-4 transition-transform duration-150 active:scale-[0.98]`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-white">{dd.name}</p>
                    <p className="mt-2 font-mono text-xl text-white">{formatCurrency(dd.amount)}/mo</p>
                    <p className="mt-1 text-xs text-slate-500">Due day {dd.dueDay}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        directDebits: (settings.directDebits ?? []).filter((item) => item.id !== dd.id),
                      })
                    }
                    className={secondaryButtonClasses}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div className="block">
            <label htmlFor="dd-name" className={fieldLabelClasses}>
              Name
            </label>
            <input
              id="dd-name"
              type="text"
              value={newDD.name}
              onChange={(event) => {
                setNewDD({ ...newDD, name: event.target.value });
                if (ddError) setDdError('');
              }}
              className={`${inputClasses} ${ddError ? 'border-red-400' : ''}`}
              placeholder="Van insurance"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block">
              <label htmlFor="dd-amount" className={fieldLabelClasses}>
                Amount
              </label>
              <input
                id="dd-amount"
                {...getNumericInputProps('decimal')}
                value={newDD.amount}
                onChange={(event) => {
                  setNewDD({ ...newDD, amount: event.target.value });
                  if (ddError) setDdError('');
                }}
                className={`${inputClasses} font-mono ${ddError ? 'border-red-400' : ''}`}
                placeholder="0.00"
              />
            </div>
            <div className="block">
              <label htmlFor="dd-due-day" className={fieldLabelClasses}>
                Due day
              </label>
              <input
                id="dd-due-day"
                type="number"
                min="1"
                max="28"
                value={newDD.dueDay}
                onChange={(event) => {
                  setNewDD({ ...newDD, dueDay: event.target.value });
                  if (ddError) setDdError('');
                }}
                className={`${inputClasses} font-mono ${ddError ? 'border-red-400' : ''}`}
                placeholder="1"
              />
            </div>
          </div>
          {ddError && <p className={fieldErrorClasses} role="alert">{ddError}</p>}
          <button type="button" onClick={addDirectDebit} className={primaryButtonClasses}>
            Add direct debit
          </button>
        </div>
      </section>
    </div>
  );
};
