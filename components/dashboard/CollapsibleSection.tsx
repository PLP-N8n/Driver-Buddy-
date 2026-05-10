import React, { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const panelId = useRef(`collapsible-${Math.random().toString(36).slice(2, 9)}`).current;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface/95 backdrop-blur-xl panel-shadow">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="sticky top-0 z-10 flex w-full items-center justify-between rounded-t-2xl bg-surface/95 px-5 py-4 text-left backdrop-blur-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ease-out ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        id={panelId}
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: expanded ? '2000px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
};
