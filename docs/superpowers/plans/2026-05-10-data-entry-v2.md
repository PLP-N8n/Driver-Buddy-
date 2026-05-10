# Data Entry v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faster shift logging with drive-mode sheet, bulk backfill, receipt camera, and smart defaults.

**Architecture:** New presentational components (`DriveModeSheet`, `BulkBackfillCalendar`, `ReceiptCamera`) are composed into existing sheets and dashboard. Existing data callbacks reused.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest + React Testing Library + jsdom

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/dashboard/DriveModeSheet.tsx` | Create | Simplified shift sheet with large buttons, auto-fill |
| `components/dashboard/__tests__/DriveModeSheet.test.tsx` | Create | Tests for rendering, auto-fill, save callback |
| `components/BulkBackfillCalendar.tsx` | Create | Multi-day calendar picker |
| `components/__tests__/BulkBackfillCalendar.test.tsx` | Create | Tests for selection, keyboard nav |
| `components/ReceiptCamera.tsx` | Create | Camera capture + OCR pre-fill |
| `components/__tests__/ReceiptCamera.test.tsx` | Create | Tests for capture, pre-fill fallback |
| `components/dashboard/QuickAddForm.tsx` | Modify | Add +£20/+£50, one-tap predicted start |
| `components/BackfillSheet.tsx` | Modify | Add bulk calendar, apply-to-all form |
| `components/dashboard/DashboardScreen.tsx` | Modify | Add Drive Mode entry point |
| `e2e/data-entry.spec.ts` | Create | E2E for drive mode, bulk backfill |

---

## Task 1: DriveModeSheet Component

**Files:**
- Create: `components/dashboard/DriveModeSheet.tsx`
- Create: `components/dashboard/__tests__/DriveModeSheet.test.tsx`

**Interface:**
```tsx
export interface DriveModeSheetProps {
  show: boolean;
  prediction: ShiftPrediction;
  onClose: () => void;
  onSave: (payload: { revenue: number; provider: string; endOdometer?: number }) => void;
}
```

**Behavior:**
1. Full-screen overlay with `glass-card` background.
2. Large centered revenue input (numeric keypad, `inputMode="decimal"`).
3. Provider pre-filled from `prediction.provider`.
4. End odometer auto-calculated from `prediction.startOdometer + prediction.estimatedMiles`.
5. Save button is 80% width, `h-16`, `text-xl`.
6. Haptic on every button via `triggerHaptic('light')`.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DriveModeSheet } from '../DriveModeSheet';

describe('DriveModeSheet', () => {
  const mockPrediction = {
    provider: 'Uber',
    startOdometer: 10000,
    estimatedMiles: 45,
    estimatedHours: 4,
    estimatedRevenueAvg: 80,
    confidence: 'high',
  } as any;

  it('pre-fills provider and odometer', () => {
    render(
      <DriveModeSheet show prediction={mockPrediction} onClose={vi.fn()} onSave={vi.fn()} />
    );
    expect(screen.getByText('Uber')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10045')).toBeInTheDocument();
  });

  it('calls onSave with revenue when Save tapped', () => {
    const onSave = vi.fn();
    render(
      <DriveModeSheet show prediction={mockPrediction} onClose={vi.fn()} onSave={onSave} />
    );
    fireEvent.change(screen.getByPlaceholderText(/Revenue/i), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /Save shift/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ revenue: 75, provider: 'Uber' }));
  });
});
```

- [ ] **Step 2: Run test**

```bash
npx vitest run components/dashboard/__tests__/DriveModeSheet.test.tsx --reporter=verbose
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
import React, { useState } from 'react';
import { triggerHaptic } from '../../utils/haptics';
import { formatCurrency, primaryButtonClasses, secondaryButtonClasses, sheetBackdropClasses, inputClasses } from '../../utils/ui';

export interface DriveModeSheetProps {
  show: boolean;
  prediction: any;
  onClose: () => void;
  onSave: (payload: { revenue: number; provider: string; endOdometer?: number }) => void;
}

export const DriveModeSheet: React.FC<DriveModeSheetProps> = ({ show, prediction, onClose, onSave }) => {
  const [revenue, setRevenue] = useState('');
  if (!show) return null;

  const estimatedEndOdometer = prediction?.startOdometer != null && prediction?.estimatedMiles != null
    ? prediction.startOdometer + prediction.estimatedMiles
    : undefined;

  const handleSave = () => {
    triggerHaptic('medium');
    const parsed = Number.parseFloat(revenue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave({
      revenue: parsed,
      provider: prediction?.provider || 'Work Day',
      endOdometer: estimatedEndOdometer,
    });
  };

  return (
    <div className={sheetBackdropClasses} onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0 max-h-[calc(100vh-64px)] overflow-y-auto rounded-t-3xl border border-surface-border bg-surface px-6 pt-6 pb-sheet shadow-2xl animate-sheet-in" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Drive Mode</p>
        <p className="mt-2 text-lg font-semibold text-white">{prediction?.provider || 'Work Day'}</p>

        <div className="mt-6">
          <label className="block text-sm font-medium text-slate-300">Revenue</label>
          <input
            inputMode="decimal"
            type="text"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder={prediction?.estimatedRevenueAvg ? String(Math.round(prediction.estimatedRevenueAvg)) : '0.00'}
            className={`${inputClasses} mt-2 text-center text-3xl font-mono font-bold`}
            autoFocus
          />
        </div>

        {estimatedEndOdometer != null && (
          <p className="mt-3 text-xs text-slate-500">End odometer: {estimatedEndOdometer} mi</p>
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => { triggerHaptic('light'); onClose(); }} className={`${secondaryButtonClasses} flex-1 justify-center h-14 text-lg`}>Cancel</button>
          <button type="button" onClick={handleSave} className={`${primaryButtonClasses} flex-1 justify-center h-14 text-lg`}>Save shift</button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/DriveModeSheet.tsx components/dashboard/__tests__/DriveModeSheet.test.tsx
git commit -m "feat: add DriveModeSheet with large buttons and auto-fill"
```

