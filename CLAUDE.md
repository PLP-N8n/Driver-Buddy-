# CLAUDE.md

Guidance for Claude and other coding agents working in this repository.

## Project

Driver Buddy is a React 19, TypeScript, Vite, Tailwind PWA for UK delivery and private-hire drivers. It tracks mileage, shifts, expenses, receipts, tax estimates, sync/restore, and installable PWA behavior.

The package name is still `drivertax-pro` for compatibility, but user-facing app copy should use `Driver Buddy`.

## Core Commands

Run commands from the repo root:

```powershell
npm install
npm run dev
npm run typecheck
npm run test:unit
npm run build
npm test
npm --prefix workers/sync-api run type-check
```

Notes:

- `npm run dev` starts Vite.
- `npm run build` runs `scripts\build.cmd`, validates the bundle, and may upload Sentry source maps if `.env.local` contains Sentry credentials.
- Playwright uses `vite preview` on `127.0.0.1:4173` and writes to `output/`.
- Unit tests compile through `tsconfig.vitest.json` into `.tmp-vitest/`.

## Repository Layout

- `components/`: React UI components and app screens.
- `hooks/`: App orchestration hooks such as ledger, persistence, backup/restore, sync, and export.
- `services/`: Browser-side services for sync, settings, analytics, receipts, image storage, sessions, and tests.
- `shared/`: Shared calculation and migration logic.
- `utils/`: UI, date, tax, vehicle fuel, CSV, insights, and helper utilities.
- `workers/sync-api/`: Cloudflare Worker API, routes, libraries, and D1 migrations.
- `e2e/`: Playwright tests.
- `docs/specs/`: Active task/spec breakdowns.
- `docs/superpowers/`: Historical planning docs.

## Current Architecture Rules

- Keep tax and expense math in shared or utility modules, not inline in components.
- Keep Cloudflare Worker behavior covered by focused route/library tests where practical.
- Settings changes should preserve `updatedAt` stamping so sync conflict resolution can compare local and remote settings safely.
- Analytics events must remain consent-gated through `settings.analyticsConsent`.
- Receipt upload failures should be transparent to the UI; preserve explicit status and retry guidance.
- PWA manifest changes should be mirrored between `public/manifest.webmanifest` and `vite.config.ts` when both define install metadata.
- PWA shortcuts use URL actions such as `?action=add-expense`, `?action=add-trip`, `?action=start-shift`, and `?action=tax`.
- iOS install support is limited by Safari: there is no browser install prompt like Android. Use in-app Add to Home Screen guidance instead.
- Prefer existing patterns and utilities over adding new abstractions.

## Historical Project Guidance

The original archived `claude.md` was not recoverable from local Git history, stashes, `.kiro`, lost-found blobs, or current archive folders. The following rules are merged from the archived project plans in `docs/superpowers/` and should be treated as continuing project guidance.

### Finance Product Non-Negotiables

- Treat this as a finance product, not just a UI prototype.
- Security, restore safety, tax correctness, and sync reliability are higher priority than cosmetic changes.
- The Worker is part of the product trust boundary and should be reviewed alongside frontend changes.
- Browser code must not contain receipt or backend secrets.
- Backup or recovery codes must not become bearer credentials that can read cloud data by themselves.
- Use UK-local date helpers for business dates. Avoid ad hoc `toISOString().split('T')[0]` for local date keys.
- Prefer record-level, version-aware sync and merge logic over whole-snapshot overwrite behavior.

### Receipt And Sync Boundaries

- The browser may hold session tokens, opaque receipt IDs, local blobs, and local metadata.
- The Worker owns R2 access, receipt object keys, signing/session secrets, and account/device authorization.
- Receipt upload/read/delete flows must verify account ownership server-side.
- Keep legacy `receiptUrl` readable during migration, but prefer stable private receipt identifiers for new records.
- Restore flows should validate payloads before mutating identity or replacing local state.
- When restore behavior is changed, preserve rollback safety and make conflicts visible instead of silently overwriting.

### Tax And Data Correctness

- Keep personal allowance taper, payments-on-account rules, Scottish tax handling, VAT-exclusive expense handling, and simplified-vs-actual vehicle treatment covered by tests.
- Simplified mileage and actual-cost vehicle deductions must not double-count vehicle running costs.
- Vehicle energy categories such as EV charging, petrol, diesel, and hybrid-related fuel costs are vehicle running costs for tax treatment.
- Weekly review, Tax tab, exports, and dashboard summaries should use the same underlying calculation helpers.
- Linked records, such as work logs and trips, should remain consistent after edit, delete, reload, sync, and restore.

### UX Principles

- Logging should feel lighter than not logging.
- Keep the first screen operational: dashboard outcomes, shift controls, missed-log recovery, and clear next actions.
- Prefer neutral, helpful recovery copy over guilt language.
- End-of-shift and quick-add flows should stay compact, with optional details behind progressive disclosure.
- Export labels should be explicit, for example accountant CSV or tax summary, rather than vague "tax-ready" claims.
- Do not overstate privacy or offline guarantees. Settings copy must match actual local storage, sync, analytics, and export behavior.

### Refactor Rules

- Do not change behavior during pure refactors.
- Do not rename exported symbols used outside the file being extracted unless the whole call graph is updated.
- Extract hooks only when the hook can own the state/effects cleanly and return a small typed interface.
- After meaningful refactors, run `npm run typecheck` and the relevant tests before continuing.

## Generated And Local-Only Files

Do not commit generated or local-only artifacts:

- `.env`, `.env.local`, `.env.development.local`
- `dist/`
- `.tmp-vitest/`
- `output/`
- `vite-dev.*.log`
- `.wrangler/`
- `.kiro/`
- archived review notes or old report docs unless explicitly requested

If a build or test creates `dist/`, `.tmp-vitest/`, or `output/`, remove them before finishing.

## Commit Hygiene

The working tree may contain many unrelated changes. Do not revert files you did not intentionally change.

For the current large working tree, keep commits grouped by concern:

1. PWA and install polish
2. Vehicle energy support
3. Sync, restore, and receipt reliability
4. AppShell decomposition and cleanup
5. Documentation specs

Use `docs/commit-plan.md` as the current grouping guide.

## Testing Expectations

For normal code changes, run:

```powershell
npm run typecheck
npm run test:unit
```

For Worker changes, also run:

```powershell
npm --prefix workers/sync-api run type-check
```

For PWA, routing, export, install, or dashboard workflow changes, run relevant Playwright specs, for example:

```powershell
npx playwright test e2e/dashboard.spec.ts --project=desktop-chromium
```

For production packaging or manifest/service-worker changes, run:

```powershell
npm run build
```

Known benign warning: some current unit tests still emit the React `ReactDOMTestUtils.act` deprecation warning.

## Environment

Local development can use `.env.development.local` with blank optional integrations to keep localhost quiet:

```text
VITE_SYNC_WORKER_URL=
VITE_SENTRY_DSN=
```

Do not remove production values from `.env.local` unless explicitly asked. Builds may depend on them for verification and Sentry source map upload.

## Naming

Use `Driver Buddy` for visible UI, metadata, and docs aimed at users.

Internal compatibility names may still include `drivertax`:

- package name
- storage keys
- Worker routes/domains
- migration names
- legacy docs

Do not rename persistent keys or backend identifiers without a migration plan.
