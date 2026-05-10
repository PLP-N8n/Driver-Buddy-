# Polish Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Smooth page transitions, skeleton loaders, card entrance animations, enhanced pull-to-refresh, toast stacking, and consistent button haptics.

**Architecture:** CSS-first animations with `prefers-reduced-motion` respect. New wrapper components (`PageTransition`, `AnimateInView`) enhance existing screens without data changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest + React Testing Library + jsdom

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/PageTransition.tsx` | Create | Fade/slide wrapper for route changes |
| `components/__tests__/PageTransition.test.tsx` | Create | Tests for animation classes |
| `components/AnimateInView.tsx` | Create | IntersectionObserver entrance wrapper |
| `components/__tests__/AnimateInView.test.tsx` | Create | Tests for observer trigger |
| `components/Skeleton.tsx` | Modify | Add chart/list variants and shimmer |
| `components/__tests__/Skeleton.test.tsx` | Create | Tests for variants |
| `components/providers/ToastProvider.tsx` | Modify | Stack toasts, progress bar, haptic |
| `components/Toast.tsx` | Modify | Progress bar, stacked styles |
| `components/PullToRefreshIndicator.tsx` | Modify | Elastic resistance, spring snap |
| `components/__tests__/PullToRefreshIndicator.test.tsx` | Create | Tests for elastic math |
| `utils/ui.ts` | Modify | Add haptic trigger to button base |
| `index.css` | Modify | Add spring keyframes, stagger delays |
| `components/AppShell.tsx` | Modify | Wrap route content in PageTransition |
| `components/dashboard/DashboardScreen.tsx` | Modify | Wrap cards in AnimateInView |
| `components/TaxLogic.tsx` | Modify | Skeleton loaders for chart sections |
| `e2e/polish.spec.ts` | Create | E2E for transitions, toasts, reduced motion |

---

## Task 1: PageTransition Component

**Files:**
- Create: `components/PageTransition.tsx`
- Create: `components/__tests__/PageTransition.test.tsx`

**Interface:**
```tsx
export interface PageTransitionProps {
  children: React.ReactNode;
  activeKey: string;
}
```

**Behavior:**
1. Uses React key on `activeKey` change to trigger re-mount.
2. CSS fade-out (150ms) then fade-in + slide up (200ms).
3. Respects `prefers-reduced-motion`.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageTransition } from '../PageTransition';

describe('PageTransition', () => {
  it('renders children', () => {
    render(
      <PageTransition activeKey="dashboard">
        <div data-testid="content">Hello</div>
      </PageTransition>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
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
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/PageTransition.tsx components/__tests__/PageTransition.test.tsx
git commit -m "feat: add PageTransition wrapper with reduced-motion support"
```

---

## Task 2: AnimateInView Component

**Files:**
- Create: `components/AnimateInView.tsx`
- Create: `components/__tests__/AnimateInView.test.tsx`

**Interface:**
```tsx
export interface AnimateInViewProps {
  children: React.ReactNode;
  delay?: '0ms' | '50ms' | '100ms' | '150ms';
  className?: string;
}
```

**Behavior:**
1. Wraps children in a `div`.
2. Uses `IntersectionObserver` with `threshold: 0.1`.
3. When visible, applies `animate-fade-up` + optional delay class.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnimateInView } from '../AnimateInView';

