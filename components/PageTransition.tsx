import React from 'react';
import { useReducedMotion } from '../utils/animations';

export interface PageTransitionProps {
  children: React.ReactNode;
  activeKey: string;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children, activeKey }) => {
  const reducedMotion = useReducedMotion();

  return (
    <div
      key={activeKey}
      className={reducedMotion ? '' : 'animate-page-in'}
      style={reducedMotion ? undefined : { animationDuration: '200ms' }}
    >
      {children}
    </div>
  );
};
