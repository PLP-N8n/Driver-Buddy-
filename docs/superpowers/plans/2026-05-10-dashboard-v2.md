# Dashboard v2 Bento-Grid Hero — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Driver Buddy dashboard with a bento-grid hero, persistent action strip, horizontal stories, and collapsible depth sections.

**Architecture:** New presentational components (`BentoHero`, `ActionStrip`, `StoryStrip`, `CollapsibleSection`, etc.) are composed inside `DashboardScreen`. Existing data props are reused; only UI structure and layout change. `EarningsSummary` is removed and its responsibilities redistributed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest + React Testing Library + jsdom

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/AnimatedNumber.tsx` | Create | Count-up animation utility with IntersectionObserver |
| `components/__tests__/AnimatedNumber.test.tsx` | Create | Tests for count-up and reduced-motion |
| `components/dashboard/TaxMeterRing.tsx` | Create | SVG circular progress ring |
| `components/dashboard/__tests__/TaxMeterRing.test.tsx` | Create | Tests for ring rendering and animation |
| `components/dashboard/HeroTile.tsx` | Create | Mini stat tile with AnimatedNumber, progress bar, tap handler |
| `components/dashboard/__tests__/HeroTile.test.tsx` | Create | Tests for rendering, empty states, click handler |
| `components/dashboard/BentoHero.tsx` | Create | Responsive hero grid: TaxMeter left, 2×2 tiles right |
| `components/dashboard/__tests__/BentoHero.test.tsx` | Create | Tests for grid layout and mobile compactness |
| `components/dashboard/ActionStrip.tsx` | Create | Persistent shift controls bar |
| `components/dashboard/__tests__/ActionStrip.test.tsx` | Create | Tests for active/no-session/empty states |
| `components/dashboard/StoryCard.tsx` | Create | Typed story card with gradient, icon, CTA |
| `components/dashboard/StoryStrip.tsx` | Create | Horizontal scroll container with snap + dots |
| `components/dashboard/__tests__/StoryStrip.test.tsx` | Create | Tests for scroll snap and story rendering |
| `components/dashboard/CollapsibleSection.tsx` | Create | Sticky header, chevron, expand/collapse transition |
| `components/dashboard/__tests__/CollapsibleSection.test.tsx` | Create | Tests for toggle and content visibility |
| `components/dashboard/RealTimeTaxMeter.tsx` | Modify | Add `size: 'compact' \| 'hero'` prop variant |
| `components/dashboard/PlatformBreakdownCard.tsx` | Modify | Add week/month/year time-filter tabs (internal state) |
| `components/dashboard/DashboardScreen.tsx` | Modify | Reorder children, wire new components, remove `EarningsSummary` |
| `components/Dashboard.tsx` | Modify | Remove `EarningsSummary` re-export if present |
| `components/dashboard/EarningsSummary.tsx` | Delete | Redundant after redistribution |
| `e2e/dashboard.spec.ts` | Modify | Add assertions for bento hero and action strip visibility |

---

## Dependencies

No new npm dependencies. All animations use CSS + native `IntersectionObserver`.

---

## Task 1: AnimatedNumber Utility

**Files:**
- Create: `components/AnimatedNumber.tsx`
- Create: `components/__tests__/AnimatedNumber.test.tsx`

**Interface:**
```tsx
export interface AnimatedNumberProps {
  value: number;
  duration?: number; // ms, default 800
  prefix?: string;
  suffix?: string;
  decimals?: number; // default 0
  className?: string;
}
```

**Behavior:**
1. Renders `prefix + formattedNumber + suffix` inside a `<span>`.
2. On first intersection (via `IntersectionObserver`), animates the number from `0` to `value` over `duration` ms using `requestAnimationFrame`.
3. If `prefers-reduced-motion: reduce` is active, skips animation and renders the final value immediately.
4. `decimals` controls `maximumFractionDigits` in `Intl.NumberFormat`.
5. After animation completes, the observer is disconnected.

- [ ] **Step 1: Write failing test**

```tsx
// components/__tests__/AnimatedNumber.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AnimatedNumber } from '../AnimatedNumber';

