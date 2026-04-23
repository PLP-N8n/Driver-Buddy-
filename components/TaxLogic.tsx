import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, Info, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { DailyWorkLog, Expense, Settings, Trip, getCurrentTaxYearLabel } from '../types';
import {
  calcActualDeduction,
  calcKept,
  calcSimplifiedDeduction,
  calcTaxBuffer,
  calcTaxableProfit,
  compareTaxMethods,
} from '../shared/calculations/tax';
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
import { generateHmrcSummaryHtml, generateTaxPackCSVs } from '../utils/taxPack';
import { buildTaxAnalysis } from '../utils/tax';
import { filterToCurrentTaxYear, todayUK, ukTaxYearEnd, ukTaxYearStart } from '../utils/ukDate';

interface TaxLogicProps {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
  onDownloadRecords: (recordCount: number, callback: () => void) => void;
}

type MethodView = 'SIMPLIFIED' | 'ACTUAL' | 'COMPARE';

function getTaxYearEndDate(): Date {
  return new Date(`${ukTaxYearEnd()}T12:00:00Z`);
}

function daysUntil(target: Date): number {
  const today = new Date(`${todayUK()}T12:00:00Z`);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function weeksUntil(target: Date): number {
  return Math.max(1, Math.ceil(daysUntil(target) / 7));
}

function escapeCsvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function getTaxBand(taxableProfit: number, isScottishTaxpayer?: boolean): { label: string; colour: string } | null {
  if (taxableProfit <= 0) return null;
  if (taxableProfit <= 12570) return { label: 'Below personal allowance', colour: 'bg-green-500/20 text-green-400' };
  if (isScottishTaxpayer) return { label: 'Scottish income tax rates', colour: 'bg-sky-500/20 text-sky-300' };
  if (taxableProfit <= 50270) return { label: 'Basic rate payer (20%)', colour: 'bg-amber-500/20 text-amber-400' };
  if (taxableProfit <= 125140) return { label: 'Higher rate payer (40%)', colour: 'bg-orange-500/20 text-orange-400' };
  return { label: 'Additional rate payer (45%)', colour: 'bg-red-500/20 text-red-400' };
}

function TaxEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <PiggyBank className="mb-3 h-12 w-12 text-slate-500" />
      <p className="font-medium text-slate-300">No revenue logged yet</p>
      <p className="mt-1 text-sm text-slate-500">Start shift to see your live tax estimate, real take-home, and how much to set aside.</p>
    </div>
  );
}

