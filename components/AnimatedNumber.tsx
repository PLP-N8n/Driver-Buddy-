import React, { useEffect, useRef, useState } from 'react';

export interface AnimatedNumberProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 800,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState(prefersReducedMotion() ? value : 0);
  const animFrameRef = useRef(0);
  const elementRef = useRef<HTMLSpanElement>(null);

  const format = (num: number) =>
    new Intl.NumberFormat('en-GB', {
      maximumFractionDigits: decimals,
    }).format(num);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplayValue(value);
      return;
    }

    const el = elementRef.current;
    if (!el) return;

    const startValue = displayValue;

    const runAnimation = () => {
      cancelAnimationFrame(animFrameRef.current);

      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);
        setDisplayValue(startValue + (value - startValue) * eased);
        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate);
        }
      };
      animFrameRef.current = requestAnimationFrame(animate);
    };

    if (typeof IntersectionObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') {
      setDisplayValue(value);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (!entry.isIntersecting) return;
        runAnimation();
        observer.disconnect();
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [value, duration]);

  return (
    <span ref={elementRef} className={className}>
      {prefix}{format(displayValue)}{suffix}
    </span>
  );
};
