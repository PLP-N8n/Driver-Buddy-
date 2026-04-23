# end-shift-validation — requirements

## R1 — End-shift form SHALL block save when required fields are missing or invalid

**The system SHALL** prevent the "Save shift" button from invoking `onSaveShift()` when any of the following hold, and SHALL surface a per-field inline error in red:

- All provider revenue rows are empty (no platform earnings entered)
- A provider row has a non-numeric or negative `revenue` value
- `endOdometerValue` is non-empty but parses to less than the session's start odometer (where a start odometer is known)
- `fuelChoice === 'yes'` but `fuelAmountValue` is empty or non-numeric
- `extraExpenseAmountValue` is non-empty but `extraExpenseDescriptionValue` is blank (or vice-versa)
- Manual mode: `manualHoursWorked` is empty or parses to ≤ 0

**Acceptance:** clicking Save with each of the above conditions shows a red error message under the offending field and does NOT call `onSaveShift`. Verified by Playwright test that asserts the error message text and that the sheet stays open.

## R2 — Running total SHALL stay visible and update on every keystroke

**The system SHALL** keep the existing total-earnings display (currently `components/dashboard/QuickAddForm.tsx:431-435`) visible whenever the end-shift sheet is open, updating live as any provider row's `revenue` changes.

**Acceptance:** type `25` then `.50` then `0` into a provider row — the "Total earnings" line ticks through `£25`, `£25.50`, `£250.00` without refresh.

## R3 — Multi-platform total SHALL sum every row

**The system SHALL** sum every provider row's `revenue` (treating empty/invalid values as 0) and display the running total. The existing `getProviderRevenueTotal` helper SHALL be the single source of truth.

**Acceptance:** add a second platform with `15`, the total updates to the sum of both rows; remove a row, the total updates accordingly.

## R4 — Zero-earnings save SHALL prompt confirmation, not silently submit

**The system SHALL** replace the current zero-earnings warning text (`No earnings entered - are you sure?`) with a confirmation flow: clicking Save when total = 0 SHALL show "Save anyway" / "Add earnings" buttons. Only "Save anyway" submits.

**Acceptance:** click Save with all rows empty → confirmation appears; click "Save anyway" → `onSaveShift` is called; click "Add earnings" → focus returns to the first revenue input.

## R5 — Errors SHALL clear on edit

**The system SHALL** clear a field's error message when the user edits that field. Errors do NOT linger on subsequent keystrokes.

**Acceptance:** trigger the "end odometer < start odometer" error, then edit the end-odometer value — the red message disappears immediately.

## R6 — Aria attributes SHALL announce errors to assistive tech

**The system SHALL** set `aria-invalid="true"` and `aria-describedby="<error-id>"` on each invalid input. The error message element SHALL have `role="alert"`.

**Acceptance:** with VoiceOver / NVDA running, trigger an error → screen reader announces the error text.

## R7 — Existing aria-labels on revenue inputs SHALL be preserved

**The system SHALL NOT** change the `aria-label` values `'Earnings'` and `'Platform N earnings'` on the revenue inputs (`QuickAddForm.tsx:279`). Playwright selectors depend on these.

**Acceptance:** `npx playwright test` passes; `grep -n "aria-label.*Earnings\|aria-label.*Platform" components/dashboard/QuickAddForm.tsx` returns the same matches as before.

## R8 — Validation SHALL be tested

**The system SHALL** include unit / integration coverage for each validation rule in R1.

**Acceptance:** new tests in `tests/end-shift-validation.spec.ts` (Playwright) cover at least: empty-revenue block, non-numeric revenue, end-odo < start-odo, fuel-yes-empty-amount, manual-mode zero hours, save-anyway confirmation flow.
