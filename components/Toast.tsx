import React, { useEffect } from 'react';

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

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  duration = 3000,
  onClose,
}) => {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/30 backdrop-blur-xl animate-toast-in ${toneClasses[type]}`}
    >
      {message}
    </div>
  );
};
