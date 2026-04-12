import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';

const DISMISSED_KEY = 'drivertax_setup_dismissed';

interface SetupReminderBannerProps {
  onOpenSetup: () => void;
}

export const SetupReminderBanner: React.FC<SetupReminderBannerProps> = ({ onOpenSetup }) => {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1'
  );

  if (dismissed || localStorage.getItem('drivertax_onboarded') === '1') return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-3">
      <Sparkles className="h-4 w-4 shrink-0 text-brand" />
      <p className="flex-1 text-sm text-slate-300">
        Complete your setup to get personalised tax estimates and mileage defaults.
      </p>
      <button
        type="button"
        onClick={onOpenSetup}
        className="shrink-0 text-sm font-medium text-brand transition-colors hover:text-brand-hover"
      >
        Set up
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss setup reminder"
        className="shrink-0 text-slate-500 transition-colors hover:text-slate-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
