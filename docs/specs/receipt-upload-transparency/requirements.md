# receipt-upload-transparency — requirements

## R1 — Each expense with a receipt SHALL display a sync-state badge

**The system SHALL** render exactly one of four badges next to every expense row in `components/ExpenseLog.tsx` that has an image attached:
- `Local only` (slate) — image exists locally; no upload attempted (e.g. user offline or sync disabled)
- `Uploading…` (amber, spinner) — upload in flight
- `Cloud synced` (emerald, check) — upload succeeded; remote `receiptId` confirmed
- `Upload failed` (red, retry icon) — last upload attempt failed

**Acceptance:** Playwright test in `e2e/receipt-upload-states.spec.ts` (new) seeds one expense in each of the four states and asserts the corresponding badge is present.

## R2 — Badge state SHALL derive from observable data, not optimistic UI

**The system SHALL** compute badge state from these sources, in order of precedence:
1. `receiptId` present and validated against worker → `Cloud synced`
2. In-flight upload promise tracked in `useReceiptUpload` (new hook) → `Uploading…`
3. Last upload attempt recorded in IndexedDB with `status: 'failed'` and a timestamp → `Upload failed`
4. `hasReceiptImage === true` and no `receiptId` and no in-flight upload → `Local only`

**Acceptance:** unit test in `hooks/useReceiptUpload.test.ts` (new) covers each branch with mocked inputs.

## R3 — Failed uploads SHALL be retryable from the UI

**The system SHALL** expose a "Retry upload" button on rows in the `Upload failed` state. Clicking it re-runs `requestReceiptUpload` from `services/imageStore.ts` for that expense and updates the badge.

**Acceptance:** Playwright test seeds a `failed` row, clicks Retry, intercepts the upload request, simulates 200 OK, and asserts badge transitions `Upload failed` → `Uploading…` → `Cloud synced`.

## R4 — Worker SHALL return a structured 503 (not 501) until R2 presigning lands

**The system SHALL** change `presignUnavailable` in `workers/sync-api/src/routes/receipts.ts` to return HTTP 503 with body `{ error: 'presigned_urls_unavailable', retryAfter: 86400 }` instead of the current 501 with empty `uploadUrl`. The 503 SHALL set `Retry-After: 86400`.

**Acceptance:** `curl -i $WORKER/api/receipts/request-upload` (with valid session) returns `503` and `Retry-After: 86400` headers; body parses to the structured error.

## R5 — Client SHALL detect 503 from R6 worker and mark receipts `Local only` (not `Failed`)

**The system SHALL** treat a 503 response from `/api/receipts/request-upload` as "feature-not-available" and mark the receipt `Local only` rather than `Upload failed`. **The system SHALL** suppress retry attempts for 24 hours after a 503 (matching the worker's `Retry-After`).

**Acceptance:** unit test mocks fetch to return 503; assert no retry within 24h, assert badge is `Local only` not `Upload failed`.

## R6 — Settings SHALL expose receipt-sync state at a glance

**The system SHALL** add a "Receipt sync" status row to `components/Settings.tsx` showing counts: `N local`, `N synced`, `N failed`, with a "Retry all failed" button.

**Acceptance:** with seeded mixed-state receipts, Settings displays correct counts and the retry button triggers re-upload for every failed row.

## R7 — Failed-upload state SHALL persist across reloads

**The system SHALL** persist the `failed` state and `lastAttemptAt` timestamp in IndexedDB (extend the existing `receipt-images` store schema or add a sibling `receipt-upload-status` store).

**Acceptance:** Playwright test seeds a failed row, reloads, asserts badge still reads `Upload failed` and the row appears in the Settings retry queue.

## R8 — No silent data loss on save

**The system SHALL** show a toast `"Receipt saved locally — will sync when cloud upload is available"` when a new expense's receipt cannot be uploaded immediately (503 or offline).

**Acceptance:** save expense with image while offline; confirm toast appears; confirm `Local only` badge renders on the new row.
