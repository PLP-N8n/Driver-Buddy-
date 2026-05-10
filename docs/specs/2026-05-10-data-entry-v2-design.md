# Data Entry v2 — Smart, Fast, Drive-Mode Design Spec

**Date:** 2026-05-10  
**Scope:** Faster logging, smart defaults, drive-mode entry, receipt capture polish  
**Approach:** Progressive enhancement of existing QuickAddForm + new DriveMode sheet

---

## 1. Problem Statement

Current data entry works but has friction:
- Starting a shift requires opening a sheet, picking provider, optional odometer — 3 taps minimum.
- Logging a past shift (manual entry) requires date, provider, hours, earnings, odometer — 5+ fields.
- No way to log a shift while actively driving (safety hazard to open app).
- Receipt capture exists but is buried in settings and has no camera UI.
- Bulk entry for missed days requires opening backfill one day at a time.

## 2. Design Goals

1. **One-tap start** — Start a shift from the dashboard with a single tap (provider pre-filled from prediction).
2. **Drive-mode logging** — A simplified "Drive Mode" sheet with large buttons, voice-friendly, minimal fields.
3. **Bulk backfill** — Multi-day selector in backfill to log several missed days at once.
4. **Receipt camera** — Inline camera capture with auto-crop and expense pre-fill from OCR.
5. **Smart defaults** — Predictions already exist; surface them more aggressively (pre-fill earnings, hours, odometer).

## 3. Layout & Components

### Drive Mode Sheet

A new bottom sheet triggered from dashboard or notification:
- **Large tap targets** — Minimum 64×64px buttons.
- **Minimal fields** — Only revenue (one number). Odometer auto-filled from prediction. Provider auto-filled.
- **Voice-friendly** — Large text, high contrast, works with screen reader.
- **Swipe gestures** — Swipe up to expand, swipe down to dismiss.
- **Haptic feedback** on every button tap.

### Bulk Backfill

Modify existing `BackfillSheet`:
- Add a **multi-day calendar picker** at the top.
- User selects multiple missed days.
- Below the calendar, a single form with provider, hours, revenue.
- "Apply to all selected days" button.
- Each selected day gets the same shift data logged.
- Confirmation: "Logged X shifts" toast.

### Receipt Camera

New `ReceiptCamera` component:
- Inline camera view (uses `<input type="file" accept="image/*" capture="environment">` for PWA).
- After capture, shows preview with crop overlay.
- Extracts date, amount, merchant via OCR (optional, graceful fallback).
- Pre-fills expense form with extracted data.
- If OCR fails, user edits manually.

### QuickAddForm Enhancements

- **One-tap start** option: If `activePrediction.confidence === 'high'`, show "Start predicted shift" button on dashboard that bypasses the start sheet entirely.
- **Earnings quick-add** on active session: `+£10`, `+£20`, `+£50` buttons instead of just `+£10`.
- **End shift one-tap**: If session is active and odometer was captured at start, auto-calculate end odometer from miles driven + prompt for fuel only.

## 4. Data Flow

- No new data stores.
- Drive Mode uses existing `onStartSession`, `onUpdateSession`, `onCompleteSession` callbacks.
- Bulk backfill loops through selected dates calling `onSaveManualShift` for each.
- Receipt camera creates a new `Expense` object and calls `onAddExpense`.

## 5. Component Breakdown

### New Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `DriveModeSheet` | `components/dashboard/DriveModeSheet.tsx` | Simplified shift logging with large buttons, auto-fill. |
| `ReceiptCamera` | `components/ReceiptCamera.tsx` | Camera capture, preview, OCR pre-fill. |
| `BulkBackfillCalendar` | `components/BulkBackfillCalendar.tsx` | Multi-day calendar picker for bulk entry. |

### Modified Components

| Component | Change |
|-----------|--------|
| `QuickAddForm.tsx` | Add `+£20`, `+£50` quick-add buttons. Add "One-tap start predicted shift" shortcut. |
| `BackfillSheet.tsx` | Add `BulkBackfillCalendar` at top, apply-to-all form, loop save. |
| `DashboardScreen.tsx` | Add "Drive Mode" entry point (long-press Start Shift or dedicated button). |

## 6. Empty States

- Drive Mode: If no prediction available, show "Set your usual provider in settings" hint.
- Receipt Camera: If camera permission denied, show "Upload from gallery" fallback.
- Bulk Backfill: If no missed days, show "You're all caught up!" celebration.

## 7. Accessibility & Performance

- Drive Mode buttons: `aria-label` on every control, `role="button"`.
- Receipt Camera: `capture="environment"` for back camera, graceful fallback to gallery.
- Bulk Backfill: Keyboard navigable calendar (arrow keys, Enter to select).
- No new dependencies. OCR is optional; if not available, skip pre-fill.

## 8. Out of Scope

- True voice recognition (Siri/Google Assistant integration).
- Real-time OCR library integration (use simple regex on image metadata as fallback).
- Cloud receipt processing (keep local-only).

## 9. Success Criteria

- [ ] Start a predicted shift in 1 tap from dashboard.
- [ ] Log a past shift in Drive Mode with ≤ 2 fields.
- [ ] Bulk backfill 7 missed days in one flow.
- [ ] Capture receipt and pre-fill expense in ≤ 3 taps.
- [ ] All new flows respect `prefers-reduced-motion`.
