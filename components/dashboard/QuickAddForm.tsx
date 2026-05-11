import React from 'react';
import { ChevronDown, LoaderCircle } from 'lucide-react';
import type { Settings } from '../../types';
import type { ShiftPrediction } from '../../utils/shiftPredictor';
import { formatNumber } from '../../utils/ui';
import { UK_TZ } from '../../utils/ukDate';
import { getEnergyQuantityLabel, getVehicleEnergyExpenseLabel, getVehicleEnergyQuantityUnit } from '../../utils/vehicleFuel';
import {
  formatCurrency,
  getNumericInputProps,
  inputClasses,
  primaryButtonClasses,
  secondaryButtonClasses,
  sheetBackdropClasses,
  sheetPanelClasses,
} from '../../utils/ui';

type EndSheetMode = 'active' | 'manual';
type FuelChoice = 'yes' | 'no';

type ProviderDraftRow = {
  id: string;
  provider: string;
  revenue: string;
  jobCount: string;
};

type EndShiftDraft = {
  providers: ProviderDraftRow[];
  endOdometerValue: string;
  fuelChoice: FuelChoice;
  fuelAmountValue: string;
  fuelLitersValue: string;
  notesValue: string;
  extraExpenseAmountValue: string;
  extraExpenseDescriptionValue: string;
  optionalExpanded: boolean;
};

type QuickAddFormProps = {
  showStartSheet: boolean;
  showEndSheet: boolean;
  endingShift: boolean;
  providerOptions: string[];
  startProvider: string;
  onStartProviderChange: (value: string) => void;
  startOdometer: string;
  onStartOdometerChange: (value: string) => void;
  storedLastEndOdometer: number | null;
  activePrediction: ShiftPrediction;
  onCloseStartSheet: () => void;
  onStartSession: () => void;
  onCloseEndSheet: () => void;
  endSheetMode: EndSheetMode;
  activeDurationHours: number;
  manualShiftDate: string;
  manualPrediction: ShiftPrediction;
  manualProviderOptions: string[];
  endShiftProviderOptions: string[];
  manualProvider: string;
  onManualProviderChange: (value: string) => void;
  manualHoursWorked: string;
  onManualHoursWorkedChange: (value: string) => void;
  endShiftDraft: EndShiftDraft;
  onUpdateEndShiftDraft: (patch: Partial<EndShiftDraft>) => void;
  onSaveShift: (options?: { markedNoEarnings?: boolean }) => void;
  activeSessionEstimatedRevenue: ShiftPrediction;
  settings: Settings;
};