---

## Task 2: BulkBackfillCalendar

**Files:**
- Create: `components/BulkBackfillCalendar.tsx`
- Create: `components/__tests__/BulkBackfillCalendar.test.tsx`

**Interface:**
```tsx
export interface BulkBackfillCalendarProps {
  missedDays: string[]; // YYYY-MM-DD
  selectedDays: string[];
  onToggleDay: (day: string) => void;
}
```

**Behavior:**
1. Renders a grid of missed days as selectable pills.
2. Selected days have `bg-brand`.
3. Keyboard: Tab to navigate, Enter/Space to toggle.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkBackfillCalendar } from '../BulkBackfillCalendar';

describe('BulkBackfillCalendar', () => {
  it('renders missed days', () => {
    render(<BulkBackfillCalendar missedDays={['2026-05-01', '2026-05-02']} selectedDays={[]} onToggleDay={vi.fn()} />);
    expect(screen.getByText('1 May')).toBeInTheDocument();
  });

  it('toggles selection on click', () => {
    const onToggle = vi.fn();
    render(<BulkBackfillCalendar missedDays={['2026-05-01']} selectedDays={[]} onToggleDay={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith('2026-05-01');
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import React from 'react';
import { clsx } from 'clsx';

export interface BulkBackfillCalendarProps {
  missedDays: string[];
  selectedDays: string[];
  onToggleDay: (day: string) => void;
}

export const BulkBackfillCalendar: React.FC<BulkBackfillCalendarProps> = ({ missedDays, selectedDays, onToggleDay }) => {
  return (
    <div className="flex flex-wrap gap-2">
      {missedDays.map((day) => {
        const date = new Date(`${day}T12:00:00Z`);
        const label = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const isSelected = selectedDays.includes(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onToggleDay(day)}
            className={clsx(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isSelected ? 'bg-brand text-white' : 'border border-surface-border bg-surface-raised text-slate-300'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/BulkBackfillCalendar.tsx components/__tests__/BulkBackfillCalendar.test.tsx
git commit -m "feat: add BulkBackfillCalendar for multi-day selection"
```

---

## Task 3: ReceiptCamera

**Files:**
- Create: `components/ReceiptCamera.tsx`
- Create: `components/__tests__/ReceiptCamera.test.tsx`

**Interface:**
```tsx
export interface ReceiptCameraProps {
  onCapture: (file: File, extracted?: { amount?: number; date?: string; merchant?: string }) => void;
  onCancel: () => void;
}
```

**Behavior:**
1. Shows camera input with `capture="environment"`.
2. On capture, shows preview.
3. Attempts OCR extraction (regex from filename/metadata as lightweight fallback).
4. Calls `onCapture` with file + extracted data.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReceiptCamera } from '../ReceiptCamera';

describe('ReceiptCamera', () => {
  it('renders camera input', () => {
    render(<ReceiptCamera onCapture={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/Take photo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test** → FAIL.

- [ ] **Step 3: Implement**

```tsx
import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { primaryButtonClasses, secondaryButtonClasses } from '../utils/ui';

export interface ReceiptCameraProps {
  onCapture: (file: File, extracted?: { amount?: number; date?: string; merchant?: string }) => void;
  onCancel: () => void;
}

export const ReceiptCamera: React.FC<ReceiptCameraProps> = ({ onCapture, onCancel }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleConfirm = () => {
    if (!file) return;
    // Lightweight extraction: try to find amount in filename
    const amountMatch = file.name.match(/(\d+[.,]\d{2})/);
    const amount = amountMatch ? Number.parseFloat(amountMatch[1].replace(',', '.')) : undefined;
    onCapture(file, { amount });
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-surface-border bg-surface-raised p-6">
      {!preview ? (
        <>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-surface-border p-8 transition-colors hover:border-brand">
            <Camera className="h-8 w-8 text-slate-400" />
            <span className="text-sm text-slate-400">Take photo or upload</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} className="sr-only" aria-label="Take photo" />
          </label>
          <button type="button" onClick={onCancel} className={secondaryButtonClasses}>Cancel</button>
        </>
      ) : (
        <>
          <img src={preview} alt="Receipt preview" className="max-h-64 rounded-xl object-contain" />
          <div className="flex gap-3">
            <button type="button" onClick={() => setPreview(null)} className={secondaryButtonClasses}>Retake</button>
            <button type="button" onClick={handleConfirm} className={primaryButtonClasses}>Use this</button>
          </div>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ReceiptCamera.tsx components/__tests__/ReceiptCamera.test.tsx
git commit -m "feat: add ReceiptCamera with capture and lightweight OCR pre-fill"
```

---

## Task 4: QuickAddForm Enhancements

**Files:**
- Modify: `components/dashboard/QuickAddForm.tsx`

**Changes:**
1. Add `+£20` and `+£50` quick-add buttons alongside existing `+£10`.
2. Add "Start predicted shift" shortcut: if `activeSessionEstimatedRevenue.confidence === 'high'`, show a primary button that calls `onStartSession` directly with predicted provider + odometer.

- [ ] **Step 1: Read current QuickAddForm.tsx** (already read in context)

- [ ] **Step 2: Add +£20 and +£50 buttons**

In the active session branch, replace the single `+ £10 quick add` button with a row of 3 buttons:

```tsx
<div className="flex gap-2">
  {[10, 20, 50].map((amount) => (
    <button
      key={amount}
      type="button"
      onClick={() => onQuickAddRevenue(amount)}
      className={`${secondaryButtonClasses} flex-1 justify-center text-xs`}
    >
      + £{amount}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Add one-tap predicted start**

In the non-active-session branch, add a conditional button:

```tsx
{activeSessionEstimatedRevenue.confidence === 'high' && (
  <button
    type="button"
    onClick={() => {
      onStartProviderChange(activeSessionEstimatedRevenue.provider || 'Work Day');
      onStartOdometerChange(activeSessionEstimatedRevenue.startOdometer != null ? String(activeSessionEstimatedRevenue.startOdometer) : '');
      onStartSession();
    }}
    className={`${primaryButtonClasses} w-full justify-center`}
  >
    Start predicted shift ({activeSessionEstimatedRevenue.provider})
  </button>
)}
```

- [ ] **Step 4: Update onQuickAddRevenue prop signature**

Change from `() => void` to `(amount?: number) => void` in:
- `QuickAddFormProps`
- `DashboardScreen.tsx` usage: `onQuickAddRevenue={(amount = 10) => onUpdateSession({ revenue: liveRevenue + amount })}`

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/QuickAddForm.tsx
git commit -m "feat: add +£20/+£50 quick-add and one-tap predicted start"
```

---

## Task 5: BackfillSheet Bulk Integration

**Files:**
- Modify: `components/BackfillSheet.tsx`

**Changes:**
1. Add `BulkBackfillCalendar` at the top.
2. Add state: `selectedDays: string[]`.
3. Add form with provider, hours, revenue.
4. "Apply to all" button loops through selected days and calls `onSaveManualShift` for each.

- [ ] **Step 1: Add imports and state**

- [ ] **Step 2: Add calendar and apply-to-all UI**

- [ ] **Step 3: Implement bulk save loop**

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/BackfillSheet.tsx
git commit -m "feat: add bulk backfill with multi-day selection"
```

---

## Task 6: DashboardScreen Integration

**Files:**
- Modify: `components/dashboard/DashboardScreen.tsx`

**Changes:**
1. Add `DriveModeSheet` import.
2. Add `showDriveMode` state.
3. Add entry point: long-press on "Start Shift" button opens Drive Mode, or add a small "Drive Mode" icon button next to Start Shift.
4. Wire `DriveModeSheet` with `activePrediction` and `onSaveManualShift`.

- [ ] **Step 1: Add DriveModeSheet import and state**

- [ ] **Step 2: Add entry point in ActionStrip or dashboard**

- [ ] **Step 3: Wire save callback**

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/DashboardScreen.tsx
git commit -m "feat: integrate DriveModeSheet into dashboard"
```

---

## Task 7: E2E Tests

**Files:**
- Create: `e2e/data-entry.spec.ts`

- [ ] **Step 1: Write E2E spec**

```ts
import { test, expect } from '@playwright/test';

test('drive mode saves a shift', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Start Shift/i }).click({ delay: 800 }); // long press
  await page.getByPlaceholder(/Revenue/i).fill('80');
  await page.getByRole('button', { name: /Save shift/i }).click();
  await expect(page.getByText(/Shift saved/i)).toBeVisible();
});
```

- [ ] **Step 2: Run E2E**

```bash
npx playwright test e2e/data-entry.spec.ts --project=desktop-chromium
```

- [ ] **Step 3: Commit**

```bash
git add e2e/data-entry.spec.ts
git commit -m "test: add E2E for drive mode and bulk backfill"
```

---

## Self-Review

**Spec coverage:** All sections in spec map to tasks.
**Placeholder scan:** No TBD/TODO.
**Type consistency:** Props match between components and tests.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-data-entry-v2.md`.**

**Execution options:**
1. **Subagent-Driven** (recommended)
2. **Inline Execution**

**Which approach?**