export const TaxLogic: React.FC<TaxLogicProps> = ({
  trips,
  expenses,
  dailyLogs,
  settings,
  onUpdateSettings,
  onDownloadRecords,
}) => {
  const [methodView, setMethodView] = useState<MethodView>('COMPARE');
  const [newAllowance, setNewAllowance] = useState({ description: '', amount: '' });
  const [allowanceError, setAllowanceError] = useState('');
  const [showCalcExplainer, setShowCalcExplainer] = useState(false);

  const taxYearEnd = getTaxYearEndDate();
  const taxYearStart = ukTaxYearStart();
  const taxYearEndKey = ukTaxYearEnd();
  const taxYearLabel = getCurrentTaxYearLabel();
  const filteredLogs = useMemo(() => filterToCurrentTaxYear(dailyLogs), [dailyLogs]);
  const filteredTrips = useMemo(
    () => filterToCurrentTaxYear(trips).filter((trip) => trip.purpose === 'Business'),
    [trips]
  );
  const filteredExpenses = useMemo(() => filterToCurrentTaxYear(expenses), [expenses]);
  const analysis = useMemo(
    () =>
      buildTaxAnalysis({
        trips: filteredTrips,
        expenses: filteredExpenses,
        dailyLogs: filteredLogs,
        settings,
      }),
    [filteredLogs, filteredExpenses, filteredTrips, settings]
  );

  const effectiveMethod = methodView === 'COMPARE' ? settings.claimMethod : methodView;
  const projection = effectiveMethod === 'SIMPLIFIED' ? analysis.simplifiedProjection : analysis.actualProjection;
  const deductionUsed = effectiveMethod === 'SIMPLIFIED' ? analysis.simplifiedDeduction : analysis.actualDeduction;
  const taxTone =
    projection.estimatedLiability === 0
      ? analysis.totalRevenue > 0
        ? 'text-green-400'
        : 'text-slate-400'
      : projection.estimatedLiability < analysis.totalRevenue * 0.2
        ? 'text-amber-400'
        : 'text-red-400';
  const taxSetAside = calcTaxBuffer(analysis.totalRevenue, settings.taxSetAsidePercent);
  const potPct = Math.min(1, taxSetAside / Math.max(1, projection.estimatedLiability));
  const potBarColour = potPct >= 1 ? 'bg-green-500' : potPct >= 0.5 ? 'bg-amber-400' : 'bg-red-500';
  const potGapAmount = Math.max(0, projection.estimatedLiability - taxSetAside);
  const weeksLeft = weeksUntil(taxYearEnd);
  const weeklyTarget = potGapAmount > 0 ? potGapAmount / weeksLeft : 0;
  const taxBand = getTaxBand(projection.taxableProfit, settings.isScottishTaxpayer);
  const taxPack = useMemo(
    () =>
      generateTaxPackCSVs({
        taxYearStart,
        taxYearEnd: taxYearEndKey,
        logs: dailyLogs,
        trips,
        expenses,
        settings,
      }),
    [dailyLogs, expenses, settings, taxYearEndKey, taxYearStart, trips]
  );

  const downloadText = (filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleAddAllowance = () => {
    const descriptionValidation = validateRequired(newAllowance.description);
    if (!descriptionValidation.isValid) {
      setAllowanceError(descriptionValidation.error ?? 'Enter a description.');
      return;
    }

    const amountValidation = validatePositiveNumber(newAllowance.amount);
    if (!amountValidation.isValid) {
      setAllowanceError(amountValidation.error ?? 'Enter a positive allowance amount.');
      return;
    }

    const amount = parseFloat(newAllowance.amount);
    onUpdateSettings({
      ...settings,
      manualAllowances: [...settings.manualAllowances, { id: Date.now().toString(), description: newAllowance.description.trim(), amount }],
    });
    setNewAllowance({ description: '', amount: '' });
    setAllowanceError('');
  };

  const handleMethodChange = (view: MethodView) => {
    setMethodView(view);
    if (view === 'SIMPLIFIED' || view === 'ACTUAL') {
      onUpdateSettings({ ...settings, claimMethod: view });
    }
  };

  const handleExport = () => {
    const rows = [
      ['Category', 'Value'],
      ['Revenue', formatCurrency(analysis.totalRevenue)],
      ['Selected Method', effectiveMethod === 'SIMPLIFIED' ? 'Simplified Expenses' : 'Actual Costs'],
      ['Deduction Used', formatCurrency(deductionUsed)],
      ['Taxable Profit', formatCurrency(projection.taxableProfit)],
      ['Estimated Income Tax', formatCurrency(projection.estimatedTax)],
      ['Estimated Class 2 NI', formatCurrency(projection.estimatedClass2NI)],
      ['Estimated Class 4 NI', formatCurrency(projection.estimatedClass4NI)],
      ['Estimated Total NI', formatCurrency(projection.estimatedNI)],
      ['Estimated Liability', formatCurrency(projection.estimatedLiability)],
      ['Payments on Account', formatCurrency(projection.paymentOnAccountAmount)],
      ['Personal Allowance Used', formatCurrency(projection.personalAllowanceUsed)],
      ['Personal Allowance Remaining', formatCurrency(projection.personalAllowanceRemaining)],
      ['Simplified Deduction', formatCurrency(analysis.simplifiedDeduction)],
      ['Actual Deduction', formatCurrency(analysis.actualDeduction)],
    ];

    const csvContent = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
    onDownloadRecords(dailyLogs.length + trips.length + expenses.length, () => {
      downloadText('tax-summary.csv', csvContent);
    });
  };

  const handleHmrcSummaryDownload = () => {
    const html = generateHmrcSummaryHtml({
      taxYearStart,
      taxYearEnd: taxYearEndKey,
      logs: dailyLogs,
      trips,
      expenses,
      settings,
    });

    onDownloadRecords(filteredLogs.length + filteredTrips.length + filteredExpenses.length, () => {
      downloadText(`driver-buddy-hmrc-summary-${taxYearLabel.replace('/', '-')}.html`, html, 'text/html;charset=utf-8');
    });
  };

  const handleTaxPackDownload = () => {
    const recordCount = filteredLogs.length + filteredTrips.length + filteredExpenses.length;
    onDownloadRecords(recordCount, () => {
      downloadText(`driver-buddy-tax-pack-summary-${taxYearLabel.replace('/', '-')}.csv`, taxPack.summaryCSV);
      window.setTimeout(() => {
        downloadText(`driver-buddy-tax-pack-detail-${taxYearLabel.replace('/', '-')}.csv`, taxPack.detailCSV);
      }, 200);
      window.setTimeout(() => {
        downloadText(`driver-buddy-tax-pack-mileage-${taxYearLabel.replace('/', '-')}.csv`, taxPack.mileageCSV);
      }, 400);
    });
  };

  return (
    <div className="space-y-4">
      <section className={`${panelClasses} p-5`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="text-sm text-slate-400">Estimated tax bill</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(projection.estimatedLiability)}</p>
          </div>
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="text-sm text-slate-400">Already set aside</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(taxSetAside)}</p>
          </div>
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="text-sm text-slate-400">Gap</p>
            <p className={`mt-2 text-2xl font-semibold ${potGapAmount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
              {formatCurrency(potGapAmount)}
            </p>
          </div>
          <div className={`${subtlePanelClasses} p-4`}>
            <p className="text-sm text-slate-400">Weekly target to close gap</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(weeklyTarget)}</p>
          </div>
        </div>
      </section>

      <section data-testid="tax-pack-section" className={`${panelClasses} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-white">Tax Pack - everything your accountant needs</p>
            <p className="mt-2 text-sm text-slate-300">
              Tax year {taxYearLabel} · {filteredLogs.length} work logs · {formatCurrency(filteredLogs.reduce((sum, log) => sum + log.revenue, 0))}
            </p>
            <p className="mt-2 text-sm text-slate-400">Includes: HMRC summary · Accountant CSV · Mileage log</p>
          </div>
          <button type="button" onClick={handleTaxPackDownload} className={primaryButtonClasses}>
            <Download className="h-4 w-4" />
            <span>Download Tax Pack (3 files)</span>
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-900/40 to-emerald-900/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-white">Tax Year {taxYearLabel}</p>
            <span className="mt-2 inline-flex rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-300">
              Based on HMRC rates
            </span>
            <button
              type="button"
              onClick={() => setShowCalcExplainer((value) => !value)}
              className="mt-2 flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
            >
              <Info className="h-3 w-3" />
              How is this calculated?
            </button>
            {showCalcExplainer && (
              <div className="mt-3 space-y-2 rounded-xl border border-surface-border bg-surface-raised p-4 text-xs text-slate-400">
                <p>
                  <span className="font-medium text-slate-200">Simplified mileage:</span> HMRC allows 45p/mile for the first 10,000
                  business miles, 25p/mile after. No actual vehicle costs claimed.
                </p>
                <p>
                  <span className="font-medium text-slate-200">Actual costs:</span> Real expenses such as fuel, insurance, and repairs
                  are multiplied by your business-use percentage.
                </p>
                <p>
                  <span className="font-medium text-slate-200">Tax estimate:</span> Taxable profit after deductions, with the
                  personal allowance of {formatCurrency(12570)} deducted first, then 20% income tax plus Class 4 NI at 6% between{' '}
                  {formatCurrency(12570)} and {formatCurrency(50270)}, and 2% above.
                </p>
                <p>
                  <span className="font-medium text-slate-200">Class 2 NI:</span> Mandatory Class 2 National Insurance was abolished
                  from 6 April 2024, so this estimate only includes it when a future rule change or voluntary option is modelled.
                </p>
                <p>
                  <span className="font-medium text-slate-200">This is an estimate only.</span> Use an accountant or HMRC for the
                  final return.
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleHmrcSummaryDownload} className={secondaryButtonClasses}>
              <Download className="h-4 w-4" />
              <span>HMRC Summary</span>
            </button>
            <button
              type="button"
              title="Formatted for HMRC self-assessment"
              onClick={handleExport}
              className={secondaryButtonClasses}
            >
              <Download className="h-4 w-4" />
              <span>Download Accountant CSV</span>
            </button>
          </div>
        </div>
      </section>

      <section className={`${panelClasses} p-5`}>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tax pot</p>
        {analysis.totalRevenue === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Log shifts to see your tax pot.</p>
        ) : projection.estimatedLiability === 0 ? (
          <p className="mt-2 text-sm text-green-400">Earning below personal allowance, so no tax is due yet.</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="number-large glow-amber text-xl text-white">{formatCurrency(taxSetAside)}</span>
              <span className="text-sm text-slate-400">set aside of {formatCurrency(projection.estimatedLiability)} estimated bill</span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
              <div className={`h-2.5 rounded-full transition-all duration-500 ${potBarColour}`} style={{ width: `${potPct * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {potPct >= 1 ? (
                <span className="text-green-400">Tax pot fully funded.</span>
              ) : (
                <span className="text-amber-400">You need {formatCurrency(potGapAmount)} more to cover your bill.</span>
              )}{' '}
              ({formatNumber(potPct * 100, 0)}%)
            </p>
          </>
        )}
      </section>

      <section className={`${subtlePanelClasses} p-4`}>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Weekly target</p>
        {analysis.totalRevenue === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Log shifts to see your weekly target.</p>
        ) : projection.estimatedLiability === 0 ? (
          <p className="mt-2 text-sm text-green-400">No tax due, so nothing needs to be set aside.</p>
        ) : weeklyTarget === 0 ? (
          <p className="mt-2 text-sm text-green-400">You're on track and the tax pot is fully covered.</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="number-large glow-amber text-xl text-white">{formatCurrency(weeklyTarget)}</span>
              <span className="text-sm text-slate-400">/ week to cover your bill by 31 Jan</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{weeksLeft} week{weeksLeft !== 1 ? 's' : ''} remaining in tax year</p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface p-4">
        <div className="inline-flex rounded-xl bg-surface-raised p-1">
          {(['SIMPLIFIED', 'ACTUAL', 'COMPARE'] as MethodView[]).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => handleMethodChange(view)}
              className={`rounded-lg px-4 py-2 text-sm transition-colors duration-150 transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)] ${
                methodView === view ? 'bg-brand text-white' : 'text-slate-400'
              }`}
            >
              {view === 'COMPARE' ? 'Compare' : view === 'SIMPLIFIED' ? 'Simplified' : 'Actual'}
            </button>
          ))}
        </div>
      </section>

      {analysis.totalRevenue === 0 ? (
        <TaxEmptyState />
      ) : (
        <>
          {methodView === 'COMPARE' && (
            <section className="grid gap-4 lg:grid-cols-2">
              <article className={`${subtlePanelClasses} p-4`}>
                <p className="text-sm font-medium text-slate-300">Simplified deduction</p>
                <p className="mt-2 font-mono text-2xl text-white">{formatCurrency(analysis.simplifiedDeduction)}</p>
                <p className="mt-2 text-sm text-slate-400">Mileage allowance plus parking, other costs, and manual allowances.</p>
              </article>
              <article className={`${subtlePanelClasses} p-4`}>
                <p className="text-sm font-medium text-slate-300">Actual deduction</p>
                <p className="mt-2 font-mono text-2xl text-white">{formatCurrency(analysis.actualDeduction)}</p>
                <p className="mt-2 text-sm text-slate-400">Vehicle costs apportioned by business use, plus additional allowable costs.</p>
              </article>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-2">
            <article className={`${panelClasses} p-5`}>
              <p className="text-sm text-slate-400">Taxable profit</p>
              <p className="number-large glow-green mt-3 text-4xl text-white">{formatCurrency(projection.taxableProfit)}</p>
              <p className="mt-2 text-sm text-slate-500">
                After {effectiveMethod === 'SIMPLIFIED' ? 'simplified' : 'actual'} deductions of {formatCurrency(deductionUsed)}.
              </p>
            </article>
            <article className={`${panelClasses} p-5`}>
              <p className="text-sm text-slate-400">Tax to set aside</p>
              <p className={`number-large mt-3 text-4xl ${projection.estimatedLiability > 0 ? 'glow-red' : ''} ${taxTone}`}>
                {formatCurrency(projection.estimatedLiability)}
              </p>
              <p className="mt-2 text-sm text-slate-500">Income tax plus National Insurance.</p>
              {taxBand && (
                <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${taxBand.colour}`}>
                  {taxBand.label}
                </span>
              )}
            </article>
          </section>

          <section className={`${panelClasses} p-5`}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white">National Insurance breakdown</h3>
              <p className="text-sm text-slate-400">Separate view of Class 2 and Class 4 National Insurance in the current estimate.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className={`${subtlePanelClasses} p-4`}>
                <p className="text-sm text-slate-400">Class 2 NI</p>
                <p className="mt-2 font-mono text-2xl text-amber-400">{formatCurrency(projection.estimatedClass2NI)}</p>
              </div>
              <div className={`${subtlePanelClasses} p-4`}>
                <p className="text-sm text-slate-400">Class 4 main rate</p>
                <p className="mt-2 font-mono text-2xl text-amber-400">{formatCurrency(projection.class4Main)}</p>
              </div>
              <div className={`${subtlePanelClasses} p-4`}>
                <p className="text-sm text-slate-400">Class 4 upper rate</p>
                <p className="mt-2 font-mono text-2xl text-amber-400">{formatCurrency(projection.class4Upper)}</p>
              </div>
              <div className={`${subtlePanelClasses} p-4`}>
                <p className="text-sm text-slate-400">Total NI</p>
                <p className="mt-2 font-mono text-2xl text-amber-400">{formatCurrency(projection.estimatedNI)}</p>
              </div>
            </div>
          </section>

          {projection.paymentsOnAccount && (
            <section className="mx-0 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">Payments on Account likely</p>
                  <p className="mt-1 text-xs text-amber-200/70">
                    Based on the current estimate, HMRC would likely ask for two advance payments toward next year's bill. Each is 50%
                    of this year's liability, due 31 January and 31 July. Budget for{' '}
                    <span className="font-semibold text-amber-300">{formatCurrency(projection.januaryPaymentTotal)}</span> total this
                    January.
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4 lg:grid-cols-3">
            <article className={`${subtlePanelClasses} p-4`}>
              <p className="text-sm text-slate-400">Business miles</p>
              <p className="mt-2 font-mono text-2xl text-white">{formatNumber(analysis.totalBusinessMiles)} mi</p>
            </article>
            <article className={`${subtlePanelClasses} p-4`}>
              <p className="text-sm text-slate-400">Mileage allowance</p>
              <p className="mt-2 font-mono text-2xl text-white">{formatCurrency(analysis.totalMileageAllowance)}</p>
            </article>
            <article className={`${subtlePanelClasses} p-4`}>
              <p className="text-sm text-slate-400">Business use ratio</p>
              <p className="mt-2 font-mono text-2xl text-white">{formatNumber(analysis.businessUsePercent * 100, 1)}%</p>
            </article>
          </section>
        </>
      )}

      {(() => {
        const taxYearEndDate = getTaxYearEndDate();
        const endYear = Number(ukTaxYearEnd().slice(0, 4));
        const dates = [
          { label: 'Self Assessment filing + payment', date: new Date(Date.UTC(endYear, 0, 31, 12)) },
          { label: 'Payment on Account (2nd)', date: new Date(Date.UTC(endYear, 6, 31, 12)) },
          { label: 'Tax year end', date: taxYearEndDate },
        ];

        return (
          <section className={`${subtlePanelClasses} p-4`}>
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">Key dates</p>
            <div className="space-y-3">
              {dates.map(({ label, date }) => {
                const days = daysUntil(date);
                const dateStr = date.toLocaleDateString('en-GB', {
                  timeZone: 'Europe/London',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                });
                const colour = days < 0 ? 'text-slate-600' : days <= 30 ? 'text-red-400' : days <= 90 ? 'text-amber-400' : 'text-slate-400';

                return (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-slate-300">{label}</p>
                      <p className="text-xs text-slate-500">{dateStr}</p>
                    </div>
                    <span className={`shrink-0 font-mono text-sm font-medium ${colour}`}>
                      {days < 0 ? 'Passed' : `${days}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      <section className={`${panelClasses} p-5`}>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-white">Manual allowances</h3>
            <p className="text-sm text-slate-400">Add fixed adjustments such as home office use or specialist clothing.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
            <div className="block">
              <label htmlFor="allowance-description" className={fieldLabelClasses}>
                Description
              </label>
              <input
                id="allowance-description"
                type="text"
                value={newAllowance.description}
                onChange={(event) => {
                  setNewAllowance({ ...newAllowance, description: event.target.value });
                  if (allowanceError) setAllowanceError('');
                }}
                className={`${inputClasses} ${allowanceError ? 'border-red-400' : ''}`}
                placeholder="Home office use"
              />
            </div>
            <div className="block lg:min-w-[140px]">
              <label htmlFor="allowance-amount" className={fieldLabelClasses}>
                Amount
              </label>
              <input
                id="allowance-amount"
                {...getNumericInputProps('decimal')}
                value={newAllowance.amount}
                onChange={(event) => {
                  setNewAllowance({ ...newAllowance, amount: event.target.value });
                  if (allowanceError) setAllowanceError('');
                }}
                className={`${inputClasses} font-mono ${allowanceError ? 'border-red-400' : ''}`}
                placeholder="0.00"
              />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={handleAddAllowance} className={primaryButtonClasses}>
                <Plus className="h-4 w-4" />
                <span>Add</span>
              </button>
            </div>
          </div>
          {allowanceError && <p className={fieldErrorClasses} role="alert">{allowanceError}</p>}

          <div className="mt-4 space-y-3">
            {settings.manualAllowances.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <PiggyBank className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                <p>No manual allowances added yet.</p>
              </div>
            ) : (
              settings.manualAllowances.map((allowance) => (
                <div key={allowance.id} className={`${subtlePanelClasses} flex items-center justify-between px-4 py-3`}>
                  <div>
                    <p className="font-medium text-white">{allowance.description}</p>
                    <p className="font-mono text-sm text-slate-400">{formatCurrency(allowance.amount)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        manualAllowances: settings.manualAllowances.filter((item) => item.id !== allowance.id),
                      })
                    }
                    className={secondaryButtonClasses}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Remove</span>
                  </button>
                </div>
              ))
            )}
          </div>
      </section>
    </div>
  );
};
