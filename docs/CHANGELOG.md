# Driver Buddy — Changelog

All significant features, fixes, and UX improvements are recorded here.

---

## [2026-04-11] — Multi-Provider End Shift + Bug Fixes

### New: Multi-Provider Earnings at Shift End
The end shift sheet now supports entering earnings split across multiple platforms (e.g. Uber Eats + Deliveroo + Amazon Flex on the same day).

- **End shift sheet**: Single "Earnings" input replaced with platform rows — provider dropdown + revenue input per row
- **"+ Add platform" button**: Add as many rows as needed
- **Auto-totals**: Revenue is summed across all rows; first platform becomes the primary provider
- **providerSplits saved**: Each row is stored as a `ProviderSplit` on the `DailyWorkLog`, feeding correctly into insights and tax pack
- **Draft migration**: Existing localStorage drafts (old `earningsValue` format) are automatically migrated to the new providers array on restore

**Files changed:** `types.ts`, `components/dashboard/DashboardScreen.tsx`, `components/dashboard/QuickAddForm.tsx`, `components/AppShell.tsx`

**Root cause fixed:** Previously, drivers working multiple platforms in one day had to delete the live tracker session and re-enter everything manually via the WorkLog form, creating duplicate entries. This adds the multi-platform breakdown directly to the end-shift flow.

---

## [2026-04-10] — Codex Bug Fixes (A1–A3)

### A1 (HIGH): Sync Retry Infinite Loop — Fixed
`resetRetryState()` now clears `queuedPushData` on max retries. Previously, after exhausting retries the queued payload remained, causing an infinite retry loop on the next connectivity event.

**File:** `services/syncService.ts`

### A2 (HIGH): Edit Expense Drops receiptId / receiptUrl — Fixed
Metadata-only expense edits (e.g. changing description) now preserve `receiptId` and `receiptUrl`. Previously these were silently dropped, orphaning uploaded receipts.

**File:** `components/ExpenseLog.tsx`

### A3 (MEDIUM): providerSplits Lost During Sync — Fixed
`SyncWorkLogMeta` now includes `providerSplits`. Multi-provider shifts no longer get flattened to a single provider on sync round-trip.

**File:** `services/syncTransforms.ts`

---

## [2026-04-10] — Live UX Fixes (B1–B5)

### B1 (CRITICAL): Features Disappearing on Load — Fixed
Mileage, Expenses, and Debt Manager tabs were being hidden during OPFS hydration (before data loaded), then reappearing — creating a jarring flash. Fix: tabs are always shown until `hasHydrated` is true; `dbt_advanced` flag in localStorage ensures tabs stay visible once unlocked.

**File:** `components/AppShell.tsx`

### B2 (HIGH): Floating Dock Covers More Menu — Fixed
The bottom dock is now hidden when the More menu or any overlay sheet is open.

**File:** `components/AppShell.tsx`

### B3 (HIGH): WorkLog Form Provider Label + Scroll — Fixed
- Sheet scrolls to top when opened
- "Providers & Revenue" section label made more prominent
- "+ Add provider" button styled as a proper outlined button

**File:** `components/WorkLog.tsx`

### B4 (HIGH): Start/End Time Instead of Hours — Implemented
Hours field replaced with Start Time + End Time + Break Minutes inputs. Hours are auto-calculated and shown read-only below the time fields.

**File:** `components/WorkLog.tsx`

### B5 (MEDIUM): Weekly Review Card Only Showed on Mondays — Fixed
Removed the Monday-only gate. The Weekly Review card now appears any day of the week when there are logs from the previous week and it hasn't been dismissed.

**File:** `components/WeeklyReviewCard.tsx`

---

## [2026-04-09] — Design Overhaul + Deployment

- Full UI redesign deployed to Cloudflare Pages at `drivertax.rudradigital.uk`
- Cloudflare D1 sync database (`drivertax-sync`) wired up
- Cloudflare Worker sync API deployed
- Project structure cleaned up (removed orphaned files, dead LiveTracker component noted as disconnected)
