import React from 'react';
import { Sparkles, TrendingUp, AlertTriangle, Repeat, Flame } from 'lucide-react';
import { primaryButtonClasses } from '../../utils/ui';

export type StoryType = 'recentShift' | 'prediction' | 'missedDay' | 'recurring' | 'habit' | 'welcome';

export interface StoryCardProps {
  type: StoryType;
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}

const gradientMap: Record<StoryType, string> = {
  recentShift: 'bg-gradient-to-br from-indigo-500/20 to-purple-500/10',
  prediction: 'bg-gradient-to-br from-amber-500/20 to-orange-500/10',
  missedDay: 'bg-gradient-to-br from-rose-500/20 to-red-500/10',
  recurring: 'bg-gradient-to-br from-sky-500/20 to-cyan-500/10',
  habit: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10',
  welcome: 'bg-gradient-to-br from-brand/20 to-accent/10',
};

const iconMap: Record<StoryType, React.ReactNode> = {
  recentShift: <TrendingUp className="h-4 w-4 text-indigo-300" />,
  prediction: <Sparkles className="h-4 w-4 text-amber-300" />,
  missedDay: <AlertTriangle className="h-4 w-4 text-rose-300" />,
  recurring: <Repeat className="h-4 w-4 text-sky-300" />,
  habit: <Flame className="h-4 w-4 text-emerald-300" />,
  welcome: <Sparkles className="h-4 w-4 text-brand" />,
};

export const StoryCard: React.FC<StoryCardProps> = ({ type, title, body, cta, onCta }) => {
  return (
    <div
      className={`relative flex h-40 w-64 shrink-0 flex-col justify-between rounded-2xl border border-white/5 p-4 ${gradientMap[type]}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{title}</p>
        <div className="rounded-lg bg-white/5 p-1.5">{iconMap[type]}</div>
      </div>

      <div>
        <p className="line-clamp-2 text-sm text-white/70">{body}</p>
        <button
          type="button"
          onClick={onCta}
          className={`${primaryButtonClasses} mt-2 w-full justify-center px-3 py-2 text-xs`}
        >
          {cta}
        </button>
      </div>
    </div>
  );
};
