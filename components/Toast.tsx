import React, { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
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
  duration = 3000,
  onClose,
}) => {
  const [exiting, setExiting] = React.useState(false);
  const { component: IconComponent, color: iconColor } = toastIcons[type];

  useEffect(() => {
    const exitTimer = window.setTimeout(() => setExiting(true), duration - 200);
    const closeTimer = window.setTimeout(onClose, duration);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(closeTimer);
    };
  }, [duration, onClose]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/30 backdrop-blur-xl ${exiting ? 'animate-toast-out' : 'animate-toast-in'} ${toneClasses[type]}`}
    >
      <div className="flex items-center gap-3">
        <IconComponent className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span>{message}</span>
      </div>
    </div>
  );
};
