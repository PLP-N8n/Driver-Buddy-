import React, { useState } from 'react';
import { triggerHaptic } from '../../utils/haptics';
import { primaryButtonClasses, secondaryButtonClasses, sheetBackdropClasses, inputClasses } from '../../utils/ui';
import type { ShiftPrediction } from '../../utils/shiftPredictor';

export interface DriveModeSheetProps {
  show: boolean;
  prediction: ShiftPrediction;
  onClose: () => void;
  onSave: (payload: { revenue: number; provider: string; endOdometer?: number }) => void;
}

export const DriveModeSheet: React.FC<DriveModeSheetProps> = ({ show, prediction, onClose, onSave }) => {
  const [revenue, setRevenue] = useState('');
  if (!show) return null;

  const estimatedEndOdometer = prediction?.startOdometer != null && prediction?.estimatedMiles != null
    ? prediction.startOdometer + prediction.estimatedMiles
    : undefined;

  const handleSave = () => {
    triggerHaptic('medium');
    const parsed = Number.parseFloat(revenue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave({
      revenue: parsed,
      provider: prediction?.provider || 'Work Day',
      endOdometer: estimatedEndOdometer,
    });
  };

  return (
    <div className={sheetBackdropClasses} onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0 max-h-[calc(100vh-64px)] overflow-y-auto rounded-t-3xl border border-surface-border bg-surface px-6 pt-6 pb-sheet shadow-2xl animate-sheet-in" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Drive Mode</p>
        <p className="mt-2 text-lg font-semibold text-white">{prediction?.provider || 'Work Day'}</p>

        <div className="mt-6">
          <label className="block text-sm font-medium text-slate-300">Revenue</label>
          <input
            inputMode="decimal"
            type="text"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder={prediction?.estimatedRevenueAvg ? String(Math.round(prediction.estimatedRevenueAvg)) : '0.00'}
            className={`${inputClasses} mt-2 text-center text-3xl font-mono font-bold`}
            autoFocus
          />
        </div>

        {estimatedEndOdometer != null && (
          <p className="mt-3 text-xs text-slate-500">End odometer: {estimatedEndOdometer} mi</p>
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => { triggerHaptic('light'); onClose(); }} className={`${secondaryButtonClasses} flex-1 justify-center h-14 text-lg`}>Cancel</button>
          <button type="button" onClick={handleSave} className={`${primaryButtonClasses} flex-1 justify-center h-14 text-lg`}>Save shift</button>
        </div>
      </div>
    </div>
  );
};
