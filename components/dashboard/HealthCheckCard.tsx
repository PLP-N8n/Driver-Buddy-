import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DailyWorkLog, Expense, Settings, Trip } from '../../types';
import { buildHealthCheck, type HealthStatus } from '../../utils/healthCheck';
import { panelClasses } from '../../utils/ui';

type HealthCheckCardProps = {
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
  today: string;
};

const statusStyles: Record<Exclude<HealthStatus, 'good'>, {
  border: string;
  icon: string;
  label: string;
}> = {
  attention: {
    border: 'border-l-amber-400',
    icon: 'text-amber-300',
    label: 'Health check',
  },
  warning: {
    border: 'border-l-red-400',
    icon: 'text-red-300',
    label: 'Health check',
  },
};

export const HealthCheckCard: React.FC<HealthCheckCardProps> = ({
  logs,
  trips,
  expenses,
  settings,
  today,
}) => {
  const healthCheck = useMemo(
    () => buildHealthCheck(logs, trips, expenses, settings, today),
    [expenses, logs, settings, today, trips]
  );

  if (healthCheck.status === 'good' && healthCheck.details.length === 0) {
    return (
      <div className="flex">
        <div
          data-testid="health-check-pill"
          className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-positive/30 bg-positive-muted px-3 py-2 text-xs font-semibold text-positive"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>All good this week</span>
        </div>
      </div>
    );
  }

  const visibleStatus: Exclude<HealthStatus, 'good'> = healthCheck.status === 'warning' ? 'warning' : 'attention';
  const styles = statusStyles[visibleStatus];

  return (
    <section
      data-testid="health-check-card"
      className={`${panelClasses} border-l-4 ${styles.border} p-5`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${styles.icon}`} />
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${styles.icon}`}>{styles.label}</p>
          <p className="mt-2 text-base font-semibold text-white">{healthCheck.summary}</p>
          {healthCheck.details.length > 0 && (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
              {healthCheck.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
