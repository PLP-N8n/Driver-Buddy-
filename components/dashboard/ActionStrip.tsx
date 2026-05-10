import React from 'react';
import { Clock3 } from 'lucide-react';
import { primaryButtonClasses, secondaryButtonClasses } from '../../utils/ui';

export interface ActionStripProps {
  activeSession: { startedAt: string } | null;
  activeDurationHours: number;
  hasAnyLoggedShifts: boolean;
  backupCode?: string;
  onStartShift: () => void;
  onEndShift: () => void;
  onQuickAddRevenue: () => void;
  onAddShift: () => void;
  onRestoreFromBackupCode?: (code: string) => void;
}

export const ActionStrip: React.FC<ActionStripProps> = ({
  activeSession,
  activeDurationHours,
  hasAnyLoggedShifts,
  backupCode,
  onStartShift,
  onEndShift,
  onQuickAddRevenue,
  onAddShift,
  onRestoreFromBackupCode,
}) => {
  if (activeSession) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-surface-border bg-surface-raised p-3">
        <div className="flex items-center gap-2 rounded-full border border-positive/30 bg-positive-muted px-3 py-2 text-xs font-semibold text-positive">
          <Clock3 className="h-3.5 w-3.5" />
          {activeDurationHours.toFixed(2)}h live
        </div>
        <div className="flex flex-1 items-center gap-2">
          <button type="button" onClick={onQuickAddRevenue} className={`${secondaryButtonClasses} flex-1 justify-center px-3 py-2 text-xs`}>
            + £10 quick add
          </button>
          <button type="button" onClick={onEndShift} className={`${primaryButtonClasses} flex-1 justify-center px-3 py-2 text-xs`}>
            End shift
          </button>
        </div>
      </div>
    );
  }

  if (!hasAnyLoggedShifts) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onAddShift} className={`${primaryButtonClasses} w-full justify-center`}>
          Log your first shift
        </button>
        {backupCode && onRestoreFromBackupCode && (
          <button type="button" onClick={() => onRestoreFromBackupCode(backupCode)} className={`${secondaryButtonClasses} w-full justify-center`}>
            Restore from cloud
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onStartShift} className={`${primaryButtonClasses} justify-center`}>
        Start Shift
      </button>
      <button type="button" onClick={onAddShift} className={`${secondaryButtonClasses} justify-center`}>
        Add shift
      </button>
    </div>
  );
};
