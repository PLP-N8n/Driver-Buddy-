# receipt-upload-transparency — design

## Goal

Make receipt-upload state visible. Drivers currently can't tell whether a receipt is safely in the cloud, stuck local-only, or silently failed. The R2 presigned-URL gap means uploads return HTTP 501 with an empty URL, and the client treats it as a normal error. The result: users think their receipts are safe when they're sitting in IndexedDB on a phone they might lose.

## Context

### Current state of the upload path

1. **Client trigger** — user adds an expense with a receipt → `ExpenseLog.tsx` calls `requestReceiptUpload(...)` from `services/imageStore.ts`.
2. **Client request** — POST `/api/receipts/request-upload` (`services/imageStore.ts:145`) expects `{ uploadUrl, key }` back.
3. **Worker handler** — `workers/sync-api/src/routes/receipts.ts:45 handleRequestUpload` validates auth + rate limit, then calls `presignUnavailable()` which returns HTTP **501** with empty `uploadUrl` and a TODO comment (lines 30–43). Note: Cloudflare R2 does not yet expose `createPresignedUrl` on the Workers binding API — that's the blocker.
4. **Client interpretation** — `requestReceiptUpload` checks `res.ok` (false on 501) → returns `null`. The expense saves locally with no `receiptId`.
5. **UI** — no badge, no toast, no warning. The expense looks identical to one that synced successfully.

### Existing helpers we reuse

- `services/imageStore.ts:128 isR2UploadConfigured()` — already gates upload attempts on worker URL presence.
- `services/imageStore.ts:80 getImageWithRemoteFallback(id, receiptUrl)` — already prefers local store, falls back to remote.
- `components/ExpenseLog.tsx:65` — receipt-key formula `${expense.id}:${expense.receiptId ?? ...}` is the right invalidation key for the badge cache.

### Decision: 503 over 501

HTTP 501 means "not implemented at all" — clients can't reasonably retry. HTTP 503 with `Retry-After` means "temporarily unavailable" — clients know to back off. When R2 presigning ships, we delete `presignUnavailable` and use the real path; the 503 → 200 transition is a normal degraded-mode → healthy transition.

## Approach

Five components, in order:

### 1. Worker: structured 503 instead of 501

`workers/sync-api/src/routes/receipts.ts` — replace `presignUnavailable` body and status:
- status 503
- header `Retry-After: 86400`
- body `{ error: 'presigned_urls_unavailable', retryAfter: 86400 }`

Keep the function name; only the response shape changes.

### 2. Client: upload-status store

New store in IndexedDB: `receipt-upload-status`
Schema per row: `{ expenseId, status: 'pending' | 'uploading' | 'synced' | 'failed' | 'local-only', lastAttemptAt: number, errorReason?: string, suppressRetryUntil?: number }`

Reuse the existing IndexedDB wrapper used by `imageStore.ts`. New file: `services/uploadStatusStore.ts`.

### 3. New hook: `useReceiptUpload`

`hooks/useReceiptUpload.ts` — owns:
- in-memory map of in-flight upload promises keyed by `expenseId`
- subscription to `uploadStatusStore` for persisted state
- single function `getStatus(expenseId): 'local-only' | 'uploading' | 'synced' | 'failed'`
- `retry(expenseId)` and `retryAll()`

The hook reads from both the in-flight map and the persisted store, returning the more recent of the two.

### 4. UI: badge component + integration

New `components/ReceiptStatusBadge.tsx` — pure component, takes `status` prop, renders icon + label with the four colours specified in R1.

Integrate in:
- `components/ExpenseLog.tsx` — render badge next to each row's existing receipt thumbnail/area
- `components/Settings.tsx` — add "Receipt sync" status row with counts + "Retry all failed" button

### 5. Client: differentiate 503 vs failed

In `services/imageStore.ts:requestReceiptUpload`, branch on response status:
- `200` — proceed as today
- `503` — write `local-only` to status store with `suppressRetryUntil = Date.now() + 86_400_000`
- `4xx` / `5xx` other — write `failed` with `errorReason`
- network error — write `failed` with `errorReason: 'network'`

Show toast on the new-expense save flow only when status is set to `local-only` immediately after save (not on retries).

## Out of scope

- Implementing R2 presigned URLs in the worker (blocked on Cloudflare). The 503 is a structured holding pattern.
- Background-sync via Service Worker (queue uploads while page is closed). Worth a later spec; currently uploads only happen during active sessions.
- End-to-end encryption of receipts. Separate concern.
- Migrating receipts that uploaded successfully under the current silent-failure path — they already have `receiptId` set or not; the badge derives correctly from existing data.
- Notifications when uploads complete in the background.

## Testing

1. Worker unit (vitest): assert `handleRequestUpload` returns `503` with `Retry-After: 86400` and the structured error body.
2. Client unit (vitest): `hooks/useReceiptUpload.test.ts` — covers all four status branches in R2.
3. Client unit: `services/uploadStatusStore.test.ts` — round-trip read/write, schema migration from absent.
4. Client unit: `services/imageStore.test.ts` extended — mock fetch to return 503, assert `local-only` not `failed`, assert no retry within 24h.
5. E2E (Playwright): `e2e/receipt-upload-states.spec.ts` (new) — seed one expense per state, assert badges; click Retry on `failed`, assert transition; reload, assert state persists.
6. Manual smoke: production build, online with worker; add receipt, see `Local only` badge + toast (because worker returns 503); Settings screen shows `1 local, 0 synced, 0 failed`.
