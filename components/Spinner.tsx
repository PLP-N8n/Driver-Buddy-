import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-[3px]',
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={`${sizeClasses[size]} animate-spin rounded-full border-surface-border border-t-brand ${className}`}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};
