import { useCallback, useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD = 80; // px to trigger refresh
const MAX_PULL = 140; // max visual stretch
const RESISTANCE = 0.55; // touch resistance factor

export type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing';

interface UsePullToRefreshResult {
  pullState: PullState;
  pullDistance: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function usePullToRefresh(onRefresh: () => void | Promise<void>): UsePullToRefreshResult {
  const [pullState, setPullState] = useState<PullState>('idle');
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isActiveRef = useRef(false);

  const isAtTop = useCallback(() => {
    const el = containerRef.current;
    if (!el) return false;
    return el.scrollTop <= 1;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (!isAtTop()) return;
      const touch = e.touches[0];
      if (!touch) return;
      isActiveRef.current = true;
      startYRef.current = touch.clientY;
      currentYRef.current = startYRef.current;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isActiveRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const y = touch.clientY;
      const rawDelta = y - startYRef.current;
      if (rawDelta < 0) {
        isActiveRef.current = false;
        setPullState('idle');
        setPullDistance(0);
        return;
      }

      const resisted = Math.min(rawDelta * RESISTANCE, MAX_PULL);
      currentYRef.current = y;
      setPullDistance(resisted);
      setPullState(resisted >= PULL_THRESHOLD ? 'ready' : 'pulling');

      // Prevent default scroll only when we're actively pulling
      if (resisted > 0 && isAtTop()) {
        e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      if (!isActiveRef.current) return;
      isActiveRef.current = false;

      if (pullDistance >= PULL_THRESHOLD) {
        setPullState('refreshing');
        setPullDistance(PULL_THRESHOLD);
        try {
          await onRefresh();
        } finally {
          setPullState('idle');
          setPullDistance(0);
        }
      } else {
        setPullState('idle');
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [isAtTop, onRefresh, pullDistance]);

  return { pullState, pullDistance, containerRef };
}
