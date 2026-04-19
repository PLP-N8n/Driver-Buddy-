# Tasks: Test and Hygiene

> **For Codex:** Execute tasks in strict order. Mark each sub-task `[x]` as you complete it. Run the verification command before moving to the next task. Commit after every numbered task. Do NOT modify design.md or requirements.md.

---

## Task 1: Fix retry test in syncService.test.ts

**Files to modify:** `services/syncService.test.ts`

- [x] 1.1 Read `services/syncService.test.ts` in full to understand the current retry test structure.

- [x] 1.2 Find the test that calls `vi.runAllTimersAsync()`. It is in the retry/backoff test section (around lines 31-45). Note the exact test name and what it asserts.

- [x] 1.3 Replace `await vi.runAllTimersAsync()` with explicit timer advancement that matches the sync service backoff schedule:
```ts
await vi.advanceTimersByTimeAsync(3_000);   // debounce fires -> first push attempt
await Promise.resolve();                    // flush microtask queue
await vi.advanceTimersByTimeAsync(5_000);   // retry 1
await Promise.resolve();
await vi.advanceTimersByTimeAsync(10_000);  // retry 2
await Promise.resolve();
await vi.advanceTimersByTimeAsync(20_000);  // retry 3
await Promise.resolve();
```
Keep all existing assertions - only replace the timer advancement mechanism.

- [x] 1.4 Run only the sync service test to verify it passes and completes quickly:
```bash
npx vitest run services/syncService.test.ts
```
Expected: all tests pass, completes in under 10 seconds.

- [x] 1.5 Commit:
```bash
git add services/syncService.test.ts
git commit -m "fix: use explicit timer advancement in syncService retry test"
```

---

## Task 2: Fix hybrid object spread in useHydration

**Files to modify:** `hooks/useHydration.ts`

- [x] 2.1 Read `hooks/useHydration.ts` in full.

- [x] 2.2 Find the block where `migrateDailyWorkLog` is called (around lines 70-75). Note what it does - it spreads Shift fields onto DailyWorkLog objects using a `tripsById` map.

- [x] 2.3 Check whether `tripsById` is used anywhere else in the file (not just for the migrate call). Make a note.

- [x] 2.4 Remove the `migrateDailyWorkLog` call and replace the `migratedWorkLogs` computation with:
```ts
const migratedWorkLogs = Array.isArray(savedLogs) ? savedLogs : null;
```

- [x] 2.5 Remove the `migrateDailyWorkLog` import if it is no longer used anywhere in the file.

- [x] 2.6 If `tripsById` was only used for the migrate call (confirmed in 2.3), remove the `tripsById` computation too. If it is used elsewhere, leave it.

- [x] 2.7 Run TypeScript:
```bash
npx tsc --noEmit
```
Expected: zero errors.

- [x] 2.8 Commit:
```bash
git add hooks/useHydration.ts
git commit -m "fix: remove Shift spread from DailyWorkLog objects in useHydration"
```

---

## Task 3: Add schema version marker to useHydration

**Files to modify:** `hooks/useHydration.ts`

- [x] 3.1 At the top of `useHydration.ts` (after imports, before the hook function), add:
```ts
const DATA_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = 'driver_schema_version';
```

- [x] 3.2 Find where the hook writes hydrated data back to state (after the localStorage reads and any transformations). Add the version marker write immediately after:
```ts
localStorage.setItem(SCHEMA_VERSION_KEY, String(DATA_SCHEMA_VERSION));
```

- [x] 3.3 Run TypeScript:
```bash
npx tsc --noEmit
```
Expected: zero errors.

- [x] 3.4 Commit:
```bash
git add hooks/useHydration.ts
git commit -m "feat: add schema version marker to useHydration"
```

---

## Task 4: Complete account deletion in Worker

**Files to modify:** `workers/sync-api/src/routes/sync.ts`

- [x] 4.1 Read `workers/sync-api/src/routes/sync.ts` in full. Focus on:
  - The `handleSyncDeleteAccount` function
  - The `Env` interface (or its import location)
  - The existing `Promise.all` that deletes core tables

- [x] 4.2 Find the `Env` interface used by the delete handler. It may be defined:
  - Locally in `sync.ts` (look for `interface Env`)
  - In a shared file (look for `import type { Env }` at the top)
  
  Add `RECEIPTS: R2Bucket` to that interface. If the interface is shared with other routes that don't use R2, add the field as optional: `RECEIPTS?: R2Bucket`. If it's only used by the sync routes (which already use R2 for receipts), make it required.

- [x] 4.3 In `handleSyncDeleteAccount`, extend the existing `Promise.all` to also delete from the missing tables. Add these alongside the existing DELETE statements:
```ts
env.DB.prepare('DELETE FROM device_secrets WHERE account_id = ?').bind(accountId).run(),
env.DB.prepare('DELETE FROM plaid_connections WHERE account_id = ?').bind(accountId).run(),
env.DB.prepare('DELETE FROM plaid_transactions WHERE account_id = ?').bind(accountId).run(),
env.DB.prepare('DELETE FROM tombstones WHERE account_id = ?').bind(accountId).run(),
```
Note: `tombstones` table is created by the `sync-reliability` spec's `0006_tombstones.sql` migration. Include it here but the migration must be applied first.

- [x] 4.4 After the `Promise.all` resolves, add R2 receipt cleanup using cursor pagination:
```ts
if (env.RECEIPTS) {
  const prefix = `receipts/${accountId}/`;
  let cursor: string | undefined;
  do {
    const listed = await env.RECEIPTS.list({ prefix, cursor });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((obj) => env.RECEIPTS!.delete(obj.key)));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
```

- [x] 4.5 Run TypeScript:
```bash
cd workers/sync-api && npx tsc --noEmit
```
Expected: zero errors.

- [x] 4.6 Commit:
```bash
git add workers/sync-api/src/routes/sync.ts
git commit -m "feat: complete account deletion including device_secrets, plaid tables, tombstones and R2 receipts"
```

---

## Task 5: Final verification and deploy

- [x] 5.1 Run full unit test suite:
```bash
npx vitest run
```
Expected: all tests pass (including the previously-failing retry test), 0 failures.

- [x] 5.2 Run TypeScript compile check (both client and worker):
```bash
npx tsc --noEmit && cd workers/sync-api && npx tsc --noEmit && cd ../..
```
Expected: 0 errors.

- [x] 5.3 Run production build:
```bash
npm run build
```
Expected: build succeeds. Sentry sourcemap upload may fail (no token in this env) - that is acceptable.

- [ ] 5.4 Deploy Worker (BLOCKED: `npx wrangler deploy` failed with `spawn EPERM`; Gayatri to handle):
```bash
cd workers/sync-api && npx wrangler deploy && cd ../..
```
Expected: deploy succeeds.

- [ ] 5.5 Deploy PWA to Cloudflare Pages (BLOCKED: `npx wrangler pages deploy ...` failed with `spawn EPERM`; Gayatri to handle):
```bash
npx wrangler pages deploy dist --project-name drivertax --commit-dirty=true
```
Expected: deploy succeeds.

- [x] 5.6 Final commit if any files were changed during verification:
```bash
git add -p
git commit -m "chore: test and hygiene fixes complete"
```
