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
  const hasAnimated = useRef(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  const format = (num: number) =>
    new Intl.NumberFormat('en-GB', {
      maximumFractionDigits: decimals,
    }).format(num);

  useEffect(() => {
    if (prefersReducedMotion() || hasAnimated.current) return;

    const el = elementRef.current;
    if (!el) return;

    const runAnimation = () => {
      if (hasAnimated.current) return;
      hasAnimated.current = true;

      const startTime = performance.now();
      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutQuart(progress);
        setDisplayValue(value * eased);
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    };

    if (typeof IntersectionObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') {
      setDisplayValue(value);
      hasAnimated.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (!entry.isIntersecting || hasAnimated.current) return;
        runAnimation();
        observer.disconnect();
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={elementRef} className={className}>
      {prefix}{format(displayValue)}{suffix}
    </span>
  );
};
