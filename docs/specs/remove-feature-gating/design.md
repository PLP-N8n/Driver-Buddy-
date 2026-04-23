# remove-feature-gating — design

## Goal

Drop the "log 3 shifts to unlock advanced features" mechanic. The Mileage / Expenses / Tax / Debt / Bonus tabs should be visible and usable from the first launch. The "You've unlocked all features" toast and the legacy `dbt_advanced` / `dbt_featuresUnlocked` localStorage flags should be gone. New users should see the same app as power users; the gating made the product feel smaller and more juvenile than it is.

## Context

### Current implementation

`components/AppShell.tsx`:
- Line 281: `const hasEverBeenAdvanced = playerStats.totalLogs >= 3 || localStorage.getItem('dbt_advanced') === '1';`
- Line 282: `const isAdvancedUser = hasHydrated ? hasEverBeenAdvanced : true;` (defaults to advanced pre-hydrate to avoid layout flash)
- Line 287: `if (playerStats.totalLogs >= 3) localStorage.setItem('dbt_advanced', '1');`
- Lines 313–319: a `useEffect` that redirects from `activeTab === 'debt'` to `'dashboard'` when not advanced
- Lines 774, 964, 967, 1006, 1030, 36, 85, 529: branches that hide TaxAssistant, DebtManager tab, tax exports, Bonus tab, and pass `isAdvancedUser` into `TaxLogic`

`hooks/usePersistence.ts:126-131`:
```ts
useEffect(() => {
  if (!isAdvancedUser) return;
  if (localStorage.getItem('dbt_featuresUnlocked') === 'true') return;
  localStorage.setItem('dbt_featuresUnlocked', 'true');
  showToast("You've unlocked all features", 'info');
}, [isAdvancedUser, showToast]);
```

`components/TaxLogic.tsx`: receives `isAdvancedUser` prop and gates Tax Assistant card / advanced sections.

`components/OnboardingModal.tsx`: copy review needed — any "log shifts to unlock features" promise must go.

### Why this exists

The original product hypothesis: drivers find the app simpler if it grows with them. In practice the gate confuses new users (where's the Tax tab?), generates support questions, and the unlock toast feels patronising. There's no telemetry suggesting it improved retention. Removing it is the right call.

### Why a one-shot localStorage cleanup

Existing users have `dbt_advanced` and/or `dbt_featuresUnlocked` set. Leaving them in place is harmless but litters the store. A one-shot `localStorage.removeItem` on app boot keeps the store clean without a migration banner.

## Approach

### Phase 1 — Strip gating from `AppShell.tsx`

1. Delete `hasEverBeenAdvanced` and `isAdvancedUser` declarations.
2. Delete the `localStorage.setItem('dbt_advanced', '1')` line.
3. Delete the redirect-from-debt-tab `useEffect` (lines 313–319).
4. Replace every `isAdvancedUser ? <X /> : <Y />` ternary and every `if (!isAdvancedUser) return null` guard with the unconditional render.
5. Remove the `isAdvancedUser` prop from `<TaxLogic />` invocations.

### Phase 2 — Strip from `usePersistence.ts`

1. Delete the unlock-toast `useEffect` entirely.
2. Remove `isAdvancedUser` from the hook signature.
3. Update every caller of `usePersistence` to drop the now-removed argument.

### Phase 3 — Strip from `TaxLogic.tsx`

1. Remove `isAdvancedUser` from props.
2. Inline the previously-gated branches as the default render.
3. Remove the `isAdvancedUser` from any interface/type declaration.

### Phase 4 — One-shot localStorage cleanup

Add a `useEffect` (run once) at the top of `AppShell.tsx`:
```
useEffect(() => {
  try {
    localStorage.removeItem('dbt_advanced');
    localStorage.removeItem('dbt_featuresUnlocked');
  } catch {}
}, []);
```
Cheap, idempotent, no banner.

### Phase 5 — Onboarding copy review

Open `components/OnboardingModal.tsx` and `components/SetupReminderBanner.tsx`. Strip any mention of "unlock", "advanced features", "after N shifts". Replace with neutral copy if needed (e.g., "Track your earnings to see live tax estimates").

### Phase 6 — Test sweep

1. `grep -rn 'isAdvancedUser\|dbt_advanced\|dbt_featuresUnlocked\|unlocked all features' components hooks utils services` → must return only the cleanup line.
2. Fresh-install smoke: clear localStorage, reload, verify all tabs render.
3. Existing-user smoke: profile with totalLogs > 3, reload, verify no behavioural change and no extra toast.

## Out of scope

- Re-introducing a different progressive-disclosure mechanic (collapsible "advanced" sections, etc.) — separate product decision.
- Removing the `playerStats.totalLogs` counter — still used by streak / gamification UI.
- Migrating users away from `localStorage` to IndexedDB — separate persistence-rework spec.
- Changing the onboarding flow's structure (still 3 steps, still skippable).

## Testing

1. **Manual smoke (fresh install):**
   - Open DevTools → Application → Storage → Clear site data
   - Reload, complete onboarding (or skip)
   - All 5 secondary tabs (Mileage, Expenses, Tax, Debt, Bonus) visible in nav
   - Tap Debt → renders, no redirect
   - Add a shift → no "unlocked all features" toast
2. **Manual smoke (existing user):**
   - Pre-seed: `localStorage.dbt_advanced='1'`, `localStorage.dbt_featuresUnlocked='true'`, totalLogs=10
   - Reload → after one tick, both keys are gone from localStorage; UI unchanged
3. **Code search:** no remaining references to the removed identifiers (per R3 + R4 acceptance).
4. **Type check:** `npx tsc --noEmit` passes.
5. **Tests:** `npm test` passes; `npx playwright test` passes (any test that asserted gating behaviour must be updated — likely none, but verify).
