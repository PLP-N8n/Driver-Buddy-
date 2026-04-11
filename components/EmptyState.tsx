import React from 'react';
import { LucideIcon } from 'lucide-react';
import { primaryButtonClasses } from '../utils/ui';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-surface-border bg-surface-raised/40 px-6 py-16 text-center">
    <div className="mb-4 rounded-full bg-surface-raised p-4 text-slate-500">
      <Icon className="h-12 w-12" aria-hidden="true" />
    </div>
    <p className="text-base font-semibold text-slate-200">{title}</p>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p>
    {action && (
      <button type="button" onClick={action.onClick} className={`${primaryButtonClasses} mt-5`}>
        {action.label}
      </button>
    )}
  </div>
);