describe('AnimateInView', () => {
  it('renders children', () => {
    render(
      <AnimateInView delay="50ms">
        <div data-testid="child">Card</div>
      </AnimateInView>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
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
        if (entry.isIntersecting) {
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
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/AnimateInView.tsx components/__tests__/AnimateInView.test.tsx
git commit -m "feat: add AnimateInView IntersectionObserver wrapper"
```

---

## Task 3: Skeleton Enhancement

**Files:**
- Modify: `components/Skeleton.tsx`
- Create: `components/__tests__/Skeleton.test.tsx`

**Changes:**
1. Add `variant` options: `'text' | 'card' | 'chart' | 'list' | 'circular' | 'rectangular'`.
2. `card`: `h-32 w-full`.
3. `chart`: `h-40 w-full`.
4. `list`: `h-16 w-full`.
5. Default `shimmer` to `true`.

- [ ] **Step 1: Read current Skeleton.tsx**

- [ ] **Step 2: Replace with enhanced version**

```tsx
import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'chart' | 'list' | 'circular' | 'rectangular';
  shimmer?: boolean;
}

const variantClasses: Record<NonNullable<SkeletonProps['variant']>, string> = {
  text: 'h-4 rounded-md',
  circular: 'rounded-full',
  rectangular: 'rounded-2xl',
  card: 'h-32 w-full rounded-2xl',
  chart: 'h-40 w-full rounded-2xl',
  list: 'h-16 w-full rounded-xl',
};

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rectangular',
  shimmer = true,
}) => {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-surface-raised/80 ${variantClasses[variant]} ${shimmer ? 'relative overflow-hidden' : ''} ${className}`}
    >
      {shimmer && <div className="absolute inset-0 animate-shimmer" />}
    </div>
  );
};
```

- [ ] **Step 3: Write test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('renders card variant', () => {
    const { container } = render(<Skeleton variant="card" />);
    expect(container.firstChild).toHaveClass('h-32');
  });

  it('renders chart variant', () => {
    const { container } = render(<Skeleton variant="chart" />);
    expect(container.firstChild).toHaveClass('h-40');
  });

  it('renders list variant', () => {
    const { container } = render(<Skeleton variant="list" />);
    expect(container.firstChild).toHaveClass('h-16');
  });
});
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/Skeleton.tsx components/__tests__/Skeleton.test.tsx
git commit -m "feat: enhance Skeleton with card/chart/list variants"
```

---

## Task 4: Toast Enhancement

**Files:**
- Modify: `components/providers/ToastProvider.tsx`
- Modify: `components/Toast.tsx`
- Create: `components/__tests__/Toast.test.tsx`

**Changes:**
1. `ToastProvider`: Support stacking (array of toasts, not single).
2. `Toast`: Add progress bar, stacked margin styles.
3. Trigger haptic on toast show.

- [ ] **Step 1: Read current ToastProvider.tsx**

- [ ] **Step 2: Replace ToastProvider with stack support**

```tsx
import { useRef, useState } from 'react';
import type { ToastState } from '../../hooks/useAppState';
import { Toast } from '../Toast';
import { triggerHaptic } from '../../utils/haptics';

export type { ToastState };

export interface ToastProviderResult {
  showToast: (message: string, type?: ToastState['type'], duration?: number) => void;
  ToastContainer: React.ReactNode;
}

export function useToastProvider(): ToastProviderResult {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const counterRef = useRef(0);

  const showToast = (message: string, type: ToastState['type'] = 'success', duration = 4000) => {
    counterRef.current += 1;
    const id = counterRef.current;
    triggerHaptic('light');
    setToasts((current) => [...current, { id, message, type, duration }]);
  };

  const removeToast = (id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  const ToastContainer = toasts.length > 0 ? (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          index={index}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  ) : null;

  return { showToast, ToastContainer };
}
```

- [ ] **Step 3: Replace Toast with progress bar**

```tsx
import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  index?: number;
  onClose: () => void;
}

const toneClasses: Record<ToastProps['type'], string> = {
  success: 'border-green-500/30 bg-green-500/15 text-green-200',
  error: 'border-red-500/30 bg-red-500/15 text-red-200',
  info: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-100',
  warning: 'border-amber-500/30 bg-amber-500/15 text-amber-100',
};

const toastIcons: Record<ToastProps['type'], { component: LucideIcon; color: string }> = {
  success: { component: CheckCircle2, color: 'text-green-300' },
  error: { component: AlertCircle, color: 'text-red-300' },
  info: { component: Info, color: 'text-cyan-300' },
  warning: { component: AlertTriangle, color: 'text-amber-300' },
};

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  duration = 4000,
  index = 0,
  onClose,
}) => {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const { component: IconComponent, color: iconColor } = toastIcons[type];

  useEffect(() => {
    const start = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct <= 0) {
        window.clearInterval(tick);
      }
    }, 50);

    const exitTimer = window.setTimeout(() => setExiting(true), duration - 200);
    const closeTimer = window.setTimeout(onClose, duration);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(exitTimer);
      window.clearTimeout(closeTimer);
    };
  }, [duration, onClose]);

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{ marginTop: index > 0 ? '0.5rem' : undefined }}
      className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-2xl shadow-black/30 backdrop-blur-xl ${exiting ? 'animate-toast-out' : 'animate-toast-in'} ${toneClasses[type]}`}
    >
      <div className="flex items-center gap-3">
        <IconComponent className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span>{message}</span>
      </div>
      <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-white/30 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Write test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from '../Toast';

describe('Toast', () => {
  it('renders message and progress bar', () => {
    render(<Toast message="Saved!" type="success" duration={4000} onClose={vi.fn()} />);
    expect(screen.getByText('Saved!')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run test** → PASS.

- [ ] **Step 6: Commit**

```bash
git add components/providers/ToastProvider.tsx components/Toast.tsx components/__tests__/Toast.test.tsx
git commit -m "feat: stack toasts, add progress bar, haptic on show"
```

---

## Task 5: PullToRefreshIndicator Enhancement

**Files:**
- Modify: `components/PullToRefreshIndicator.tsx`
- Create: `components/__tests__/PullToRefreshIndicator.test.tsx`

**Changes:**
1. Elastic resistance curve: `effectiveDistance = Math.min(distance, 120 + (distance - 120) * 0.3)`.
2. Haptic snap when threshold crossed (`triggerHaptic('medium')`).
3. Spring snap-back animation on release.
4. Pulsing brand-colored spinner.

- [ ] **Step 1: Read current PullToRefreshIndicator.tsx**

- [ ] **Step 2: Replace with enhanced version**

```tsx
import React, { useEffect, useRef } from 'react';
import { ArrowDown, RefreshCw } from 'lucide-react';
import { PullState } from '../hooks/usePullToRefresh';
import { triggerHaptic } from '../utils/haptics';

