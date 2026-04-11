import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Target } from 'lucide-react';
import type { HabitState } from '../../utils/habitEngine';
import { formatCurrency, panelClasses } from '../../utils/ui';

const SEEN_MILESTONES_KEY = 'dbt_milestones_seen';

interface HabitCardProps {
  state: HabitState;
}

const getSeenMilestones = () => {
  try {
    const value = localStorage.getItem(SEEN_MILESTONES_KEY);
    if (!value) return new Set<string>();

    const parsed = JSON.parse(value) as string[];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
};

export const HabitCard: React.FC<HabitCardProps> = ({ state: habitState }) => {
  const [visibleMilestoneId, setVisibleMilestoneId] = useState<string | null>(null);
  const unseenMilestone = useMemo(() => {
    if (!habitState.milestone) return null;

    return getSeenMilestones().has(habitState.milestone.id) ? null : habitState.milestone;
  }, [habitState.milestone]);
  const remainingTarget = Math.max(0, habitState.weeklyTarget - habitState.weeklyRevenue);
  const showCard =
    habitState.currentStreak >= 3 ||
    Boolean(habitState.reengagementMessage) ||
    Boolean(unseenMilestone) ||
    habitState.weeklyProgress >= 0.9;

  useEffect(() => {
    if (!unseenMilestone) return;

    setVisibleMilestoneId(unseenMilestone.id);
    const seen = Array.from(new Set([...getSeenMilestones(), unseenMilestone.id]));
    localStorage.setItem(SEEN_MILESTONES_KEY, JSON.stringify(seen));
    const timeoutId = window.setTimeout(() => {
      setVisibleMilestoneId((current) => (current === unseenMilestone.id ? null : current));
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [unseenMilestone]);

  if (!showCard) {
    return null;
  }

  return (
    <section data-testid="habit-card" className={`${panelClasses} overflow-hidden p-4`}>
      <div className="flex flex-wrap items-start gap-3">
        {habitState.currentStreak >= 3 && (
          <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-200">
            {habitState.currentStreak}-day streak
          </span>
        )}

        {habitState.weeklyProgress >= 0.9 && remainingTarget > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm text-green-200">
            <Target className="h-4 w-4" />
            <span>Almost at your weekly target - {formatCurrency(remainingTarget)} to go</span>
          </div>
        )}
      </div>

      {habitState.reengagementMessage && (
        <p className="mt-3 rounded-2xl border border-slate-700/70 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
          {habitState.reengagementMessage}
        </p>
      )}

      {unseenMilestone && visibleMilestoneId === unseenMilestone.id && (
        <div
          data-testid="habit-milestone-toast"
          className="mt-3 rounded-2xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-slate-100"
        >
          <div className="flex items-center gap-2 font-semibold text-brand">
            <Sparkles className="h-4 w-4" />
            <span>{unseenMilestone.message}</span>
          </div>
          <p className="mt-1 text-slate-200">{unseenMilestone.detail}</p>
        </div>
      )}
    </section>
  );
};
