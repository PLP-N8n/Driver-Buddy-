import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../utils/animations';

export interface AnimateInViewProps {
  children: React.ReactNode;
  delay?: '0ms' | '50ms' | '100ms' | '150ms';
  className?: string;
}

const delayClassMap: Record<string, string> = {
  '0ms': '',
  '50ms': 'animate-fade-up-delay-1',
  '100ms': 'animate-fade-up-delay-2',
  '150ms': 'animate-fade-up-delay-3',
};

export const AnimateInView: React.FC<AnimateInViewProps> = ({ children, delay = '0ms', className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reducedMotion]);

  const animationClass = reducedMotion || visible ? `animate-fade-up ${delayClassMap[delay] || ''}`.trim() : 'opacity-0';

  return (
    <div ref={ref} className={`${animationClass} ${className}`.trim()}>
      {children}
    </div>
  );
};