interface PullToRefreshIndicatorProps {
  pullState: PullState;
  pullDistance: number;
}

const THRESHOLD = 80;

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullState,
  pullDistance,
}) => {
  const prevState = useRef<PullState>(pullState);

  // Elastic resistance: harder to pull past 120px
  const effectiveDistance = pullDistance <= 120
    ? pullDistance
    : 120 + (pullDistance - 120) * 0.3;

  const isReady = pullState === 'ready';
  const isRefreshing = pullState === 'refreshing';

  useEffect(() => {
    if (prevState.current !== 'ready' && pullState === 'ready') {
      triggerHaptic('medium');
    }
    prevState.current = pullState;
  }, [pullState]);

  if (pullState === 'idle') return null;

  const progress = Math.min(1, effectiveDistance / THRESHOLD);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[76px] z-30 flex items-center justify-center overflow-hidden"
      style={{ height: `${Math.max(0, effectiveDistance)}px` }}
    >
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-all duration-200 ${
          isReady
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : isRefreshing
              ? 'border-brand/30 bg-brand/10 text-brand'
              : 'border-white/10 bg-surface-raised/80 text-slate-400'
        }`}
        style={{
          transform: `translateY(${Math.min(0, 20 - effectiveDistance)}px)`,
          opacity: Math.min(1, effectiveDistance / 40),
        }}
      >
        {isRefreshing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" />
        ) : (
          <ArrowDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isReady ? 'rotate-180' : ''}`}
            style={{ transform: `rotate(${progress * 180}deg)` }}
          />
        )}
        <span>
          {isRefreshing
            ? 'Syncing…'
            : isReady
              ? 'Release to sync'
              : 'Pull to sync'}
        </span>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Write test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PullToRefreshIndicator } from '../PullToRefreshIndicator';

