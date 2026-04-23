# remove-feature-gating — tasks

## Task 1 — Strip gating logic from `AppShell.tsx`

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/AppShell.tsx`
- [ ] Delete `hasEverBeenAdvanced` (line ~281) and `isAdvancedUser` (line ~282) declarations
- [ ] Delete `if (playerStats.totalLogs >= 3) localStorage.setItem('dbt_advanced', '1');` (line ~287)
- [ ] Delete the redirect-from-debt-tab `useEffect` (lines ~313–319)
- [ ] Replace each `isAdvancedUser ? <X /> : <Y />` ternary with the unconditional render (`<X />`)
- [ ] Replace each `if (!isAdvancedUser) return null` (or equivalent guard) with the unconditional render
- [ ] Drop the `isAdvancedUser` prop from `<TaxLogic />` invocations
- [ ] Drop the `isAdvancedUser` argument from any `usePersistence(...)` call
- [ ] Verify: `grep -n 'isAdvancedUser\|hasEverBeenAdvanced\|dbt_advanced' components/AppShell.tsx` returns no matches
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `feat(appshell): drop advanced-user gating; show all tabs from first launch`

## Task 2 — Remove unlock toast from `usePersistence.ts`

- [ ] Open `C:/Projects/ventures/Driver-Buddy/hooks/usePersistence.ts`
- [ ] Delete the `useEffect` block at lines ~126–131 that fires the `"You've unlocked all features"` toast
- [ ] Remove `isAdvancedUser` from the hook's parameter list / props interface
- [ ] Verify: `grep -n 'isAdvancedUser\|featuresUnlocked\|unlocked all features' hooks/usePersistence.ts` returns no matches
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `chore(persistence): remove unlock toast and isAdvancedUser param`

## Task 3 — Remove `isAdvancedUser` from `TaxLogic.tsx`

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/TaxLogic.tsx`
- [ ] Remove `isAdvancedUser` from the props interface and from the destructured props
- [ ] Inline the previously-gated render branches as the default
- [ ] Verify: `grep -n 'isAdvancedUser' components/TaxLogic.tsx` returns no matches
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `feat(tax): render Tax Assistant unconditionally`

## Task 4 — Add one-shot localStorage cleanup

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/AppShell.tsx`
- [ ] Near the top of the component (after `hasHydrated` or first effect), add:
  ```
  useEffect(() => {
    try {
      localStorage.removeItem('dbt_advanced');
      localStorage.removeItem('dbt_featuresUnlocked');
    } catch {}
  }, []);
  ```
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `chore(appshell): one-shot cleanup of legacy gating localStorage keys`

## Task 5 — Onboarding copy review

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/OnboardingModal.tsx`
- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/SetupReminderBanner.tsx`
- [ ] Search both files for `unlock`, `advanced`, `gradually`, `after`, `more features`
- [ ] Replace gating language with neutral copy (e.g., "Track your earnings to see live tax estimates")
- [ ] Verify: `grep -in 'unlock\|advanced features' components/OnboardingModal.tsx components/SetupReminderBanner.tsx` returns no gating language
- [ ] Commit: `copy(onboarding): drop unlock-after-N-shifts language`

## Task 6 — Cross-codebase sweep

- [ ] `grep -rn 'isAdvancedUser\|dbt_advanced\|dbt_featuresUnlocked\|unlocked all features' components hooks utils services src`
- [ ] Resolve every remaining match (each should be either the cleanup line in AppShell or a stray comment to delete)
- [ ] Verify: re-running the grep returns only the AppShell cleanup line
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Commit: `chore: final sweep of advanced-user references` (skip if no diff)

## Task 7 — Test sweep

- [ ] `npm test`
- [ ] `npx playwright test` (update or remove any test that asserted gating behaviour)
- [ ] Manual fresh-install smoke (DevTools → Clear site data, reload):
  - All 5 secondary tabs visible in nav
  - Debt tab renders, no redirect
  - Add a shift → no "unlocked all features" toast
- [ ] Manual existing-user smoke (`localStorage.dbt_advanced='1'`, totalLogs=10):
  - Reload → both legacy keys cleared from localStorage
  - UI unchanged, no extra toast
- [ ] No commit (verification only)

## Task 8 — Deploy

- [ ] `npm run build`
- [ ] `npx wrangler pages deploy dist --project-name drivertax --commit-dirty=true`
- [ ] Smoke production URL on a fresh incognito window
- [ ] Commit: `chore(deploy): remove feature gating live`
