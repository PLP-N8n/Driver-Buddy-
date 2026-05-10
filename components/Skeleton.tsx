import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card' | 'chart' | 'list';
  shimmer?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  shimmer = false,
}) => {
  const variantClasses = {
    text: 'h-4 rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-2xl',
    card: 'h-32 rounded-2xl',
    chart: 'h-40 rounded-2xl',
    list: 'h-16 rounded-2xl',
  };

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-surface-raised/80 ${variantClasses[variant]} ${shimmer ? 'relative overflow-hidden' : ''} ${className}`}
    >
      {shimmer && <div className="absolute inset-0 animate-shimmer" />}
    </div>
  );
};
