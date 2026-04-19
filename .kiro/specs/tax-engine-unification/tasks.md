# Tasks: Tax Engine Unification

> **For Codex:** Execute tasks in strict order. Mark each sub-task `[x]` as you complete it. Run the verification command before moving to the next task. Commit after every numbered task. Do NOT modify design.md or requirements.md.

---

## Task 1: Fix TaxEstimateCard prop type and calcKept argument

**Files to modify:** `components/dashboard/TaxEstimateCard.tsx`

- [x] 1.1 Read `components/dashboard/TaxEstimateCard.tsx` in full.

- [x] 1.2 Find the `TaxEstimateCardProps` type (or the `totals` prop shape). Add `totalExpenses: number` to it.

- [x] 1.3 Find the `calcKept` call (currently `calcKept(totals.totalRevenue, totals.mileageClaim, taxSetAside)`). Change `totals.mileageClaim` to `totals.totalExpenses`.

- [x] 1.4 Run TypeScript — expect an error on the caller (`DashboardScreen`) because `totalExpenses` is not yet passed:
```bash
npx tsc --noEmit
```
Expected: error on `DashboardScreen.tsx` referencing missing `totalExpenses`. This confirms the fix is wired correctly and the next task is needed.

- [x] 1.5 Commit:
```bash
git add components/dashboard/TaxEstimateCard.tsx
git commit -m "fix: pass totalExpenses not mileageClaim to calcKept in TaxEstimateCard"
```

---

## Task 2: Supply totalExpenses from DashboardScreen and swap mileage import

**Files to modify:** `components/dashboard/DashboardScreen.tsx`

- [x] 2.1 Read `components/dashboard/DashboardScreen.tsx` in full (it is large — focus on the `taxYearTotals` computation and the `TaxEstimateCard` usage).

- [x] 2.2 Find where `taxYearTotals` is built (the object passed to `TaxEstimateCard`). Locate the `totalExpenses` computation nearby (it will be a `reduce` over `expensesTotal` on shifts/logs). Add `totalExpenses` to the returned `taxYearTotals` object.

- [x] 2.3 Find the import of `calculateMileageClaim` from `utils/tax`. Replace it:
```ts
// Remove:
import { calculateMileageClaim } from '../../utils/tax';
// Add:
import { calcMileageAllowance } from '../../shared/calculations/mileage';
```

- [x] 2.4 Find every call to `calculateMileageClaim(...)` in the file. Replace with `calcMileageAllowance(...)`. The arguments are the same: `(businessMiles, rateFirst10k?, rateAfter10k?)`. If the call doesn't pass rate overrides, the defaults match.

- [x] 2.5 Verify TypeScript now compiles cleanly:
```bash
npx tsc --noEmit
```
Expected: zero errors.

- [x] 2.6 Commit:
```bash
git add components/dashboard/DashboardScreen.tsx
git commit -m "refactor: supply totalExpenses to TaxEstimateCard and use calcMileageAllowance"
```

---

## Task 3: Add scope state to expense form

**Files to modify:** `components/ExpenseLog.tsx`

- [x] 3.1 Read `components/ExpenseLog.tsx` in full (it is large — focus on the form state declarations around line 200, the `resetForm` function, the `openEdit` function, and the submit handler around lines 430–460).

- [x] 3.2 Add two new state fields near the other form state declarations:
```ts
const [scopeInput, setScopeInput] = useState<'business' | 'personal' | 'mixed'>('business');
const [businessUsePercentInput, setBusinessUsePercentInput] = useState(100);
```

- [x] 3.3 In the `resetForm` function, reset both fields:
```ts
setScopeInput('business');
setBusinessUsePercentInput(100);
```

- [x] 3.4 In the `openEdit` function (where existing expense fields are loaded into form state), add:
```ts
setScopeInput(expense.scope ?? 'business');
setBusinessUsePercentInput(expense.businessUsePercent ?? 100);
```

- [x] 3.5 In the submit handler, replace the hardcoded lines:
```ts
// Remove these two lines:
const scope: NonNullable<EnhancedExpense['scope']> = 'business';
const businessUsePercent = 100;

// Replace with:
const scope = scopeInput;
const businessUsePercent = scopeInput === 'personal' ? 0 : businessUsePercentInput;
```

- [x] 3.6 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] 3.7 Commit:
```bash
git add components/ExpenseLog.tsx
git commit -m "feat: add scope and businessUsePercent state to expense form"
```

---

## Task 4: Add scope UI to expense form JSX

**Files to modify:** `components/ExpenseLog.tsx`

- [ ] 4.1 Read the JSX of the expense form in `components/ExpenseLog.tsx` — find the area after the amount and description fields and before the receipt/camera section. This is where the scope toggle will be inserted.

- [ ] 4.2 Insert the following JSX block at that location. Use the design tokens already present in the file (`fieldLabelClasses` or equivalent label class, existing button styles, `accent-brand` or equivalent for the slider):

```tsx
{/* Business use scope selector */}
<div>
  <label className={fieldLabelClasses}>Business use</label>
  <div className="flex gap-2 mt-1 flex-wrap">
    {(['business', 'mixed', 'personal'] as const).map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => {
          setScopeInput(s);
          if (s === 'business') setBusinessUsePercentInput(100);
          if (s === 'personal') setBusinessUsePercentInput(0);
          if (s === 'mixed') setBusinessUsePercentInput(50);
        }}
        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
          scopeInput === s
            ? 'border-brand bg-brand/20 text-brand'
            : 'border-surface-border bg-surface-raised text-slate-400'
        }`}
      >
        {s === 'business' ? '100% Business' : s === 'personal' ? 'Personal' : 'Mixed use'}
      </button>
    ))}
  </div>
  {scopeInput === 'mixed' && (
    <div className="mt-3">
      <label className={fieldLabelClasses}>
        Business use: {businessUsePercentInput}%
      </label>
      <input
        type="range"
        min={1}
        max={99}
        value={businessUsePercentInput}
        onChange={(e) => setBusinessUsePercentInput(Number(e.target.value))}
        className="w-full mt-1"
      />
    </div>
  )}
  {scopeInput === 'personal' && (
    <p className="mt-2 text-xs text-amber-400">
      Personal expenses are not tax deductible.
    </p>
  )}
</div>
```

Note: if the file uses a different token name than `border-brand`, `bg-brand/20`, `text-brand`, `border-surface-border`, `bg-surface-raised` — check the existing button/toggle styles in the same file and match them exactly.

- [ ] 4.3 Verify TypeScript compiles:
```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] 4.4 Run all unit tests:
```bash
npx vitest run
```
Expected: all tests pass.

- [ ] 4.5 Commit:
```bash
git add components/ExpenseLog.tsx
git commit -m "feat: add business-use scope selector UI to expense form"
```

---

## Task 5: Final verification and deploy

- [ ] 5.1 Run full unit test suite:
```bash
npx vitest run
```
Expected: all tests pass, 0 failures.

- [ ] 5.2 Run TypeScript compile check:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] 5.3 Run production build:
```bash
npm run build
```
Expected: build succeeds. Sentry sourcemap upload may fail (no token in this env) — that is acceptable.

- [ ] 5.4 Deploy to Cloudflare Pages:
```bash
npx wrangler pages deploy dist --project-name drivertax --commit-dirty=true
```
Expected: deploy succeeds.

- [ ] 5.5 Final commit if any files were changed during verification:
```bash
git add -p
git commit -m "chore: tax engine unification complete"
```










