# Commit Plan

Use this as a temporary grouping guide for the current working tree. Do not include local-only files such as `.env.development.local`, `.env.local`, `dist/`, `vite-dev.*.log`, `.tmp-vitest/`, `.kiro/`, or archived review notes.

## Suggested groups

1. PWA and install polish
   - `public/manifest.webmanifest`
   - `public/pwa-maskable-512.png`
   - `public/screenshots/`
   - `public/sw.js`
   - `index.html`
   - `components/InstallBanner.tsx`
   - `vite.config.ts`

2. Vehicle energy support
   - `types.ts`
   - `utils/vehicleFuel.ts`
   - expense, dashboard, settings, and tax UI/calculation files
   - related unit tests

3. Sync, restore, and receipt reliability
   - sync transforms and sync service tests
   - worker sync/auth/plaid/receipt routes and migrations
   - receipt upload transparency files

4. AppShell decomposition and cleanup
   - `hooks/useDriverLedger.ts`
   - `components/AppShell.tsx`
   - dead-code deletions

5. Documentation specs
   - `docs/specs/`
   - active implementation notes only
