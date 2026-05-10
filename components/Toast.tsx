import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  index?: number;
  onClose: () => void;
}

const toneClasses: Record<ToastProps['type'], string> = {
  success: 'border-green-500/30 bg-green-500/15 text-green-200',
  error: 'border-red-500/30 bg-red-500/15 text-red-200',
  info: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100',
  warning: 'border-amber-500/30 bg-amber-500/15 text-amber-100',
};

const toastIcons: Record<ToastProps['type'], { component: LucideIcon; color: string }> = {
  success: { component: CheckCircle2, color: 'text-green-300' },
  error: { component: AlertCircle, color: 'text-red-300' },
  info: { component: Info, color: 'text-cyan-300' },
  warning: { component: AlertTriangle, color: 'text-amber-300' },
};

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  duration = 4000,
  index = 0,
  onClose,
}) => {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const { component: IconComponent, color: iconColor } = toastIcons[type];

  useEffect(() => {
    const start = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct <= 0) {
        window.clearInterval(tick);
      }
    }, 50);

    const exitTimer = window.setTimeout(() => setExiting(true), duration - 200);
    const closeTimer = window.setTimeout(onClose, duration);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(exitTimer);
      window.clearTimeout(closeTimer);
    };
  }, [duration, onClose]);

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{ marginTop: index > 0 ? '0.5rem' : undefined }}
      className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/30 backdrop-blur-xl ${exiting ? 'animate-toast-out' : 'animate-toast-in'} ${toneClasses[type]}`}
    >
      <div className="flex items-center gap-3">
        <IconComponent className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span>{message}</span>
      </div>
      <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/30 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
