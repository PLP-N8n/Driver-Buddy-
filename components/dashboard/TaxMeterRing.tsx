import React, { useEffect, useRef, useState } from 'react';

export interface TaxMeterRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clampPercent = (percent: number) => Math.min(100, Math.max(0, percent));
let gradientIdSeed = 0;

export const TaxMeterRing: React.FC<TaxMeterRingProps> = ({
  percent,
  size = 120,
  strokeWidth = 8,
}) => {
  const gradientId = useRef(`tax-ring-gradient-${++gradientIdSeed}`).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference * (1 - clampPercent(percent) / 100);
  const [offset, setOffset] = useState(prefersReducedMotion() ? targetOffset : circumference);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion() || hasAnimated.current) {
      setOffset(targetOffset);
      return;
    }

    if (typeof requestAnimationFrame === 'undefined') {
      setOffset(targetOffset);
      hasAnimated.current = true;
      return;
    }

    hasAnimated.current = true;

    const startTime = performance.now();
    const duration = 700;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setOffset(circumference - (circumference - targetOffset) * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [circumference, targetOffset]);

  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
      />
      <circle
        className="tax-meter-foreground"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: prefersReducedMotion() ? 'none' : 'stroke-dashoffset 700ms ease-out' }}
      />
    </svg>
  );
};
