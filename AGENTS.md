# Repository Guidelines

## Project Structure & Module Organization

Driver Buddy is a React 19, TypeScript, Vite, and Tailwind PWA for UK drivers. Main UI components live in `components/`, with dashboard pieces in `components/dashboard/`. App hooks are in `hooks/`; browser services such as sync, storage, analytics, and receipts are in `services/`; shared tax, mileage, expense, and migration logic is in `shared/`; smaller helpers are in `utils/`. Playwright specs live in `e2e/`, unit tests sit beside source files as `*.test.ts` or under `__tests__/`, and public PWA assets are in `public/`. The Cloudflare Worker API is isolated in `workers/sync-api/`.

## Build, Test, and Development Commands

Run commands from the repository root unless noted.

- `npm install`: install frontend dependencies.
- `npm run dev`: start the Vite dev server.
- `npm run typecheck`: run TypeScript checks for the app.
- `npm run test:unit`: typecheck the Vitest project and run unit tests.
- `npm test`: run Playwright e2e tests.
- `npm run build`: run the custom production build and bundle verification.
- `npm --prefix workers/sync-api run type-check`: typecheck the Worker.
- `npm --prefix workers/sync-api run dev`: run the Worker locally with Wrangler.

## Coding Style & Naming Conventions

Use TypeScript and React functional components. Follow existing 2-space indentation, named exports, and descriptive file names such as `useBackupRestore.ts`, `TaxEstimateCard.tsx`, and `syncTransforms.test.ts`. Keep finance calculations in `shared/` or `utils/`, not inline in UI components. Use `Driver Buddy` for user-facing copy; keep legacy `drivertax` names only for package names, storage keys, routes, and migration-sensitive identifiers.

## Testing Guidelines

Use Vitest for unit coverage and Playwright for browser workflows. Add or update tests when changing tax logic, migrations, sync/restore behavior, receipt handling, exports, dashboard flows, or Worker routes. Prefer focused unit tests near the changed module, then add e2e coverage for visible workflow risks. For dashboard checks, run `npx playwright test e2e/dashboard.spec.ts --project=desktop-chromium`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit prefixes, for example `feat:`, `fix:`, `refactor:`, and `chore:`. Keep commits grouped by concern and avoid mixing docs, UI, sync, and Worker changes. PRs should describe user impact, list validation commands, link related issues or specs, and include screenshots for UI/PWA changes.

## Security & Configuration Tips

Do not commit `.env`, `.env.local`, `.env.development.local`, `dist/`, `.tmp-vitest/`, `output/`, `.wrangler/`, or local logs. Keep Worker secrets out of browser code where possible, preserve consent-gated analytics, and review `docs/environment-variables.md` before changing sync, Sentry, receipt, or deployment configuration.