const pillButtonClass = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
    active ? 'bg-brand text-white' : 'border border-surface-border bg-surface-raised text-slate-300'
  }`;

const getProviderRevenueTotal = (providers: ProviderDraftRow[]) =>
  providers.reduce((sum, row) => {
    if (!row.revenue.trim()) {
      return sum;
    }

    const value = Number.parseFloat(row.revenue);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

export const QuickAddForm: React.FC<QuickAddFormProps> = ({
  showStartSheet,
  showEndSheet,
  endingShift,
  providerOptions,
  startProvider,
  onStartProviderChange,
  startOdometer,
  onStartOdometerChange,
  storedLastEndOdometer,
  activePrediction,
  onCloseStartSheet,
  onStartSession,
  onCloseEndSheet,
  endSheetMode,
  activeDurationHours,
  manualShiftDate,
  manualPrediction,
  manualProviderOptions,
  endShiftProviderOptions,
  manualProvider,
  onManualProviderChange,
  manualHoursWorked,
  onManualHoursWorkedChange,
  endShiftDraft,
  onUpdateEndShiftDraft,
  onSaveShift,
  activeSessionEstimatedRevenue,
  settings,
}) => {
  const [showZeroEarningsWarning, setShowZeroEarningsWarning] = React.useState(false);
  const [manualHoursError, setManualHoursError] = React.useState<string | null>(null);

  const totalEarnings = getProviderRevenueTotal(endShiftDraft.providers);
  const energyExpenseLabel = getVehicleEnergyExpenseLabel(settings);
  const energyQuantityUnit = getVehicleEnergyQuantityUnit(settings);
  const energyQuantityLabel = getEnergyQuantityLabel(energyQuantityUnit);

  React.useEffect(() => {
    if (!showEndSheet) {
      setShowZeroEarningsWarning(false);
      setManualHoursError(null);
    }
  }, [showEndSheet]);

  React.useEffect(() => {
    if (totalEarnings > 0) {
      setShowZeroEarningsWarning(false);
    }
  }, [totalEarnings]);

  const handleSaveShift = () => {
    const manualHoursValue = Number.parseFloat(manualHoursWorked || '0');
    if (endSheetMode === 'manual' && (!Number.isFinite(manualHoursValue) || manualHoursValue <= 0)) {
      setManualHoursError('Required: enter a value greater than 0');
      return;
    }

    setManualHoursError(null);

    if (totalEarnings === 0 && !showZeroEarningsWarning) {
      setShowZeroEarningsWarning(true);
      return;
    }

    onSaveShift({ markedNoEarnings: totalEarnings === 0 });
  };

  return (
    <>
      {showStartSheet && (
        <div className={sheetBackdropClasses} onClick={onCloseStartSheet}>
          <div className={sheetPanelClasses} onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Start shift</p>
              <p className="mt-2 text-lg font-semibold text-white">Add the odometer if you want mileage to auto-carry through the end sheet.</p>
              {activePrediction.estimatedHours > 0 && (
                <p className="mt-2 text-sm text-emerald-100/80">Avg for today: ~{formatNumber(activePrediction.estimatedHours, 1)} hrs</p>
              )}
            </div>

            <div className="mt-5">
              <label htmlFor="start-provider" className="block text-sm font-medium text-slate-300">
                Provider
              </label>
              <select
                id="start-provider"
                value={startProvider}
                onChange={(event) => onStartProviderChange(event.target.value)}
                className={`${inputClasses} mt-2`}
              >
                {providerOptions.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5">
              <label htmlFor="start-odometer" className="block text-sm font-medium text-slate-300">
                Start odometer <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="start-odometer"
                {...getNumericInputProps()}
                autoFocus
                value={startOdometer}
                onChange={(event) => onStartOdometerChange(event.target.value)}
                placeholder="Enter miles on the dash"
                className={`${inputClasses} mt-2`}
              />
              {storedLastEndOdometer != null && (
                <p className="mt-2 text-xs text-slate-400">Picked up from your last end odometer.</p>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={onCloseStartSheet} className={`${secondaryButtonClasses} flex-1 justify-center`}>
                Cancel
              </button>
              <button type="button" onClick={onStartSession} className={`${primaryButtonClasses} flex-1 justify-center`}>
                Start shift
              </button>
            </div>
          </div>
        </div>
      )}

      {showEndSheet && (
        <div className={sheetBackdropClasses} onClick={onCloseEndSheet}>
          <div className={sheetPanelClasses} data-testid="end-shift-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {endSheetMode === 'active' ? 'End your shift' : 'Quick add shift'}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {endSheetMode === 'active'
                ? `${formatNumber(activeDurationHours, 2)}h logged so far`
                : new Date(`${manualShiftDate}T12:00:00Z`).toLocaleDateString('en-GB', {
                    timeZone: UK_TZ,
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })}
            </h2>
            {endSheetMode === 'manual' && (
              <p className="mt-2 text-sm text-slate-400">
                Smart pre-fill is using your usual pattern for this day. Adjust anything before you save.
              </p>
            )}
            {(endSheetMode === 'active' ? activeSessionEstimatedRevenue : manualPrediction).confidence === 'high' && (
              <p className="mt-2 text-sm text-cyan-200">
                Your recent average for this day: {formatCurrency((endSheetMode === 'active' ? activeSessionEstimatedRevenue : manualPrediction).estimatedRevenueMin)}-{formatCurrency((endSheetMode === 'active' ? activeSessionEstimatedRevenue : manualPrediction).estimatedRevenueMax)}
              </p>
            )}

          <div className="mt-5 space-y-4">
            {endSheetMode === 'manual' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="manual-provider" className="block text-sm font-medium text-slate-300">
                    Provider
                  </label>
                  <select
                    id="manual-provider"
                    value={manualProvider}
                    onChange={(event) => onManualProviderChange(event.target.value)}
                    className={`${inputClasses} mt-2`}
                  >
                    {manualProviderOptions.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="manual-hours" className="block text-sm font-medium text-slate-300">
                    Hours
                  </label>
                  <input
                    id="manual-hours"
                    {...getNumericInputProps()}
                    value={manualHoursWorked}
                    onChange={(event) => onManualHoursWorkedChange(event.target.value)}
                    placeholder={manualPrediction.estimatedHours > 0 ? String(manualPrediction.estimatedHours) : '0.0'}
                    className={`${inputClasses} mt-2`}
                  />
                  {manualPrediction.estimatedHours > 0 && (
                    <p className="mt-2 text-xs text-slate-400">Typical for this day: ~{formatNumber(manualPrediction.estimatedHours, 1)} hrs</p>
                  )}
                  {manualHoursError && (
                    <p className="mt-1 text-xs text-red-400">{manualHoursError}</p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300">Earnings by platform</label>
              <div className="mt-2 space-y-2">
                {endShiftDraft.providers.map((row, index) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <select
                      value={row.provider}
                      onChange={(event) => {
                        const updated = endShiftDraft.providers.map((p) =>
                          p.id === row.id ? { ...p, provider: event.target.value } : p
                        );
                        onUpdateEndShiftDraft({ providers: updated });
                      }}
                      className={`${inputClasses} flex-1`}
                    >
                      {endShiftProviderOptions.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      {...getNumericInputProps()}
                      autoFocus={index === 0}
                      aria-label={index === 0 ? 'Earnings' : `Platform ${index + 1} earnings`}
                      value={row.revenue}
                      onChange={(event) => {
                        const updated = endShiftDraft.providers.map((p) =>
                          p.id === row.id ? { ...p, revenue: event.target.value } : p
                        );
                        onUpdateEndShiftDraft({ providers: updated });
                      }}
                      placeholder={index === 0 ? `e.g. ${formatCurrency(Math.round((endSheetMode === 'active' ? activeSessionEstimatedRevenue : manualPrediction).estimatedRevenueAvg))}` : '£0.00'}
                      className={`${inputClasses} w-28`}
                    />
                    {endShiftDraft.providers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onUpdateEndShiftDraft({ providers: endShiftDraft.providers.filter((p) => p.id !== row.id) })}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        aria-label="Remove platform"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateEndShiftDraft({
                    providers: [
                      ...endShiftDraft.providers,
                      { id: Date.now().toString(), provider: endShiftProviderOptions[1] ?? endShiftProviderOptions[0] ?? 'Work Day', revenue: '', jobCount: '' },
                    ],
                  })
                }
                className="mt-2 text-xs text-brand hover:underline"
              >
                + Add platform
              </button>
            </div>
            <div>
              <label htmlFor="end-shift-odometer" className="block text-sm font-medium text-slate-300">
                End odometer
              </label>
              <input
                id="end-shift-odometer"
                {...getNumericInputProps()}
                value={endShiftDraft.endOdometerValue}
                onChange={(event) => onUpdateEndShiftDraft({ endOdometerValue: event.target.value })}
                placeholder="Optional if you don't have the dash number"
                className={`${inputClasses} mt-2`}
              />
            </div>

            <div>
              <p className="block text-sm font-medium text-slate-300">{energyExpenseLabel} today?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onUpdateEndShiftDraft({ fuelChoice: 'yes' })} className={pillButtonClass(endShiftDraft.fuelChoice === 'yes')}>
                  Yes
                </button>
                <button type="button" onClick={() => onUpdateEndShiftDraft({ fuelChoice: 'no', fuelAmountValue: '', fuelLitersValue: '' })} className={pillButtonClass(endShiftDraft.fuelChoice === 'no')}>
                  No
                </button>
              </div>
              {endShiftDraft.fuelChoice === 'yes' && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="fuel-amount" className="block text-sm font-medium text-slate-300">
                      {energyExpenseLabel} amount
                    </label>
                    <input
                      id="fuel-amount"
                      {...getNumericInputProps()}
                      value={endShiftDraft.fuelAmountValue}
                      onChange={(event) => onUpdateEndShiftDraft({ fuelAmountValue: event.target.value })}
                      className={`${inputClasses} mt-2`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="fuel-litres" className="block text-sm font-medium text-slate-300">
                      {energyQuantityLabel}
                    </label>
                    <input
                      id="fuel-litres"
                      {...getNumericInputProps()}
                      value={endShiftDraft.fuelLitersValue}
                      onChange={(event) => onUpdateEndShiftDraft({ fuelLitersValue: event.target.value })}
                      className={`${inputClasses} mt-2`}
                      placeholder="0.0"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onUpdateEndShiftDraft({ optionalExpanded: !endShiftDraft.optionalExpanded })}
              className="flex w-full items-center justify-between rounded-2xl border border-surface-border bg-surface-raised px-4 py-3 text-left text-sm text-slate-200"
            >
              <span>Optional fields: notes and extra expense</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${endShiftDraft.optionalExpanded ? 'rotate-180' : ''}`} />
            </button>

            {endShiftDraft.optionalExpanded && (
              <div className="space-y-4 rounded-2xl border border-surface-border bg-surface-raised p-4">
                <div>
                  <label htmlFor="end-shift-notes" className="block text-sm font-medium text-slate-300">
                    Notes
                  </label>
                  <input
                    id="end-shift-notes"
                    type="text"
                    value={endShiftDraft.notesValue}
                    onChange={(event) => onUpdateEndShiftDraft({ notesValue: event.target.value })}
                    className={`${inputClasses} mt-2`}
                    placeholder="Anything useful about this shift"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="extra-expense-amount" className="block text-sm font-medium text-slate-300">
                      Add expense
                    </label>
                    <input
                      id="extra-expense-amount"
                      {...getNumericInputProps()}
                      value={endShiftDraft.extraExpenseAmountValue}
                      onChange={(event) => onUpdateEndShiftDraft({ extraExpenseAmountValue: event.target.value })}
                      className={`${inputClasses} mt-2`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="extra-expense-description" className="block text-sm font-medium text-slate-300">
                      Description
                    </label>
                    <input
                      id="extra-expense-description"
                      type="text"
                      value={endShiftDraft.extraExpenseDescriptionValue}
                      onChange={(event) => onUpdateEndShiftDraft({ extraExpenseDescriptionValue: event.target.value })}
                      className={`${inputClasses} mt-2`}
                      placeholder="Parking, wash, tolls"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total earnings</span>
                <span className="font-medium text-white">{formatCurrency(totalEarnings)}</span>
              </div>
              {showZeroEarningsWarning && totalEarnings === 0 && (
                <p className="mt-2 text-sm text-brand">No earnings entered - are you sure?</p>
              )}
              <div className="mt-3 flex gap-3">
                <button type="button" onClick={onCloseEndSheet} className={`${secondaryButtonClasses} flex-1 justify-center`}>
                  Cancel
                </button>
                <button type="button" onClick={handleSaveShift} className={`${primaryButtonClasses} flex-1 justify-center`}>
                  Save shift
                </button>
              </div>
            </div>
          </div>
        </div>
    )}

    {endingShift && (
      <div className={sheetBackdropClasses}>
        <div className={`${sheetPanelClasses} text-center`}>
          <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-300" />
          <p className="mt-4 text-lg font-semibold text-white">Saving your shift</p>
          <p className="mt-2 text-sm text-slate-400">Pulling together the summary card and weekly progress.</p>
        </div>
      </div>
    )}
    </>
  );
};