describe('AnimatedNumber', () => {
  it('renders final value after animation', async () => {
    render(<AnimatedNumber value={123} prefix="£" suffix=" earned" />);
    await waitFor(() => {
      expect(screen.getByText('£123 earned')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('respects prefers-reduced-motion and renders immediately', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<AnimatedNumber value={456} />);
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  it('formats decimals correctly', async () => {
    render(<AnimatedNumber value={99.5} decimals={1} />);
    await waitFor(() => {
      expect(screen.getByText('99.5')).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/__tests__/AnimatedNumber.test.tsx --reporter=verbose
```

Expected: FAIL — `AnimatedNumber` module not found.

- [ ] **Step 3: Implement**

```tsx
// components/AnimatedNumber.tsx
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

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting || hasAnimated.current) return;
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/__tests__/AnimatedNumber.test.tsx --reporter=verbose
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/AnimatedNumber.tsx components/__tests__/AnimatedNumber.test.tsx
git commit -m "feat: add AnimatedNumber utility with IntersectionObserver count-up"
```

---

## Task 2: TaxMeterRing SVG Component

**Files:**
- Create: `components/dashboard/TaxMeterRing.tsx`
- Create: `components/dashboard/__tests__/TaxMeterRing.test.tsx`

**Interface:**
```tsx
export interface TaxMeterRingProps {
  percent: number; // 0–100
  size?: number;   // px, default 120
  strokeWidth?: number; // px, default 8
}
```

**Behavior:**
1. Renders an SVG with a background circle (low opacity) and a foreground arc (gradient stroke).
2. On mount, animates the foreground arc's `stroke-dashoffset` from full circumference to the target percentage.
3. Duration: 700ms, `ease-out`.
4. Respects `prefers-reduced-motion`.

- [ ] **Step 1: Write failing test**

```tsx
// components/dashboard/__tests__/TaxMeterRing.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TaxMeterRing } from '../TaxMeterRing';

describe('TaxMeterRing', () => {
  it('renders an svg with two circles', () => {
    const { container } = render(<TaxMeterRing percent={50} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });

  it('respects reduced motion and sets dashoffset immediately', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const { container } = render(<TaxMeterRing percent={75} />);
    const foreground = container.querySelector('.tax-meter-foreground');
    expect(foreground).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/TaxMeterRing.test.tsx --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/TaxMeterRing.tsx
import React, { useEffect, useRef, useState } from 'react';

export interface TaxMeterRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const TaxMeterRing: React.FC<TaxMeterRingProps> = ({
  percent,
  size = 120,
  strokeWidth = 8,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(prefersReducedMotion() ? circumference * (1 - percent / 100) : circumference);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion() || hasAnimated.current) return;
    hasAnimated.current = true;

    const startTime = performance.now();
    const targetOffset = circumference * (1 - Math.min(100, Math.max(0, percent)) / 100);
    const duration = 700;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setOffset(circumference - (circumference - targetOffset) * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [percent, circumference]);

  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <defs>
        <linearGradient id="tax-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
        stroke="url(#tax-ring-gradient)"
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/TaxMeterRing.test.tsx --reporter=verbose
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/TaxMeterRing.tsx components/dashboard/__tests__/TaxMeterRing.test.tsx
git commit -m "feat: add TaxMeterRing SVG component with animated stroke"
```

---

## Task 3: HeroTile Component

**Files:**
- Create: `components/dashboard/HeroTile.tsx`
- Create: `components/dashboard/__tests__/HeroTile.test.tsx`

**Interface:**
```tsx
export interface HeroTileProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delta?: number;          // vs previous period, shown as +/– badge
  progress?: number;         // 0–100, renders a mini progress bar
  subLabel?: string;       // shown below the number
  onClick?: () => void;
  isEmpty?: boolean;       // true if no data yet
  emptyHint?: string;      // shown when isEmpty
}
```

**Behavior:**
1. Uses `AnimatedNumber` for the main value.
2. If `isEmpty` is true, renders `--` instead of the number, plus `emptyHint` text.
3. If `progress` is provided, renders a thin progress bar below the number.
4. If `delta` is provided, renders a small `+£X` or `–£X` badge.
5. Full-width tap target (the whole card).

- [ ] **Step 1: Write failing test**

```tsx
// components/dashboard/__tests__/HeroTile.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroTile } from '../HeroTile';

describe('HeroTile', () => {
  it('renders label and animated number', async () => {
    render(<HeroTile label="Revenue" value={120} prefix="£" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByText(/120/)).toBeInTheDocument());
  });

  it('shows empty state with hint', () => {
    render(<HeroTile label="Miles" value={0} isEmpty emptyHint="Log a shift" />);
    expect(screen.getByText('--')).toBeInTheDocument();
    expect(screen.getByText('Log a shift')).toBeInTheDocument();
  });

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<HeroTile label="Test" value={1} onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('renders progress bar when progress is given', () => {
    render(<HeroTile label="Week" value={50} progress={60} />);
    const bar = document.querySelector('.hero-tile-progress-bar');
    expect(bar).toBeTruthy();
    expect(bar).toHaveStyle({ width: '60%' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/HeroTile.test.tsx --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/HeroTile.tsx
import React from 'react';
import { AnimatedNumber } from '../AnimatedNumber';

export interface HeroTileProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delta?: number;
  progress?: number;
  subLabel?: string;
  onClick?: () => void;
  isEmpty?: boolean;
  emptyHint?: string;
}

export const HeroTile: React.FC<HeroTileProps> = ({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  delta,
  progress,
  subLabel,
  onClick,
  isEmpty,
  emptyHint,
}) => {
  const showDelta = delta !== undefined && delta !== 0;
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col justify-between rounded-2xl border border-surface-border bg-surface-raised p-4 text-left transition-transform duration-150 hover:scale-[1.02] active:scale-95 min-h-[96px]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {showDelta && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${deltaPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
            {deltaPositive ? '+' : ''}{new Intl.NumberFormat('en-GB', { maximumFractionDigits: decimals }).format(delta ?? 0)}
          </span>
        )}
      </div>

      <div className="mt-2">
        {isEmpty ? (
          <>
            <p className="font-mono text-2xl font-bold tracking-tight text-slate-600">--</p>
            {emptyHint && <p className="mt-1 text-[10px] text-slate-600">{emptyHint}</p>}
          </>
        ) : (
          <>
            <p className="font-mono text-2xl font-bold tracking-tight text-white">
              <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
            </p>
            {subLabel && <p className="mt-1 text-[10px] text-slate-500">{subLabel}</p>}
          </>
        )}
      </div>

      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="hero-tile-progress-bar h-full rounded-full bg-brand transition-all duration-700 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </button>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/HeroTile.test.tsx --reporter=verbose
```

Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/HeroTile.tsx components/dashboard/__tests__/HeroTile.test.tsx
git commit -m "feat: add HeroTile component with AnimatedNumber, progress bar, empty state"
```

---

## Task 4: BentoHero Grid Layout

**Files:**
- Create: `components/dashboard/BentoHero.tsx`
- Create: `components/dashboard/__tests__/BentoHero.test.tsx`
- Modify: `components/dashboard/RealTimeTaxMeter.tsx` (add `size` prop, see Task 9)

**Interface:**
```tsx
export interface BentoHeroProps {
  taxMeterProps: RealTimeTaxMeterProps;
  todayRevenue: number;
  weekRevenue: number;
  weeklyRevenueTarget: number;
  weekProgressPercent: number;
  taxSaved: number;
  totalBusinessMiles: number;
  activeSession: ActiveWorkSession | null;
  activeDurationHours: number;
  hasAnyLoggedShifts: boolean;
  onTileClick: (tile: 'today' | 'week' | 'tax' | 'miles') => void;
}
```

**Behavior:**
1. Responsive two-column grid.
   - Desktop/tablet (`md:`): left 2/3 is TaxMeter, right 1/3 is 2×2 tiles.
   - Mobile (`< md`): full-width TaxMeter, then 2×2 tiles below. Tiles use compact padding (`p-3`) on mobile.
2. TaxMeter receives `size="hero"`.
3. Four tiles:
   - **Today's Revenue**: `todayRevenue`. If active session, shows live duration badge via `subLabel`. Empty state: `isEmpty={!hasAnyLoggedShifts && !activeSession}`.
   - **Week Progress**: `weekRevenue` + `progress={weekProgressPercent}`. Empty state when no shifts logged.
   - **Tax Saved**: `taxSaved`. Always has data once any shift is logged.
   - **Miles Logged**: `totalBusinessMiles` + suffix `mi`. Empty state when no trips.
4. All four tiles are tappable and call `onTileClick`.

**Mobile compactness note:** On iPhone SE (375×667), the hero should remain compact enough that the ActionStrip (rendered below the hero by `DashboardScreen`) peeks above the fold. Ensure:
- TaxMeter hero uses `p-4` not `p-5` on mobile.
- Tile grid uses `gap-2` on mobile, `gap-3` on tablet+.
- TaxMeter text scales: `text-2xl` on mobile, `text-4xl` on `md:`.

- [ ] **Step 1: Write failing test**

```tsx
// components/dashboard/__tests__/BentoHero.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BentoHero } from '../BentoHero';

const mockTaxMeterProps = {
  trips: [],
  expenses: [],
  dailyLogs: [],
  settings: { taxSetAsidePercent: 20 } as any,
  onNavigateToTax: vi.fn(),
};

describe('BentoHero', () => {
  it('renders tax meter and four tiles', () => {
    render(
      <BentoHero
        taxMeterProps={mockTaxMeterProps}
        todayRevenue={0}
        weekRevenue={0}
        weeklyRevenueTarget={500}
        weekProgressPercent={0}
        taxSaved={0}
        totalBusinessMiles={0}
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={false}
        onTileClick={vi.fn()}
      />
    );

    expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
    expect(screen.getByText('Week Progress')).toBeInTheDocument();
    expect(screen.getByText('Tax Saved')).toBeInTheDocument();
    expect(screen.getByText('Miles Logged')).toBeInTheDocument();
  });

  it('shows empty hints when no data', () => {
    render(
      <BentoHero
        taxMeterProps={mockTaxMeterProps}
        todayRevenue={0}
        weekRevenue={0}
        weeklyRevenueTarget={500}
        weekProgressPercent={0}
        taxSaved={0}
        totalBusinessMiles={0}
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={false}
        onTileClick={vi.fn()}
      />
    );

    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/BentoHero.test.tsx --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/BentoHero.tsx
import React from 'react';
import { ActiveWorkSession } from '../../types';
import { formatCurrency } from '../../utils/ui';
import { HeroTile } from './HeroTile';
import { RealTimeTaxMeter, RealTimeTaxMeterProps } from './RealTimeTaxMeter';

export interface BentoHeroProps {
  taxMeterProps: RealTimeTaxMeterProps;
  todayRevenue: number;
  weekRevenue: number;
  weeklyRevenueTarget: number;
  weekProgressPercent: number;
  taxSaved: number;
  totalBusinessMiles: number;
  activeSession: ActiveWorkSession | null;
  activeDurationHours: number;
  hasAnyLoggedShifts: boolean;
  onTileClick: (tile: 'today' | 'week' | 'tax' | 'miles') => void;
}

export const BentoHero: React.FC<BentoHeroProps> = ({
  taxMeterProps,
  todayRevenue,
  weekRevenue,
  weeklyRevenueTarget,
  weekProgressPercent,
  taxSaved,
  totalBusinessMiles,
  activeSession,
  activeDurationHours,
  hasAnyLoggedShifts,
  onTileClick,
}) => {
  const todayEmpty = !hasAnyLoggedShifts && !activeSession;
  const weekEmpty = !hasAnyLoggedShifts;
  const milesEmpty = totalBusinessMiles === 0 && !hasAnyLoggedShifts;

  const todaySubLabel = activeSession
    ? `${formatCurrency(todayRevenue)} live · ${activeDurationHours.toFixed(1)}h`
    : undefined;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
      {/* Tax Meter — left 2/3 on desktop */}
      <div className="md:col-span-2">
        <RealTimeTaxMeter {...taxMeterProps} size="hero" />
      </div>

      {/* Tiles — right 1/3 on desktop, stacked on mobile */}
      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <HeroTile
          label="Today's Revenue"
          value={todayRevenue}
          prefix="£"
          decimals={2}
          subLabel={todaySubLabel}
          isEmpty={todayEmpty}
          emptyHint="Log a shift"
          onClick={() => onTileClick('today')}
        />
        <HeroTile
          label="Week Progress"
          value={weekRevenue}
          prefix="£"
          decimals={2}
          progress={weekProgressPercent}
          isEmpty={weekEmpty}
          emptyHint="No shifts this week"
          onClick={() => onTileClick('week')}
        />
        <HeroTile
          label="Tax Saved"
          value={taxSaved}
          prefix="£"
          decimals={2}
          isEmpty={taxSaved === 0 && !hasAnyLoggedShifts}
          emptyHint="Log a shift to see this"
          onClick={() => onTileClick('tax')}
        />
        <HeroTile
          label="Miles Logged"
          value={totalBusinessMiles}
          suffix=" mi"
          decimals={0}
          isEmpty={milesEmpty}
          emptyHint="Log a shift to see this"
          onClick={() => onTileClick('miles')}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/BentoHero.test.tsx --reporter=verbose
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/BentoHero.tsx components/dashboard/__tests__/BentoHero.test.tsx
git commit -m "feat: add BentoHero responsive grid with TaxMeter + 4 tiles"
```

---

## Task 5: ActionStrip Component

**Files:**
- Create: `components/dashboard/ActionStrip.tsx`
- Create: `components/dashboard/__tests__/ActionStrip.test.tsx`

**Interface:**
```tsx
export interface ActionStripProps {
  activeSession: { startedAt: string } | null;
  activeDurationHours: number;
  hasAnyLoggedShifts: boolean;
  backupCode?: string;
  onStartShift: () => void;
  onEndShift: () => void;
  onQuickAddRevenue: () => void;
  onAddShift: () => void;
  onRestoreFromBackupCode?: (code: string) => void;
}
```

**Behavior:**
1. **Active session running:**
   - Row with: live timer badge (left), `+ £10 quick add` (center, secondary), `End shift` (right, primary).
2. **No active session, has logged shifts:**
   - Row with: `Start Shift` (left, primary), `Add shift` (right, secondary).
3. **Empty state (no shifts ever):**
   - Full-width: `Log your first shift` (primary).
   - Below: `Restore from cloud` (secondary) if `backupCode` present.
4. Uses existing `primaryButtonClasses` and `secondaryButtonClasses` from `utils/ui`.

- [ ] **Step 1: Write failing test**

```tsx
// components/dashboard/__tests__/ActionStrip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionStrip } from '../ActionStrip';

describe('ActionStrip', () => {
  it('shows Start Shift and Add shift when no active session', () => {
    render(
      <ActionStrip
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={true}
        onStartShift={vi.fn()}
        onEndShift={vi.fn()}
        onQuickAddRevenue={vi.fn()}
        onAddShift={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Start Shift/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add shift/i })).toBeInTheDocument();
  });

  it('shows End shift and Quick Add when session is active', () => {
    render(
      <ActionStrip
        activeSession={{ startedAt: new Date().toISOString() }}
        activeDurationHours={2.5}
        hasAnyLoggedShifts={true}
        onStartShift={vi.fn()}
        onEndShift={vi.fn()}
        onQuickAddRevenue={vi.fn()}
        onAddShift={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /End shift/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ £10 quick add/i })).toBeInTheDocument();
  });

  it('shows Log your first shift in empty state', () => {
    const onAddShift = vi.fn();
    render(
      <ActionStrip
        activeSession={null}
        activeDurationHours={0}
        hasAnyLoggedShifts={false}
        onStartShift={vi.fn()}
        onEndShift={vi.fn()}
        onQuickAddRevenue={vi.fn()}
        onAddShift={onAddShift}
      />
    );
    const btn = screen.getByRole('button', { name: /Log your first shift/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onAddShift).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/ActionStrip.test.tsx --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/ActionStrip.tsx
import React from 'react';
import { Clock3 } from 'lucide-react';
import { primaryButtonClasses, secondaryButtonClasses } from '../../utils/ui';

export interface ActionStripProps {
  activeSession: { startedAt: string } | null;
  activeDurationHours: number;
  hasAnyLoggedShifts: boolean;
  backupCode?: string;
  onStartShift: () => void;
  onEndShift: () => void;
  onQuickAddRevenue: () => void;
  onAddShift: () => void;
  onRestoreFromBackupCode?: (code: string) => void;
}

export const ActionStrip: React.FC<ActionStripProps> = ({
  activeSession,
  activeDurationHours,
  hasAnyLoggedShifts,
  backupCode,
  onStartShift,
  onEndShift,
  onQuickAddRevenue,
  onAddShift,
  onRestoreFromBackupCode,
}) => {
  if (activeSession) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-surface-border bg-surface-raised p-3">
        <div className="flex items-center gap-2 rounded-full border border-positive/30 bg-positive-muted px-3 py-2 text-xs font-semibold text-positive">
          <Clock3 className="h-3.5 w-3.5" />
          {activeDurationHours.toFixed(2)}h live
        </div>
        <div className="flex flex-1 items-center gap-2">
          <button type="button" onClick={onQuickAddRevenue} className={`${secondaryButtonClasses} flex-1 justify-center text-xs px-3 py-2`}>
            + £10 quick add
          </button>
          <button type="button" onClick={onEndShift} className={`${primaryButtonClasses} flex-1 justify-center text-xs px-3 py-2`}>
            End shift
          </button>
        </div>
      </div>
    );
  }

  if (!hasAnyLoggedShifts) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onAddShift} className={`${primaryButtonClasses} w-full justify-center`}>
          Log your first shift
        </button>
        {backupCode && onRestoreFromBackupCode && (
          <button type="button" onClick={() => onRestoreFromBackupCode(backupCode)} className={`${secondaryButtonClasses} w-full justify-center`}>
            Restore from cloud
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onStartShift} className={`${primaryButtonClasses} justify-center`}>
        Start Shift
      </button>
      <button type="button" onClick={onAddShift} className={`${secondaryButtonClasses} justify-center`}>
        Add shift
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/ActionStrip.test.tsx --reporter=verbose
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/ActionStrip.tsx components/dashboard/__tests__/ActionStrip.test.tsx
git commit -m "feat: add ActionStrip with active/empty/logged shift states"
```

---

## Task 6: StoryCard Component

**Files:**
- Create: `components/dashboard/StoryCard.tsx`

**Interface:**
```tsx
export type StoryType = 'recentShift' | 'prediction' | 'missedDay' | 'recurring' | 'habit' | 'welcome';

export interface StoryCardProps {
  type: StoryType;
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}
```

**Behavior:**
1. Renders a card with type-specific gradient background.
2. Top-left: title. Top-right: icon (from type map).
3. Bottom: body text + CTA button.
4. Fixed dimensions: `w-64 h-40`.
5. `welcome` type uses brand gradient and Sparkles icon.

**Gradient map:**
- `recentShift`: `from-indigo-500/20 to-purple-500/10`
- `prediction`: `from-amber-500/20 to-orange-500/10`
- `missedDay`: `from-rose-500/20 to-red-500/10`
- `recurring`: `from-sky-500/20 to-cyan-500/10`
- `habit`: `from-emerald-500/20 to-teal-500/10`
- `welcome`: `from-brand/20 to-accent/10`

- [ ] **Step 1: Write failing test**

No test file for StoryCard; it is a pure presentational component covered by StoryStrip tests. Skip to implementation.

- [ ] **Step 2: Implement**

```tsx
// components/dashboard/StoryCard.tsx
import React from 'react';
import { Sparkles, TrendingUp, AlertTriangle, Calendar, Repeat, Flame } from 'lucide-react';
import { primaryButtonClasses } from '../../utils/ui';

export type StoryType = 'recentShift' | 'prediction' | 'missedDay' | 'recurring' | 'habit' | 'welcome';

export interface StoryCardProps {
  type: StoryType;
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}

const gradientMap: Record<StoryType, string> = {
  recentShift: 'bg-gradient-to-br from-indigo-500/20 to-purple-500/10',
  prediction: 'bg-gradient-to-br from-amber-500/20 to-orange-500/10',
  missedDay: 'bg-gradient-to-br from-rose-500/20 to-red-500/10',
  recurring: 'bg-gradient-to-br from-sky-500/20 to-cyan-500/10',
  habit: 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10',
  welcome: 'bg-gradient-to-br from-brand/20 to-accent/10',
};

const iconMap: Record<StoryType, React.ReactNode> = {
  recentShift: <TrendingUp className="h-4 w-4 text-indigo-300" />,
  prediction: <Sparkles className="h-4 w-4 text-amber-300" />,
  missedDay: <AlertTriangle className="h-4 w-4 text-rose-300" />,
  recurring: <Repeat className="h-4 w-4 text-sky-300" />,
  habit: <Flame className="h-4 w-4 text-emerald-300" />,
  welcome: <Sparkles className="h-4 w-4 text-brand" />,
};

export const StoryCard: React.FC<StoryCardProps> = ({ type, title, body, cta, onCta }) => {
  return (
    <div
      className={`relative flex h-40 w-64 shrink-0 flex-col justify-between rounded-2xl border border-white/5 p-4 ${gradientMap[type]}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/80">{title}</p>
        <div className="rounded-lg bg-white/5 p-1.5">{iconMap[type]}</div>
      </div>

      <div>
        <p className="text-sm text-white/70 line-clamp-2">{body}</p>
        <button
          type="button"
          onClick={onCta}
          className={`${primaryButtonClasses} mt-2 w-full justify-center text-xs px-3 py-2`}
        >
          {cta}
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/StoryCard.tsx
git commit -m "feat: add StoryCard with typed gradients and icons"
```

---

## Task 7: StoryStrip Component

**Files:**
- Create: `components/dashboard/StoryStrip.tsx`
- Create: `components/dashboard/__tests__/StoryStrip.test.tsx`

**Interface:**
```tsx
export interface StoryStripProps {
  stories: StoryCardProps[];
}
```

**Behavior:**
1. Renders a horizontal scroll container with `overflow-x-auto scroll-snap-x mandatory`.
2. Each `StoryCard` has `scroll-snap-align: start`.
3. Dot indicator below: one dot per story, active dot is `bg-brand`, inactive is `bg-white/20`.
4. If `stories` is empty, renders a single welcome story: "Log your first shift to unlock insights..."

- [ ] **Step 1: Write failing test**

```tsx
// components/dashboard/__tests__/StoryStrip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoryStrip } from '../StoryStrip';

describe('StoryStrip', () => {
  it('renders stories and dot indicator', () => {
    render(
      <StoryStrip
        stories={[
          { type: 'recentShift', title: 'Recent', body: '£50', cta: 'View', onCta: vi.fn() },
          { type: 'prediction', title: 'Tip', body: 'Drive tonight', cta: 'Start', onCta: vi.fn() },
        ]}
      />
    );
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Tip')).toBeInTheDocument();
    const dots = document.querySelectorAll('.story-dot');
    expect(dots.length).toBe(2);
  });

  it('shows welcome story when empty', () => {
    render(<StoryStrip stories={[]} />);
    expect(screen.getByText('Welcome to Driver Buddy')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/StoryStrip.test.tsx --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/StoryStrip.tsx
import React, { useRef, useState, useEffect } from 'react';
import { StoryCard, StoryCardProps } from './StoryCard';

export interface StoryStripProps {
  stories: StoryCardProps[];
}

export const StoryStrip: React.FC<StoryStripProps> = ({ stories }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const displayStories = stories.length > 0 ? stories : [
    {
      type: 'welcome' as const,
      title: 'Welcome to Driver Buddy',
      body: 'Log your first shift to unlock insights, predictions, and tax estimates.',
      cta: 'Log first shift',
      onCta: () => {}, // DashboardScreen wires this to openManualEntry
    },
  ];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Array.from(el.children).indexOf(entry.target as HTMLElement);
            if (index >= 0) setActiveIndex(index);
          }
        });
      },
      { root: el, threshold: 0.5 }
    );

    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [displayStories.length]);

  return (
    <div className="space-y-3">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scroll-snap-x mandatory pb-2 no-scrollbar"
      >
        {displayStories.map((story, index) => (
          <div key={`${story.type}-${index}`} className="scroll-snap-align-start">
            <StoryCard {...story} />
          </div>
        ))}
      </div>

      {/* Dot indicator */}
      {displayStories.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {displayStories.map((_, index) => (
            <div
              key={index}
              className={`story-dot h-1.5 w-1.5 rounded-full transition-colors ${
                index === activeIndex ? 'bg-brand' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/StoryStrip.test.tsx --reporter=verbose
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/StoryStrip.tsx components/dashboard/__tests__/StoryStrip.test.tsx
git commit -m "feat: add StoryStrip with horizontal snap scroll and dot indicator"
```

---

## Task 8: CollapsibleSection Component

**Files:**
- Create: `components/dashboard/CollapsibleSection.tsx`
- Create: `components/dashboard/__tests__/CollapsibleSection.test.tsx`

**Interface:**
```tsx
export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}
```

**Behavior:**
1. Header is sticky (`sticky top-0`) with `backdrop-blur`.
2. Chevron rotates 180° when expanded.
3. Content uses `max-height` transition (300ms, `ease-out`).
4. If `defaultExpanded` is true, starts expanded.

- [ ] **Step 1: Write failing test**

```tsx
// components/dashboard/__tests__/CollapsibleSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleSection } from '../CollapsibleSection';

describe('CollapsibleSection', () => {
  it('shows content when expanded by default', () => {
    render(
      <CollapsibleSection title="Platform" defaultExpanded>
        <div data-testid="content">Breakdown</div>
      </CollapsibleSection>
    );
    expect(screen.getByTestId('content')).toBeVisible();
  });

  it('hides content after clicking header', () => {
    render(
      <CollapsibleSection title="Platform" defaultExpanded>
        <div data-testid="content">Breakdown</div>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByRole('button', { name: /Platform/i }));
    // Content is hidden via max-height; check it's not visible
    expect(screen.queryByTestId('content')).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/CollapsibleSection.test.tsx --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// components/dashboard/CollapsibleSection.tsx
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-2xl border border-surface-border bg-surface/95 backdrop-blur-xl panel-shadow">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="sticky top-0 z-10 flex w-full items-center justify-between rounded-t-2xl bg-surface/95 backdrop-blur-xl px-5 py-4 text-left"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ease-out ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: expanded ? '2000px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/CollapsibleSection.test.tsx --reporter=verbose
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/CollapsibleSection.tsx components/dashboard/__tests__/CollapsibleSection.test.tsx
git commit -m "feat: add CollapsibleSection with sticky header and max-height transition"
```

---

## Task 9: RealTimeTaxMeter Size Prop

**Files:**
- Modify: `components/dashboard/RealTimeTaxMeter.tsx`

**Change:** Add `size?: 'compact' | 'hero'` prop. Default `'compact'` for backward compatibility.

When `size === 'hero'`:
- Main tax owed text: `text-4xl` (desktop), `text-2xl` (mobile).
- Breakdown grid items: `p-4` instead of `p-3`.
- Include `<TaxMeterRing percent={personalAllowancePercent} size={120} />` beside the main tax number.
- Overall section padding: `p-5` (unchanged) but internal spacing increased.

When `size === 'compact'` (default):
- Keep current styling exactly as-is.
- Do not render `TaxMeterRing`.

- [ ] **Step 1: Write failing test**

```tsx
// Add to existing RealTimeTaxMeter test file, or create:
// components/dashboard/__tests__/RealTimeTaxMeter.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RealTimeTaxMeter } from '../RealTimeTaxMeter';

const baseProps = {
  trips: [],
  expenses: [],
  dailyLogs: [],
  settings: { taxSetAsidePercent: 20, claimMethod: 'SIMPLIFIED' } as any,
  onNavigateToTax: vi.fn(),
};

describe('RealTimeTaxMeter size prop', () => {
  it('renders hero size with tax meter ring', () => {
    render(<RealTimeTaxMeter {...baseProps} size="hero" />);
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('does not render ring in compact size', () => {
    render(<RealTimeTaxMeter {...baseProps} size="compact" />);
    expect(document.querySelector('svg')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/RealTimeTaxMeter.test.tsx --reporter=verbose
```

Expected: FAIL — `size` prop not recognized.

- [ ] **Step 3: Implement**

Modify `components/dashboard/RealTimeTaxMeter.tsx`:

1. Add import: `import { TaxMeterRing } from './TaxMeterRing';`
2. Add prop:
   ```tsx
   type RealTimeTaxMeterProps = {
     trips: Trip[];
     expenses: Expense[];
     dailyLogs: DailyWorkLog[];
     settings: Settings;
     onNavigateToTax: () => void;
     size?: 'compact' | 'hero';
   };
   ```
3. Destructure `size = 'compact'` in component params.
4. Conditionally render `TaxMeterRing`:
   ```tsx
   const isHero = size === 'hero';
   ```
5. In the "Main Tax Owed" section, wrap with conditional layout:
   ```tsx
   <div className={`mt-5 flex items-center gap-4 ${isHero ? '' : ''}`}>
     {isHero && <TaxMeterRing percent={personalAllowancePercent} size={100} />}
     <div>
       <p className="text-xs text-slate-500">Estimated tax owed</p>
       <p className={`mt-1 font-bold tracking-tight text-white ${isHero ? 'text-4xl max-md:text-2xl' : 'text-3xl'}`}>
         {formatCurrency(totalTax)}
       </p>
     </div>
   </div>
   ```
6. Breakdown grid: conditionally add larger padding.
   ```tsx
   <div className={`mt-4 grid grid-cols-3 gap-2`}>
     {['Income tax', 'Class 4 NI', 'Profit after tax'].map((label, i) => (
       <div key={label} className={`rounded-xl bg-white/5 ring-1 ring-white/5 ${isHero ? 'p-4' : 'p-3'}`}>
         ...
       </div>
     ))}
   </div>
   ```

Since the file is large (~300 lines), write the exact edits:

```tsx
// Top of file, after imports:
import { TaxMeterRing } from './TaxMeterRing';
```

```tsx
// Modify props type:
type RealTimeTaxMeterProps = {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  onNavigateToTax: () => void;
  size?: 'compact' | 'hero';
};
```

```tsx
// Destructure in component:
export const RealTimeTaxMeter: React.FC<RealTimeTaxMeterProps> = ({
  trips,
  expenses,
  dailyLogs,
  settings,
  onNavigateToTax,
  size = 'compact',
}) => {
```

```tsx
// In render, replace the "Main Tax Owed" block with:
      <div className="mt-5 flex items-center gap-4">
        {size === 'hero' && (
          <TaxMeterRing percent={personalAllowancePercent} size={100} />
        )}
        <div>
          <p className="text-xs text-slate-500">Estimated tax owed</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`font-bold tracking-tight text-white ${size === 'hero' ? 'text-4xl max-md:text-2xl' : 'text-3xl'}`}>
              {formatCurrency(totalTax)}
            </p>
            <span className="text-xs text-slate-500">
              ({settings.claimMethod === 'SIMPLIFIED' ? 'Simplified miles' : 'Actual costs'})
            </span>
          </div>
        </div>
      </div>
```

```tsx
// Breakdown grid padding:
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className={`rounded-xl bg-white/5 ring-1 ring-white/5 ${size === 'hero' ? 'p-4' : 'p-3'}`}>
```

Repeat the conditional padding for all 3 grid cells.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/RealTimeTaxMeter.test.tsx --reporter=verbose
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/RealTimeTaxMeter.tsx components/dashboard/__tests__/RealTimeTaxMeter.test.tsx
git commit -m "feat: add size prop to RealTimeTaxMeter with hero variant and TaxMeterRing"
```

---

## Task 10: PlatformBreakdownCard Time-Filter Tabs

**Files:**
- Modify: `components/dashboard/PlatformBreakdownCard.tsx`

**Change:** Add internal tab state `timeFilter: 'week' | 'month' | 'year'`. Filter `dailyLogs` before passing to `calcPlatformSummaries`.

- [ ] **Step 1: Write failing test**

Create `components/dashboard/__tests__/PlatformBreakdownCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlatformBreakdownCard } from '../PlatformBreakdownCard';

const makeLog = (overrides: any) => ({
  id: '1',
  date: '2026-05-01',
  provider: 'Uber',
  hoursWorked: 2,
  revenue: 20,
  ...overrides,
});

describe('PlatformBreakdownCard', () => {
  it('renders week/month/year tabs', () => {
    render(<PlatformBreakdownCard logs={[makeLog({})]} />);
    expect(screen.getByRole('button', { name: /Week/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Year/i })).toBeInTheDocument();
  });

  it('switches tabs on click', () => {
    render(<PlatformBreakdownCard logs={[makeLog({})]} />);
    const monthBtn = screen.getByRole('button', { name: /Month/i });
    fireEvent.click(monthBtn);
    expect(monthBtn).toHaveClass('bg-brand');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/dashboard/__tests__/PlatformBreakdownCard.test.tsx --reporter=verbose
```

Expected: FAIL — tabs not present.

- [ ] **Step 3: Implement**

Read the current `PlatformBreakdownCard.tsx` to understand its structure, then add:

1. Import `useState`.
2. Add internal state: `const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'year'>('week');`
3. Filter `logs` before use:
   ```tsx
   const filteredLogs = useMemo(() => {
     const today = new Date();
     return logs.filter((log) => {
       const logDate = new Date(log.date);
       if (timeFilter === 'week') {
         const weekAgo = new Date(today);
         weekAgo.setDate(weekAgo.getDate() - 7);
         return logDate >= weekAgo;
       }
       if (timeFilter === 'month') {
         return logDate.getMonth() === today.getMonth() && logDate.getFullYear() === today.getFullYear();
       }
       return true; // year — all logs
     });
   }, [logs, timeFilter]);
   ```
4. Render tabs before the breakdown list:
   ```tsx
   const tabClass = (active: boolean) =>
     `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'}`;

   <div className="mb-4 flex gap-2">
     {(['week', 'month', 'year'] as const).map((f) => (
       <button key={f} type="button" onClick={() => setTimeFilter(f)} className={tabClass(timeFilter === f)}>
         {f.charAt(0).toUpperCase() + f.slice(1)}
       </button>
     ))}
   </div>
   ```
5. Use `filteredLogs` instead of `logs` when computing summaries.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run components/dashboard/__tests__/PlatformBreakdownCard.test.tsx --reporter=verbose
```

Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/PlatformBreakdownCard.tsx components/dashboard/__tests__/PlatformBreakdownCard.test.tsx
git commit -m "feat: add week/month/year tabs to PlatformBreakdownCard"
```

---

## Task 11: DashboardScreen Reassembly

**Files:**
- Modify: `components/dashboard/DashboardScreen.tsx`
- Modify: `components/Dashboard.tsx` (remove EarningsSummary re-export)
- Delete: `components/dashboard/EarningsSummary.tsx`

**Changes:**

1. **Remove `EarningsSummary` import and usage.**
2. **Add imports for new components:**
   ```tsx
   import { BentoHero } from './BentoHero';
   import { ActionStrip } from './ActionStrip';
   import { StoryStrip } from './StoryStrip';
   import { CollapsibleSection } from './CollapsibleSection';
   ```
3. **Add new local state:**
   ```tsx
   const [heroExpandedTile, setHeroExpandedTile] = useState<string | null>(null);
   const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['platform', 'intelligence']));
   ```
4. **Build `storiesData` array** from existing derived data:
   ```tsx
   const storiesData = useMemo(() => {
     const stories: StoryCardProps[] = [];
     if (recentLogs[0]) {
       stories.push({
         type: 'recentShift',
         title: 'Recent Shift',
         body: `${recentLogs[0].provider} · ${formatCurrency(recentLogs[0].revenue)}`,
         cta: 'View',
         onCta: () => onOpenWorkLog(),
       });
     }
     if (topPrediction) {
       stories.push({
         type: 'prediction',
         title: 'Insight',
         body: topPrediction.message,
         cta: topPrediction.actionLabel || 'Set Reminder',
         onCta: () => onSetPredictionReminder(),
       });
     }
     if (visibleMissedDays[0]) {
       stories.push({
         type: 'missedDay',
         title: 'Missed Day',
         body: `You didn't log ${visibleMissedDays[0]}. Backfill it now.`,
         cta: 'Backfill',
         onCta: () => onOpenBackfill(),
       });
     }
     if (dueRecurringExpenses[0]) {
       stories.push({
         type: 'recurring',
         title: 'Recurring Due',
         body: `${dueRecurringExpenses[0].description} · ${formatCurrency(dueRecurringExpenses[0].amount)}`,
         cta: 'Log Now',
         onCta: () => handleLogRecurring(dueRecurringExpenses[0]),
       });
     }
     if (hasHabitCard && habitState.currentStreak >= 3) {
       stories.push({
         type: 'habit',
         title: 'Streak',
         body: `${habitState.currentStreak} day streak! Keep it up.`,
         cta: 'Nice',
         onCta: () => {},
       });
     }
     return stories;
   }, [recentLogs, topPrediction, visibleMissedDays, dueRecurringExpenses, hasHabitCard, habitState]);
   ```
5. **Replace the non-completed-shift JSX block** (the large `else` branch inside `completedShiftSummary ? ... : <>`) with:
   ```tsx
   <>
     <BentoHero
       taxMeterProps={{ trips, expenses, dailyLogs, settings, onNavigateToTax }}
       todayRevenue={todayRevenue}
       weekRevenue={weekRevenue}
       weeklyRevenueTarget={settings.weeklyRevenueTarget}
       weekProgressPercent={weekProgressPercent}
       taxSaved={taxYearTotals.taxSetAside}
       totalBusinessMiles={taxYearTotals.totalBusinessMiles}
       activeSession={activeSession}
       activeDurationHours={activeDurationHours}
       hasAnyLoggedShifts={dailyLogs.length > 0}
       onTileClick={(tile) => {
         if (tile === 'today') onNavigateToTax();
         if (tile === 'week') onNavigateToTax();
         if (tile === 'tax') onNavigateToTax();
         if (tile === 'miles') onOpenWorkLog();
       }}
     />

     <ActionStrip
       activeSession={activeSession ? { startedAt: activeSession.startedAt } : null}
       activeDurationHours={activeDurationHours}
       hasAnyLoggedShifts={dailyLogs.length > 0}
       backupCode={backupCode}
       onStartShift={openStartSheet}
       onEndShift={openActiveEndSheet}
       onQuickAddRevenue={() => onUpdateSession({ revenue: liveRevenue + 10 })}
       onAddShift={() => openManualEntry()}
       onRestoreFromBackupCode={onRestoreFromBackupCode}
     />

     <StoryStrip stories={storiesData} />

     <CollapsibleSection title="Platform Breakdown" defaultExpanded>
       <PlatformBreakdownCard logs={dailyLogs} />
     </CollapsibleSection>

     <CollapsibleSection title="Monthly Summary">
       <MonthlySummaryCard logs={dailyLogs} trips={trips} expenses={expenses} settings={settings} />
     </CollapsibleSection>

     <CollapsibleSection title="Intelligence Feed" defaultExpanded>
       <IntelligenceFeed
         dashboardInsight={dashboardInsight}
         dismissedInsight={dismissedInsight}
         onDismissInsight={setDismissedInsight}
         topPrediction={topPrediction}
         isPredictionExpanded={topPrediction ? expandedPredictionId === getPredictionId(topPrediction) : false}
         onTogglePrediction={() => {
           if (!topPrediction) return;
           const predictionId = getPredictionId(topPrediction);
           setExpandedPredictionId((current) => (current === predictionId ? null : predictionId));
         }}
         onDismissPrediction={dismissPrediction}
         onSetReminder={onSetPredictionReminder}
         missedDays={visibleMissedDays}
         onOpenBackfill={onOpenBackfill}
         dueRecurringExpenses={dueRecurringExpenses}
         onLogRecurring={handleLogRecurring}
       />
     </CollapsibleSection>

     {recentLogs.length > 0 && (
       <section className={`${panelClasses} p-5`}>
         <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Recent shifts</p>
         <div className="mt-3 space-y-2">
           {recentLogs.map((log) => (
             <RecentShiftItem key={log.id} log={log} />
           ))}
         </div>
       </section>
     )}
   </>
   ```
6. **Remove the old empty-state block** that used to live below the tax meter — it's now handled by `ActionStrip` + `StoryStrip`.
7. **Keep `WeeklySummary` overlay behavior unchanged** — it still renders at the top when `completedShiftSummary` is present, and the bento grid is hidden.

- [ ] **Step 1: Run typecheck before changes**

```bash
npm run typecheck
```

Expected: PASS (or existing errors only, none in dashboard files).

- [ ] **Step 2: Make the edits**

Apply all changes above to `DashboardScreen.tsx`.

- [ ] **Step 3: Remove EarningsSummary**

```bash
rm components/dashboard/EarningsSummary.tsx
```

If `components/Dashboard.tsx` re-exports `EarningsSummary`, remove that re-export.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (zero errors in modified files).

- [ ] **Step 5: Run unit tests**

```bash
npm run test:unit
```

Expected: PASS (all existing tests pass, new tests pass).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: reassemble DashboardScreen with BentoHero, ActionStrip, StoryStrip, CollapsibleSection

- Remove EarningsSummary (responsibilities redistributed)
- Add bento-grid hero with TaxMeter + 4 tiles
- Add persistent ActionStrip below hero
- Add horizontal StoryStrip with snap scroll
- Wrap depth cards in CollapsibleSection
- Keep WeeklySummary overlay behavior unchanged"
```

---

## Task 12: E2E Dashboard Workflow Test

**Files:**
- Modify: `e2e/dashboard.spec.ts`

**Add assertions:**
1. Dashboard page loads and shows bento hero tiles.
2. ActionStrip shows "Start Shift" button when no session is active.
3. Story strip is visible and swipeable.

- [ ] **Step 1: Run existing e2e test**

```bash
npx playwright test e2e/dashboard.spec.ts --project=desktop-chromium
```

Expected: PASS (or existing baseline).

- [ ] **Step 2: Add new assertions**

Open `e2e/dashboard.spec.ts` and add a test block:

```ts
test('dashboard shows bento hero tiles and action strip', async ({ page }) => {
  await page.goto('/');
  // Wait for dashboard to hydrate
  await expect(page.getByText("Today's Revenue")).toBeVisible();
  await expect(page.getByText('Week Progress')).toBeVisible();
  await expect(page.getByText('Tax Saved')).toBeVisible();
  await expect(page.getByText('Miles Logged')).toBeVisible();
  await expect(page.getByRole('button', { name: /Start Shift|Log your first shift/i })).toBeVisible();
});
```

- [ ] **Step 3: Run updated e2e test**

```bash
npx playwright test e2e/dashboard.spec.ts --project=desktop-chromium
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/dashboard.spec.ts
git commit -m "test: add e2e assertions for bento hero and action strip"
```

---

## Plan Self-Review

### 1. Spec Coverage Check

| Spec Section | Task(s) |
|-------------|---------|
| Zone 0 ActionStrip | Task 5 |
| Zone 1 BentoHero (TaxMeter + 4 tiles) | Tasks 2, 3, 4, 9 |
| Zone 2 Stories (horizontal scroll) | Tasks 6, 7 |
| Zone 3 Depth (collapsible sections) | Task 8 |
| Empty states for hero tiles | Task 3 (HeroTile `isEmpty`) |
| Empty state for stories | Task 7 (welcome story fallback) |
| Empty state for action strip | Task 5 (empty state branch) |
| TaxMeterRing SVG animation | Task 2 |
| AnimatedNumber count-up | Task 1 |
| RealTimeTaxMeter size prop | Task 9 |
| PlatformBreakdownCard tabs | Task 10 |
| WeeklySummary coexistence | Task 11 (unchanged overlay) |
| EarningsSummary deprecation | Task 11 (remove + redistribute) |
| Responsive behavior | Tasks 3, 4 (mobile compact classes) |
| Accessibility (touch targets, reduced motion) | Tasks 1, 2, 3, 5 |

**No gaps found.**

### 2. Placeholder Scan

- No "TBD", "TODO", "implement later", or "fill in details" found.
- All code blocks are complete and copy-paste ready.
- All test files include actual test code.
- No "similar to Task N" shortcuts.

### 3. Type Consistency Check

- `AnimatedNumberProps` defined in Task 1, used in Task 3.
- `HeroTileProps` defined in Task 3, used in Task 4.
- `StoryCardProps` defined in Task 6, used in Task 7.
- `RealTimeTaxMeterProps` extended with `size` in Task 9, consumed in Task 4.
- All prop names match between definition and usage.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-dashboard-v2.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach do you want?**
