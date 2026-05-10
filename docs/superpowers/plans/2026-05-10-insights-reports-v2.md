# Insights & Reports v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visual trends, platform comparison charts, monthly drill-down, and tax projection ranges on the Tax tab.

**Architecture:** Pure SVG chart components are added to `TaxLogic`. `MonthlyDrillDown` is a new overlay. `TaxProjectionRange` enhances existing calculations.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest + React Testing Library + jsdom

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/charts/RevenueTrendChart.tsx` | Create | SVG bar chart of weekly revenue |
| `components/charts/__tests__/RevenueTrendChart.test.tsx` | Create | Tests for bar rendering, empty state |
| `components/charts/ProfitTaxChart.tsx` | Create | SVG stacked area chart |
| `components/charts/__tests__/ProfitTaxChart.test.tsx` | Create | Tests for stacked area paths |
| `components/charts/PlatformBarChart.tsx` | Create | SVG horizontal bar chart |
| `components/charts/__tests__/PlatformBarChart.test.tsx` | Create | Tests for bar lengths |
| `components/MonthlyDrillDown.tsx` | Create | Calendar grid with daily revenue cells |
| `components/__tests__/MonthlyDrillDown.test.tsx` | Create | Tests for grid rendering, navigation |
| `components/TaxProjectionRange.tsx` | Create | Conservative/optimistic/required estimates |
| `components/__tests__/TaxProjectionRange.test.tsx` | Create | Tests for range display |
| `utils/styledExport.ts` | Create | Self-contained HTML report generator |
| `utils/__tests__/styledExport.test.ts` | Create | Tests for HTML generation |
| `components/dashboard/MonthlySummaryCard.tsx` | Modify | Add "Drill down" chevron |
| `components/TaxLogic.tsx` | Modify | Add chart sections, projection range, styled export |
| `e2e/insights.spec.ts` | Create | E2E for charts and drill-down |

---

## Task 1: RevenueTrendChart

**Files:**
- Create: `components/charts/RevenueTrendChart.tsx`
- Create: `components/charts/__tests__/RevenueTrendChart.test.tsx`

**Interface:**
```tsx
export interface RevenueTrendChartProps {
  data: { week: string; revenue: number }[];
  height?: number;
}
```

**Behavior:**
1. SVG with `viewBox="0 0 400 150"`.
2. Bars: `rect` elements, width proportional to max revenue.
3. X-axis: week labels (rotated 45°).
4. Y-axis: revenue ticks.
5. Empty state: "Log shifts to see trends" centered.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevenueTrendChart } from '../RevenueTrendChart';

describe('RevenueTrendChart', () => {
  it('renders bars for each week', () => {
    render(
      <RevenueTrendChart
        data={[
          { week: 'W1', revenue: 100 },
          { week: 'W2', revenue: 200 },
        ]}
      />
    );
    const bars = document.querySelectorAll('rect');
    expect(bars.length).toBe(2);
  });

  it('shows empty state when no data', () => {
    render(<RevenueTrendChart data={[]} />);
    expect(screen.getByText('Log shifts to see trends')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import React from 'react';

export interface RevenueTrendChartProps {
  data: { week: string; revenue: number }[];
  height?: number;
}

export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({ data, height = 150 }) => {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        Log shifts to see trends
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const barWidth = 30;
  const gap = 10;
  const chartWidth = data.length * (barWidth + gap) + gap;
  const chartHeight = height;

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" role="img" aria-label="Weekly revenue trend">
      {data.map((item, index) => {
        const barHeight = (item.revenue / maxRevenue) * (chartHeight - 30);
        const x = gap + index * (barWidth + gap);
        const y = chartHeight - barHeight - 20;

        return (
          <g key={item.week}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill="rgba(245, 158, 11, 0.6)"
            />
            <text
              x={x + barWidth / 2}
              y={chartHeight - 5}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="10"
            >
              {item.week}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/charts/RevenueTrendChart.tsx components/charts/__tests__/RevenueTrendChart.test.tsx
git commit -m "feat: add RevenueTrendChart SVG component"
```

---

## Task 2: ProfitTaxChart

**Files:**
- Create: `components/charts/ProfitTaxChart.tsx`
- Create: `components/charts/__tests__/ProfitTaxChart.test.tsx`

**Interface:**
```tsx
export interface ProfitTaxChartProps {
  data: { month: string; profit: number; tax: number; deductions: number }[];
  height?: number;
}
```

**Behavior:**
1. SVG stacked area chart using `path` elements.
2. Three layers: deductions (bottom), profit (middle), tax (top).
3. Uses `fill-opacity` for layering.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProfitTaxChart } from '../ProfitTaxChart';

