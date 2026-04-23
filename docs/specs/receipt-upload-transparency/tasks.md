# receipt-upload-transparency — tasks

## Task 1 — Worker: 503 with Retry-After

- [ ] Open `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/routes/receipts.ts`
- [ ] Replace `presignUnavailable` body (lines ~30–43) to return:
  - status `503`
  - headers `{ ...getCorsHeaders(request), 'Content-Type': 'application/json', 'Retry-After': '86400' }`
  - body `JSON.stringify({ error: 'presigned_urls_unavailable', retryAfter: 86400, key })`
- [ ] Add unit test `workers/sync-api/test/receipts.test.ts` (create if missing): assert `handleRequestUpload` with valid session returns 503 + `Retry-After: 86400` + structured error body
- [ ] Verify: `curl -i -X POST -H "X-Session-Token: <valid>" $WORKER/api/receipts/request-upload -d '{"filename":"a.jpg","contentType":"image/jpeg"}'` returns 503 with the expected headers
- [ ] Deploy: `cd workers/sync-api && npx wrangler deploy`
- [ ] Commit: `fix(receipts-worker): return 503 + Retry-After when presigned URLs unavailable`

## Task 2 — Upload-status store

- [ ] Create `C:/Projects/ventures/Driver-Buddy/services/uploadStatusStore.ts`
- [ ] Reuse the IndexedDB wrapper pattern from `services/imageStore.ts`
- [ ] Schema per row: `{ expenseId: string, status: 'pending' | 'uploading' | 'synced' | 'failed' | 'local-only', lastAttemptAt: number, errorReason?: string, suppressRetryUntil?: number }`
- [ ] API: `getStatus(expenseId)`, `setStatus(expenseId, partial)`, `listAll()`, `listByStatus(status)`, `clearStatus(expenseId)`
- [ ] Create `services/uploadStatusStore.test.ts` covering round-trip, partial update, listByStatus
- [ ] Verify: `npm test -- uploadStatusStore` passes
- [ ] Commit: `feat(uploadStatusStore): persist receipt upload status in IndexedDB`

## Task 3 — `useReceiptUpload` hook

- [ ] Create `C:/Projects/ventures/Driver-Buddy/hooks/useReceiptUpload.ts`
- [ ] In-memory map `Map<string, Promise<UploadResult>>` for in-flight uploads
- [ ] Subscribe to `uploadStatusStore.listAll()` on mount; refresh on `visibilitychange` and on every `setStatus` call (use a simple event emitter)
- [ ] Functions: `getStatus(expenseId)`, `upload(expenseId, blob)`, `retry(expenseId)`, `retryAll()`
- [ ] Create `hooks/useReceiptUpload.test.ts` covering all four R2 branches
- [ ] Verify: `npm test -- useReceiptUpload` passes
- [ ] Commit: `feat(useReceiptUpload): hook for tracking receipt upload state`

## Task 4 — `requestReceiptUpload` differentiates 503 vs other errors

- [ ] Open `C:/Projects/ventures/Driver-Buddy/services/imageStore.ts`
- [ ] In `requestReceiptUpload` (line ~136), branch on `res.status`:
  - `200`: existing path
  - `503`: call `uploadStatusStore.setStatus(expenseId, { status: 'local-only', suppressRetryUntil: Date.now() + 86_400_000 })`; return null with discriminated reason
  - else: `setStatus(..., { status: 'failed', errorReason: \`http_\${res.status}\` })`; return null
- [ ] Wrap network errors in try/catch → `setStatus(..., { status: 'failed', errorReason: 'network' })`
- [ ] Update `services/imageStore.test.ts` to cover each branch
- [ ] Verify: `npm test -- imageStore` passes
- [ ] Commit: `feat(imageStore): differentiate 503 (unavailable) from other upload failures`

## Task 5 — `<ReceiptStatusBadge />` component

- [ ] Create `C:/Projects/ventures/Driver-Buddy/components/ReceiptStatusBadge.tsx`
- [ ] Props: `{ status: 'local-only' | 'uploading' | 'synced' | 'failed' }`
- [ ] Render icon + label per R1 (use existing `lucide-react` icons: `Cloud`, `CloudOff`, `Loader2`, `AlertCircle`)
- [ ] Match existing Tailwind palette (`bg-slate-700/40 text-slate-300`, `bg-amber-500/15 text-amber-300`, etc.) — see `components/SyncIndicator.tsx` for precedent
- [ ] No tests needed — pure render
- [ ] Commit: `feat(ReceiptStatusBadge): four-state badge component`

## Task 6 — Wire badge into ExpenseLog

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/ExpenseLog.tsx`
- [ ] Import `useReceiptUpload` and `ReceiptStatusBadge`
- [ ] In the row render (where `expense.hasReceiptImage` controls the receipt thumbnail), call `getStatus(expense.id)` and render `<ReceiptStatusBadge status={...} />` adjacent
- [ ] Add a "Retry upload" button when `status === 'failed'` that calls `retry(expense.id)`
- [ ] Verify: `npm run dev`, add expense with receipt while worker returns 503, see `Local only` badge
- [ ] Commit: `feat(ExpenseLog): show receipt sync state badge per row`

## Task 7 — Settings receipt-sync row

- [ ] Open `C:/Projects/ventures/Driver-Buddy/components/Settings.tsx`
- [ ] Add a "Receipt sync" panel showing counts (`local`, `synced`, `failed`) computed via `uploadStatusStore.listAll()`
- [ ] Add "Retry all failed" button that calls `retryAll()`
- [ ] Verify: open Settings with seeded mixed-state receipts; counts display; retry triggers re-upload
- [ ] Commit: `feat(Settings): add receipt sync status panel with retry-all`

## Task 8 — Save-time toast for local-only

- [ ] In `components/ExpenseLog.tsx`, on the new-expense save flow, await the upload result; if `status === 'local-only'` immediately after save, dispatch toast `"Receipt saved locally — will sync when cloud upload is available"`
- [ ] Use the existing toast hook (search `useToast` or `Toast` import in nearby files)
- [ ] Verify: save expense with image while worker returns 503; toast appears
- [ ] Commit: `feat(ExpenseLog): toast when new receipt cannot upload immediately`

## Task 9 — E2E: receipt upload states

- [ ] Create `C:/Projects/ventures/Driver-Buddy/e2e/receipt-upload-states.spec.ts`
- [ ] Seed `localStorage` + IndexedDB with one expense per state (use `page.addInitScript`)
- [ ] Assert all four badges render
- [ ] Test the retry flow: seed `failed` row, intercept `request-upload` to return 200, click Retry, assert transition to `Cloud synced`
- [ ] Test persistence: reload page, assert badges still correct
- [ ] Verify: `npx playwright test receipt-upload-states` passes
- [ ] Commit: `test(e2e): receipt upload state badges and retry flow`

## Task 10 — Regression sweep

- [ ] `npm test` (full vitest)
- [ ] `npx playwright test`
- [ ] `npm run build`
- [ ] Manual smoke on production build: confirm badges render, retry works, Settings panel shows counts
- [ ] No commit (verification only)
