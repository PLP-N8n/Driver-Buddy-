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
  const isActiveRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  // Keep callback ref fresh without triggering effect re-runs
  onRefreshRef.current = onRefresh;

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
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isActiveRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const rawDelta = touch.clientY - startYRef.current;
      if (rawDelta < 0) {
        isActiveRef.current = false;
        pullDistanceRef.current = 0;
        setPullState('idle');
        setPullDistance(0);
        return;
      }

      const resisted = Math.min(rawDelta * RESISTANCE, MAX_PULL);
      pullDistanceRef.current = resisted;
      setPullDistance(resisted);
      setPullState(resisted >= PULL_THRESHOLD ? 'ready' : 'pulling');

      if (resisted > 0 && isAtTop()) {
        e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      if (!isActiveRef.current) return;
      isActiveRef.current = false;

      if (pullDistanceRef.current >= PULL_THRESHOLD) {
        setPullState('refreshing');
        setPullDistance(PULL_THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          pullDistanceRef.current = 0;
          setPullState('idle');
          setPullDistance(0);
        }
      } else {
        pullDistanceRef.current = 0;
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
  }, [isAtTop]);

  return { pullState, pullDistance, containerRef };
}