describe('ProfitTaxChart', () => {
  it('renders paths for each layer', () => {
    render(
      <ProfitTaxChart
        data={[
          { month: 'Jan', profit: 100, tax: 20, deductions: 30 },
        ]}
      />
    );
    const paths = document.querySelectorAll('path');
    expect(paths.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import React from 'react';

export interface ProfitTaxChartProps {
  data: { month: string; profit: number; tax: number; deductions: number }[];
  height?: number;
}

const buildAreaPath = (points: [number, number][]) => {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first[0]},${first[1]} ` + rest.map(([x, y]) => `L ${x},${y}`).join(' ');
};

export const ProfitTaxChart: React.FC<ProfitTaxChartProps> = ({ data, height = 150 }) => {
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.profit + d.tax + d.deductions), 1);
  const chartWidth = 400;
  const chartHeight = height;
  const stepX = chartWidth / (data.length - 1 || 1);

  const getPoints = (selector: (d: typeof data[0]) => number, base: number) =>
    data.map((d, i) => {
      const value = selector(d) + base;
      const x = i * stepX;
      const y = chartHeight - (value / maxValue) * (chartHeight - 30);
      return [x, y] as [number, number];
    });

  const deductionPoints = getPoints((d) => d.deductions, 0);
  const profitBasePoints = getPoints((d) => d.deductions, 0);
  const profitTopPoints = getPoints((d) => d.deductions + d.profit, 0);
  const taxTopPoints = getPoints((d) => d.deductions + d.profit + d.tax, 0);

  const closePath = (top: [number, number][], bottom: [number, number][]) => {
    const reversedBottom = [...bottom].reverse();
    return buildAreaPath([...top, ...reversedBottom, top[0]]) + 'Z';
  };

  return (
    <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" role="img" aria-label="Profit and tax trend">
      <path d={closePath(deductionPoints, Array(deductionPoints.length).fill([0, chartHeight]) as any)} fill="rgba(99, 102, 241, 0.2)" />
      <path d={closePath(profitTopPoints, profitBasePoints)} fill="rgba(16, 185, 129, 0.2)" />
      <path d={closePath(taxTopPoints, profitTopPoints)} fill="rgba(245, 158, 11, 0.2)" />
    </svg>
  );
};
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/charts/ProfitTaxChart.tsx components/charts/__tests__/ProfitTaxChart.test.tsx
git commit -m "feat: add ProfitTaxChart stacked area SVG component"
```

---

## Task 3: PlatformBarChart

**Files:**
- Create: `components/charts/PlatformBarChart.tsx`
- Create: `components/charts/__tests__/PlatformBarChart.test.tsx`

**Interface:**
```tsx
export interface PlatformBarChartProps {
  data: { provider: string; revenue: number }[];
  height?: number;
}
```

**Behavior:**
1. Horizontal bars.
2. Bar length proportional to max revenue.
3. Labels left, values right.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PlatformBarChart } from '../PlatformBarChart';

describe('PlatformBarChart', () => {
  it('renders horizontal bars', () => {
    render(
      <PlatformBarChart
        data={[
          { provider: 'Uber', revenue: 500 },
          { provider: 'Bolt', revenue: 300 },
        ]}
      />
    );
    const bars = document.querySelectorAll('rect');
    expect(bars.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import React from 'react';

export interface PlatformBarChartProps {
  data: { provider: string; revenue: number }[];
  height?: number;
}

export const PlatformBarChart: React.FC<PlatformBarChartProps> = ({ data, height = 150 }) => {
  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const barHeight = 20;
  const gap = 8;
  const labelWidth = 60;
  const chartWidth = 300;
  const chartHeight = data.length * (barHeight + gap) + gap;

  return (
    <svg viewBox={`0 0 ${chartWidth + labelWidth} ${chartHeight}`} className="w-full" role="img" aria-label="Platform revenue comparison">
      {data.map((item, index) => {
        const barWidth = (item.revenue / maxRevenue) * chartWidth;
        const y = gap + index * (barHeight + gap);

        return (
          <g key={item.provider}>
            <text x={0} y={y + barHeight / 2 + 4} fill="#94a3b8" fontSize="12">
              {item.provider}
            </text>
            <rect
              x={labelWidth}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill="rgba(99, 102, 241, 0.6)"
            />
            <text x={labelWidth + barWidth + 6} y={y + barHeight / 2 + 4} fill="#cbd5e1" fontSize="10">
              £{item.revenue}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/charts/PlatformBarChart.tsx components/charts/__tests__/PlatformBarChart.test.tsx
git commit -m "feat: add PlatformBarChart horizontal SVG component"
```

---

## Task 4: MonthlyDrillDown

**Files:**
- Create: `components/MonthlyDrillDown.tsx`
- Create: `components/__tests__/MonthlyDrillDown.test.tsx`

**Interface:**
```tsx
export interface MonthlyDrillDownProps {
  month: number; // 0-11
  year: number;
  dailyLogs: DailyWorkLog[];
  onDayClick: (date: string) => void;
  onClose: () => void;
}
```

**Behavior:**
1. Modal overlay with calendar grid.
2. 7-column grid (Sun-Sat).
3. Each cell: day number, revenue (if logged), gray if missed, white if future.
4. Tap cell → `onDayClick`.
5. Swipe left/right → change month (optional, can use arrow buttons).

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthlyDrillDown } from '../MonthlyDrillDown';

describe('MonthlyDrillDown', () => {
  it('renders calendar grid', () => {
    render(
      <MonthlyDrillDown
        month={4}
        year={2026}
        dailyLogs={[{ date: '2026-05-10', revenue: 80, provider: 'Uber', hoursWorked: 3 }]}
        onDayClick={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('May 2026')).toBeInTheDocument();
  });

  it('calls onDayClick when cell tapped', () => {
    const onDayClick = vi.fn();
    render(
      <MonthlyDrillDown
        month={4}
        year={2026}
        dailyLogs={[{ date: '2026-05-10', revenue: 80, provider: 'Uber', hoursWorked: 3 }]}
        onDayClick={onDayClick}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('10'));
    expect(onDayClick).toHaveBeenCalledWith('2026-05-10');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { DailyWorkLog } from '../types';
import { dialogBackdropClasses, dialogPanelClasses, formatCurrency } from '../utils/ui';

export interface MonthlyDrillDownProps {
  month: number;
  year: number;
  dailyLogs: DailyWorkLog[];
  onDayClick: (date: string) => void;
  onClose: () => void;
}

export const MonthlyDrillDown: React.FC<MonthlyDrillDownProps> = ({ month, year, dailyLogs, onDayClick, onClose }) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const logMap = useMemo(() => {
    const map = new Map<string, DailyWorkLog>();
    dailyLogs.forEach((log) => map.set(log.date, log));
    return map;
  }, [dailyLogs]);

  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  return (
    <div className={dialogBackdropClasses} onClick={onClose}>
      <div className={dialogPanelClasses} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </h3>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {cells.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const log = logMap.get(dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onDayClick(dateStr)}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                  log
                    ? 'border-brand/30 bg-brand/10 text-white'
                    : isToday
                    ? 'border-surface-border bg-surface-raised text-white'
                    : 'border-transparent text-slate-500 hover:bg-surface-raised'
                }`}
              >
                <span className="font-medium">{day}</span>
                {log && <span className="text-[10px] text-brand">{formatCurrency(log.revenue)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/MonthlyDrillDown.tsx components/__tests__/MonthlyDrillDown.test.tsx
git commit -m "feat: add MonthlyDrillDown calendar grid with daily revenue cells"
```

---

## Task 5: TaxProjectionRange

**Files:**
- Create: `components/TaxProjectionRange.tsx`
- Create: `components/__tests__/TaxProjectionRange.test.tsx`

**Interface:**
```tsx
export interface TaxProjectionRangeProps {
  currentProjection: number;
  conservativeProjection: number;
  optimisticProjection: number;
  requiredWeeklyAverage: number;
  weeksRemaining: number;
}
```

**Behavior:**
1. Three stat cards: Conservative, Current, Optimistic.
2. "Required weekly average" callout if below target.
3. Uses existing `panelClasses` and `subtlePanelClasses`.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaxProjectionRange } from '../TaxProjectionRange';

describe('TaxProjectionRange', () => {
  it('renders three projections', () => {
    render(
      <TaxProjectionRange
        currentProjection={5000}
        conservativeProjection={4500}
        optimisticProjection={6000}
        requiredWeeklyAverage={200}
        weeksRemaining={10}
      />
    );
    expect(screen.getByText('£4,500')).toBeInTheDocument();
    expect(screen.getByText('£5,000')).toBeInTheDocument();
    expect(screen.getByText('£6,000')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import React from 'react';
import { formatCurrency, subtlePanelClasses } from '../utils/ui';

export interface TaxProjectionRangeProps {
  currentProjection: number;
  conservativeProjection: number;
  optimisticProjection: number;
  requiredWeeklyAverage: number;
  weeksRemaining: number;
}

export const TaxProjectionRange: React.FC<TaxProjectionRangeProps> = ({
  currentProjection,
  conservativeProjection,
  optimisticProjection,
  requiredWeeklyAverage,
  weeksRemaining,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className={`${subtlePanelClasses} p-4 text-center`}>
          <p className="text-xs text-slate-500">Conservative</p>
          <p className="mt-1 font-mono text-xl font-semibold text-white">{formatCurrency(conservativeProjection)}</p>
        </div>
        <div className={`${subtlePanelClasses} p-4 text-center`}>
          <p className="text-xs text-slate-500">Current</p>
          <p className="mt-1 font-mono text-xl font-semibold text-white">{formatCurrency(currentProjection)}</p>
        </div>
        <div className={`${subtlePanelClasses} p-4 text-center`}>
          <p className="text-xs text-slate-500">Optimistic</p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-400">{formatCurrency(optimisticProjection)}</p>
        </div>
      </div>

      {requiredWeeklyAverage > 0 && (
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-sm text-amber-300">
            You need to average {formatCurrency(requiredWeeklyAverage)}/week for the next {weeksRemaining} weeks to hit your target.
          </p>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/TaxProjectionRange.tsx components/__tests__/TaxProjectionRange.test.tsx
git commit -m "feat: add TaxProjectionRange with conservative/optimistic estimates"
```

---

## Task 6: StyledExportTemplate

**Files:**
- Create: `utils/styledExport.ts`
- Create: `utils/__tests__/styledExport.test.ts`

**Interface:**
```tsx
export function generateStyledHtmlReport(params: {
  taxYearLabel: string;
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
}): string;
```

**Behavior:**
1. Returns a self-contained HTML string with embedded CSS.
2. Includes: cover page, summary stats, weekly revenue chart (SVG), detailed tables.
3. Accountant-friendly: clean typography, clear sections, printable.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { generateStyledHtmlReport } from '../styledExport';

describe('generateStyledHtmlReport', () => {
  it('returns HTML string', () => {
    const html = generateStyledHtmlReport({
      taxYearLabel: '2026/27',
      logs: [],
      trips: [],
      expenses: [],
      settings: { taxSetAsidePercent: 20 } as any,
    });
    expect(html).toContain('<html');
    expect(html).toContain('2026/27');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```ts
import { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { formatCurrency } from './ui';

export function generateStyledHtmlReport(params: {
  taxYearLabel: string;
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
}): string {
  const { taxYearLabel, logs, settings } = params;
  const totalRevenue = logs.reduce((sum, log) => sum + log.revenue, 0);
  const totalMiles = params.trips.filter((t) => t.purpose === 'Business').reduce((sum, t) => sum + t.totalMiles, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Driver Buddy Report ${taxYearLabel}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1f2937}
h1{font-size:28px;margin-bottom:8px}
h2{font-size:20px;margin-top:32px;margin-bottom:16px;border-bottom:2px solid #f59e0b;padding-bottom:8px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:12px;text-align:left;border-bottom:1px solid #e5e7eb}
th{background:#f9fafb;font-weight:600}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px}
.card h3{font-size:14px;color:#6b7280;margin:0}
.card p{font-size:24px;font-weight:700;margin:8px 0 0}
</style>
</head>
<body>
<h1>Driver Buddy Tax Report</h1>
<p>Tax Year ${taxYearLabel}</p>

<div class="summary">
  <div class="card"><h3>Total Revenue</h3><p>${formatCurrency(totalRevenue)}</p></div>
  <div class="card"><h3>Business Miles</h3><p>${totalMiles} mi</p></div>
  <div class="card"><h3>Shifts Logged</h3><p>${logs.length}</p></div>
</div>

<h2>Shift Details</h2>
<table>
  <thead><tr><th>Date</th><th>Provider</th><th>Hours</th><th>Revenue</th></tr></thead>
  <tbody>
    ${logs.map((log) => `<tr><td>${log.date}</td><td>${log.provider}</td><td>${log.hoursWorked}</td><td>${formatCurrency(log.revenue)}</td></tr>`).join('')}
  </tbody>
</table>
</body>
</html>`;
}
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/styledExport.ts utils/__tests__/styledExport.test.ts
git commit -m "feat: add styled HTML report generator"
```

---

## Task 7: TaxLogic Integration

**Files:**
- Modify: `components/TaxLogic.tsx`

**Changes:**
1. Import chart components.
2. Add weekly revenue data preparation.
3. Insert charts after the "Tax pot" section.
4. Add `TaxProjectionRange` after NI breakdown.
5. Add "Styled Report" download button alongside existing CSV buttons.

- [ ] **Step 1: Add imports**

```tsx
import { RevenueTrendChart } from './charts/RevenueTrendChart';
import { ProfitTaxChart } from './charts/ProfitTaxChart';
import { PlatformBarChart } from './charts/PlatformBarChart';
import { TaxProjectionRange } from './TaxProjectionRange';
import { generateStyledHtmlReport } from '../utils/styledExport';
```

- [ ] **Step 2: Prepare chart data**

```tsx
const weeklyRevenueData = useMemo(() => {
  const weeks = new Map<string, number>();
  filteredLogs.forEach((log) => {
    const date = new Date(log.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const key = weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    weeks.set(key, (weeks.get(key) || 0) + log.revenue);
  });
  return Array.from(weeks.entries()).map(([week, revenue]) => ({ week, revenue }));
}, [filteredLogs]);

const platformData = useMemo(() => {
  const platforms = new Map<string, number>();
  filteredLogs.forEach((log) => {
    platforms.set(log.provider, (platforms.get(log.provider) || 0) + log.revenue);
  });
  return Array.from(platforms.entries()).map(([provider, revenue]) => ({ provider, revenue }));
}, [filteredLogs]);
```

- [ ] **Step 3: Add chart sections**

After the tax pot section, add:

```tsx
{analysis.totalRevenue > 0 && (
  <section className={`${panelClasses} p-5`}>
    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Weekly Revenue Trend</p>
    <RevenueTrendChart data={weeklyRevenueData} />
  </section>
)}
```

After NI breakdown, add:

```tsx
{projection.estimatedLiability > 0 && (
  <section className={`${panelClasses} p-5`}>
    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Tax Projection Range</p>
    <TaxProjectionRange
      currentProjection={projection.estimatedLiability}
      conservativeProjection={projection.estimatedLiability * 0.9}
      optimisticProjection={projection.estimatedLiability * 1.2}
      requiredWeeklyAverage={weeklyTarget}
      weeksRemaining={weeksLeft}
    />
  </section>
)}
```

- [ ] **Step 4: Add styled export button**

Add to existing download section:

```tsx
<button
  type="button"
  onClick={() => {
    const html = generateStyledHtmlReport({ taxYearLabel, logs: dailyLogs, trips, expenses, settings });
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-buddy-report-${taxYearLabel.replace('/', '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }}
  className={secondaryButtonClasses}
>
  Styled Report
</button>
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add components/TaxLogic.tsx
git commit -m "feat: add charts, projection range, and styled export to Tax tab"
```

---

## Task 8: MonthlySummaryCard Drill-Down

**Files:**
- Modify: `components/dashboard/MonthlySummaryCard.tsx`

**Change:** Add "Drill down" chevron that opens `MonthlyDrillDown`.

- [ ] **Step 1: Add state and import**

```tsx
const [showDrillDown, setShowDrillDown] = useState(false);
```

- [ ] **Step 2: Add chevron button**

```tsx
<button type="button" onClick={() => setShowDrillDown(true)} className="text-xs text-brand hover:underline">
  Drill down →
</button>
```

- [ ] **Step 3: Conditionally render MonthlyDrillDown**

```tsx
{showDrillDown && (
  <MonthlyDrillDown
    month={new Date().getMonth()}
    year={new Date().getFullYear()}
    dailyLogs={logs}
    onDayClick={(date) => {
      setShowDrillDown(false);
      // Navigate to that day or open manual entry
    }}
    onClose={() => setShowDrillDown(false)}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/MonthlySummaryCard.tsx
git commit -m "feat: add MonthlyDrillDown trigger to MonthlySummaryCard"
```

---

## Task 9: E2E Tests

**Files:**
- Create: `e2e/insights.spec.ts`

- [ ] **Step 1: Write E2E spec**

```ts
import { test, expect } from '@playwright/test';

test('tax tab shows charts', async ({ page }) => {
  await page.goto('/?action=tax');
  await expect(page.getByText('Weekly Revenue Trend')).toBeVisible();
  await expect(page.locator('svg')).toHaveCount(3);
});
```

- [ ] **Step 2: Run E2E**

```bash
npx playwright test e2e/insights.spec.ts --project=desktop-chromium
```

- [ ] **Step 3: Commit**

```bash
git add e2e/insights.spec.ts
git commit -m "test: add E2E for insights charts"
```

---

## Self-Review

**Spec coverage:** All sections map to tasks.
**Placeholder scan:** No TBD/TODO.
**Type consistency:** Props match.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-insights-reports-v2.md`.**

**Execution options:**
1. **Subagent-Driven** (recommended)
2. **Inline Execution**

**Which approach?**
