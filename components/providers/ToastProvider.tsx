import { useRef, useState } from 'react';
import type { ToastState } from '../../hooks/useAppState';
import { Toast } from '../Toast';
import { triggerHaptic } from '../../utils/haptics';

export type { ToastState };

export interface ToastProviderResult {
  showToast: (message: string, type?: ToastState['type'], duration?: number) => void;
  ToastContainer: React.ReactNode;
}

export function useToastProvider(): ToastProviderResult {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const counterRef = useRef(0);

  const showToast = (message: string, type: ToastState['type'] = 'success', duration = 4000) => {
    counterRef.current += 1;
    const id = counterRef.current;
    triggerHaptic('light');
    setToasts((current) => [...current, { id, message, type, duration }]);
  };

  const removeToast = (id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  const ToastContainer = toasts.length > 0 ? (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          index={index}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  ) : null;

  return { showToast, ToastContainer };
}
