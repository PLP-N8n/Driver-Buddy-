# remove-feature-gating — requirements

## R1 — All feature tabs SHALL be available from first launch

**The system SHALL** render the Mileage, Expenses, Tax, Debt, and Bonus tabs unconditionally for every user, with no dependence on `playerStats.totalLogs`, `dbt_advanced`, or any other "earn-the-feature" flag.

**Acceptance:** a fresh install (cleared localStorage) shows all tabs in the bottom nav and renders each route without redirect; verified by Playwright/manual smoke on a clean profile.

## R2 — The "unlocked all features" toast SHALL be removed

**The system SHALL NOT** emit the `"You've unlocked all features"` toast (currently fired in `hooks/usePersistence.ts:126-131`).

**Acceptance:** code search for `unlocked all features` returns no matches; logging a 3rd shift on a fresh install shows no such toast.

## R3 — Legacy gating localStorage keys SHALL be retired

**The system SHALL** stop reading and stop writing `dbt_advanced` and `dbt_featuresUnlocked`. A one-shot cleanup SHALL remove these keys from existing installs on first load after upgrade.

**Acceptance:** `grep -rn 'dbt_advanced\|dbt_featuresUnlocked' src components hooks utils services` returns only the cleanup line; after the cleanup runs once, both keys are absent from `localStorage`.

## R4 — `isAdvancedUser` prop SHALL be removed from downstream components

**The system SHALL** drop the `isAdvancedUser` parameter from `TaxLogic` and any other consumer that branches on it. Components SHALL render their full UI unconditionally.

**Acceptance:** `grep -rn 'isAdvancedUser' components hooks` returns no matches.

## R5 — The forced redirect away from the Debt tab SHALL be removed

**The system SHALL NOT** auto-navigate the user away from `activeTab === 'debt'` based on advanced-user status. The Debt tab is selectable from first launch.

**Acceptance:** open a fresh install, tap "Debt" — the route renders, no redirect to `dashboard`.

## R6 — Onboarding copy SHALL NOT promise unlocks

**The system SHALL** review `components/OnboardingModal.tsx` and any first-run copy; any text that promises a feature unlock after N shifts SHALL be removed or rewritten as a neutral "log shifts to track your earnings" line.

**Acceptance:** code search for `unlock`, `advanced`, `gradually` in onboarding copy returns no gating language.

## R7 — Existing-user upgrade SHALL be invisible

**The system SHALL** make the migration silent — no banner, no toast, no modal. A user who already had the gate unlocked sees no behaviour change; a user who was still gated suddenly has all tabs (no announcement).

**Acceptance:** seed two profiles (totalLogs=0 and totalLogs=10), upgrade both — neither shows a notification on next load; both see the same tab list.

## R8 — Regression: existing data and routes SHALL be untouched

**The system SHALL NOT** change any data model, persistence key (other than R3 cleanup), or route URL. Tax calculations, sync flows, and existing screens render identically for users who were already past the gate.

**Acceptance:** `cd workers/sync-api && npm test && cd ../.. && npm test` (or equivalent) passes; manual smoke on a profile with >3 logs shows no behavioural difference.