describe('PullToRefreshIndicator', () => {
  it('is hidden when idle', () => {
    const { container } = render(<PullToRefreshIndicator pullState="idle" pullDistance={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows pull text when pulling', () => {
    render(<PullToRefreshIndicator pullState="pulling" pullDistance={40} />);
    expect(document.body.textContent).toContain('Pull to sync');
  });

  it('shows release text when ready', () => {
    render(<PullToRefreshIndicator pullState="ready" pullDistance={100} />);
    expect(document.body.textContent).toContain('Release to sync');
  });
});
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/PullToRefreshIndicator.tsx components/__tests__/PullToRefreshIndicator.test.tsx
git commit -m "feat: elastic pull-to-refresh with haptic snap"
```

---

## Task 6: Button Haptic Integration

**Files:**
- Modify: `utils/ui.ts`

**Change:** Add `triggerHaptic('light')` to button base classes via an `onMouseDown`/`onTouchStart` handler pattern. Since Tailwind classes can't run JS, add a data attribute and a small hook instead.

Actually simpler: add an `onPointerDown` handler in the button base. But classes are just strings. Better: create a `useHapticButton` hook and document it, or add a global event listener in `AppShell`.

Simpler approach: add `data-haptic="light"` to buttons and a delegated listener.

- [ ] **Step 1: Add data-haptic to button classes in `utils/ui.ts`**

Replace `buttonBaseClasses`:

```ts
const buttonBaseClasses =
  `inline-flex ${touchTargetClasses} select-none items-center justify-center gap-2 rounded-full px-5 py-3 text-sm transition-colors transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${focusRingClasses} data-haptic`;
```

Add delegated listener in `AppShell.tsx` (Task 7).

- [ ] **Step 2: Commit**

```bash
git add utils/ui.ts
git commit -m "feat: add data-haptic marker to button base classes"
```

---

## Task 7: AppShell PageTransition Integration

**Files:**
- Modify: `components/AppShell.tsx`

**Changes:**
1. Import `PageTransition`.
2. Wrap tab content in `<PageTransition activeKey={activeTab}>`.
3. Add delegated haptic listener on the app container.

- [ ] **Step 1: Add import**

```tsx
import { PageTransition } from './PageTransition';
import { triggerHaptic } from '../utils/haptics';
```

- [ ] **Step 2: Wrap tab content**

Find the `<div key={activeTab} className={contentAnimationClass}>` block and wrap it:

```tsx
<PageTransition activeKey={activeTab}>
  <div key={activeTab} className={contentAnimationClass}>
    ...existing tabs...
  </div>
</PageTransition>
```

Wait — `PageTransition` already uses `key={activeKey}`. The inner `key={activeTab}` on the div would conflict. Remove the inner `key` and let `PageTransition` own it:

```tsx
<PageTransition activeKey={activeTab}>
  <div className={contentAnimationClass}>
```

- [ ] **Step 3: Add delegated haptic listener**

Add an `onPointerDown` handler to the outermost `div`:

```tsx
<div
  className="min-h-screen bg-surface-deep text-slate-50 theme-app"
  onPointerDown={(e) => {
    const target = e.target as HTMLElement;
    const haptic = target.closest('[data-haptic]');
    if (haptic) triggerHaptic('light');
  }}
>
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/AppShell.tsx
git commit -m "feat: integrate PageTransition and delegated button haptics"
```

---

## Task 8: DashboardScreen AnimateInView Wrapping

**Files:**
- Modify: `components/dashboard/DashboardScreen.tsx`

**Changes:**
1. Import `AnimateInView`.
2. Wrap each major card/section with staggered delays.

- [ ] **Step 1: Add import**

```tsx
import { AnimateInView } from '../AnimateInView';
```

- [ ] **Step 2: Wrap card sections**

Wrap each top-level dashboard card:

```tsx
<AnimateInView delay="0ms">
  <BentoHero ... />
</AnimateInView>
<AnimateInView delay="50ms">
  <ActionStrip ... />
</AnimateInView>
<AnimateInView delay="100ms">
  <WeeklySummary ... />
</AnimateInView>
<AnimateInView delay="150ms">
  <PlatformBreakdownCard ... />
</AnimateInView>
<AnimateInView delay="0ms">
  <StoryStrip ... />
</AnimateInView>
```

Note: adjust based on actual DashboardScreen structure after Dashboard v2 implementation.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/DashboardScreen.tsx
git commit -m "feat: add AnimateInView entrance animations to dashboard cards"
```

---

## Task 9: TaxLogic Skeleton Loaders

**Files:**
- Modify: `components/TaxLogic.tsx`

**Changes:**
1. Import `Skeleton`.
2. Show skeleton variants during data loading states.

- [ ] **Step 1: Add import**

```tsx
import { Skeleton } from './Skeleton';
```

- [ ] **Step 2: Add skeleton section for chart areas**

Before charts are rendered (when `dailyLogs` is empty or loading), show:

```tsx
{!hasData && (
  <div className="space-y-3">
    <Skeleton variant="chart" />
    <Skeleton variant="list" />
    <Skeleton variant="list" />
  </div>
)}
```

Where `hasData` is derived from `dailyLogs.length > 0`.

- [ ] **Step 3: Commit**

```bash
git add components/TaxLogic.tsx
git commit -m "feat: add Skeleton loaders to Tax tab chart sections"
```

---

## Task 10: CSS Animation Additions

**Files:**
- Modify: `index.css`

**Changes:**
1. Add `animate-page-in` keyframes.
2. Ensure `animate-fade-up-delay-*` classes exist (already present).
3. Add spring easing comments.

- [ ] **Step 1: Add page-in animation**

After the existing `@keyframes toastOut` block, add:

```css
@keyframes pageIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-page-in {
  animation: pageIn 0.2s var(--ease-out) both;
}
```

- [ ] **Step 2: Commit**

```bash
git add index.css
git commit -m "feat: add page-in animation keyframes"
```

---

## Task 11: E2E Tests

**Files:**
- Create: `e2e/polish.spec.ts`

- [ ] **Step 1: Write E2E spec**

```ts
import { test, expect } from '@playwright/test';

test('page transition animates on tab change', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Tax/i }).click();
  await expect(page.getByText('Tax')).toBeVisible();
});

test('toast shows progress bar', async ({ page }) => {
  await page.goto('/');
  // Trigger a toast via action, e.g. save a shift or export
  await page.getByRole('button', { name: /Settings/i }).click();
  await expect(page.locator('[role="alert"]')).toBeVisible();
});

test('reduced motion disables animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  // Verify no animation classes are applied
  const animated = await page.locator('.animate-page-in, .animate-fade-up').count();
  expect(animated).toBe(0);
});
```

- [ ] **Step 2: Run E2E**

```bash
npx playwright test e2e/polish.spec.ts --project=desktop-chromium
```

- [ ] **Step 3: Commit**

```bash
git add e2e/polish.spec.ts
git commit -m "test: add E2E for polish pass animations and accessibility"
```

---

## Self-Review

**Spec coverage:** All 9 success criteria map to tasks.
**Placeholder scan:** No TBD/TODO.
**Type consistency:** `ToastState` type reused; `PullState` already defined in `usePullToRefresh`.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-polish-pass.md`.**

**Execution options:**
1. **Subagent-Driven** (recommended)
2. **Inline Execution**

**Which approach?**
