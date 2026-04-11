import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
}) => {
  const variantClasses = {
    text: 'h-4 rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-2xl',
  };

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-surface-raised/80 ${variantClasses[variant]} ${className}`}
    />
  );
};
