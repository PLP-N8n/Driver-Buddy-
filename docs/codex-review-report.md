# Driver Buddy Focused Code Review

Date: 2026-05-09
Scope: React 19 / TypeScript / Vite-style PWA client and Cloudflare Worker sync API.

## Executive Summary

No critical server-side authorization bypass was found. Sync, receipt, Plaid, and device routes derive the account from a signed session token and re-check that the token's device hash is still registered before returning account data.

The highest-risk gaps are operational and architectural: auth/session failures are collapsed to `null` on the client, receipt upload security is not ready for presigned uploads, the sync API accepts loosely shaped full-state payloads, and the production build path has drifted away from `vite.config.ts`.

Verification run:

- `npm run typecheck` passed.
- `npm run test:unit` passed: 28 files, 215 tests.
- `cd workers/sync-api && npm run type-check` passed.

## Priority Findings

### F1. High: First-load auth failures are collapsed into generic sync/CORS symptoms

Evidence:

- `registerAccount()` returns `false` for every non-2xx response, losing whether the server returned `401`, `429`, CORS/preflight failure, or network failure: `services/sessionManager.ts:52`, `services/sessionManager.ts:58`, `services/sessionManager.ts:67`.
- `getSessionToken()` returns `null` when registration or session issuance fails: `services/sessionManager.ts:88`, `services/sessionManager.ts:89`, `services/sessionManager.ts:95`, `services/sessionManager.ts:101`, `services/sessionManager.ts:114`.
- `buildAuthHeaders()` still returns `X-Device-ID` even when no session token exists: `services/sessionManager.ts:123`, `services/sessionManager.ts:127`, `services/sessionManager.ts:129`.
- `pull()` then calls `/sync/pull` with whatever headers it has and turns any non-OK response into generic `error`: `services/syncService.ts:234`, `services/syncService.ts:236`, `services/syncService.ts:240`, `services/syncService.ts:245`.
- This happens automatically on first hydrated load: `hooks/useSyncOrchestrator.ts:153`, `hooks/useSyncOrchestrator.ts:156`.

Impact: a real authorization or migration problem is indistinguishable from CORS in the UI and logs, so first-load production failures are hard to diagnose and users get no recovery path.

Recommendations:

- Return a typed auth result from `getSessionToken()` and `buildAuthHeaders()`: `ok`, `not_registered`, `account_claimed`, `rate_limited`, `network`, `cors_or_preflight`.
- Do not call `/sync/pull`, `/sync/push`, receipts, Plaid, or device routes unless a valid session token exists.
- Surface a restore/setup action for `account already has registered devices` and `not registered`.
- Add production smoke checks that assert both preflight and real `401` responses include CORS headers.

### F2. High when enabled: Receipt presigned uploads lack a server-owned upload contract

Evidence:

- The Worker accepts client-supplied `filename` and `contentType`, then only sanitizes the filename: `workers/sync-api/src/routes/receipts.ts:52`, `workers/sync-api/src/routes/receipts.ts:59`, `workers/sync-api/src/routes/receipts.ts:61`.
- If `createPresignedUrl` exists, the Worker returns a 1-hour PUT URL with no visible content-type, extension, byte-size, or object-metadata policy: `workers/sync-api/src/routes/receipts.ts:64`, `workers/sync-api/src/routes/receipts.ts:66`.
- Client-side upload only enforces a 5 MB limit and `accept="image/*"`: `components/ExpenseLog.tsx:443`, `components/ExpenseLog.tsx:973`, `components/ExpenseLog.tsx:976`.
- Receipt previews/opening use Data/blob URLs: `components/ExpenseLog.tsx:449`, `components/ExpenseLog.tsx:459`, `components/ExpenseLog.tsx:710`, `components/ExpenseLog.tsx:719`, `components/ExpenseLog.tsx:983`.
- Ownership checks on read/delete are good and should be preserved: `workers/sync-api/src/routes/receipts.ts:76`, `workers/sync-api/src/routes/receipts.ts:77`, `workers/sync-api/src/routes/receipts.ts:100`, `workers/sync-api/src/routes/receipts.ts:101`.

Impact: once presigned uploads are enabled, any session holder can mint a PUT URL and upload arbitrary active or oversized content under their account prefix. Client checks are useful UX, not security.

Recommendations:

- Prefer Worker-mediated upload, or sign a strict upload policy that constrains MIME type, extension, max bytes, expiry, and generated object key.
- Allowlist safe receipt types only, for example JPEG, PNG, WebP, and HEIC. Explicitly reject SVG and HTML-like active content.
- Add a `receipt_objects` D1 table: account id, expense id, object key, content type, byte size, upload status, scan/validation status.
- Return receipts with safe `Content-Type` and `Content-Disposition`; never render untrusted active formats inline.

### F3. Medium: Device recovery secret is browser-readable while CSP still allows inline script

Evidence:

- Account id and device secret are stored in `localStorage`: `services/deviceId.ts:30`, `services/deviceId.ts:33`, `services/deviceId.ts:43`, `services/deviceId.ts:46`.
- Backup codes include both account id and device secret: `services/deviceId.ts:51`, `services/deviceId.ts:52`.
- The CSP includes `script-src 'unsafe-inline'`: `public/_headers:6`.

Impact: any future XSS or malicious same-origin script can exfiltrate the recovery secret and then sync, read receipts, or delete cloud data as that user.

Recommendations:

- Remove `unsafe-inline` from CSP; use hashes/nonces only if inline script is unavoidable.
- Consider `require-trusted-types-for 'script'` after removing DOM sinks.
- Long term, replace permanent JS-readable recovery secrets with passkeys, platform credentials, or a server-mediated device enrollment flow.
- Treat backup-code display/copy flows as secret-handling UI and never send them to analytics or logs.

### F4. Medium: Sync API uses typed-looking but unschematized full-state payloads

Evidence:

- Worker payloads are `Array<Record<string, unknown>>` plus `settings?: unknown`: `workers/sync-api/src/routes/sync.ts:20`, `workers/sync-api/src/routes/sync.ts:26`.
- JSON is parsed directly without body-size or schema validation: `workers/sync-api/src/routes/sync.ts:37`, `workers/sync-api/src/routes/sync.ts:39`, `workers/sync-api/src/routes/sync.ts:223`.
- Rows are written after coercion, but without row-count, string-length, range, or enum limits: `workers/sync-api/src/routes/sync.ts:235`, `workers/sync-api/src/routes/sync.ts:249`, `workers/sync-api/src/routes/sync.ts:278`, `workers/sync-api/src/routes/sync.ts:346`.

Impact: SQL injection is mitigated by bound parameters, but a compromised or malicious authenticated client can bloat D1, store invalid domain data, and force expensive sync payload processing.

Recommendations:

- Add shared schemas for sync payloads with max rows, max string lengths, numeric ranges, and enum validation.
- Reject oversized request bodies before parsing.
- Move toward entity-level deltas instead of pushing whole arrays on every change.
- Add per-account quota/retention controls for tombstones and receipt metadata.

### F5. Low/Medium: CORS still enables credentials for bearer-token auth

Evidence:

- CORS sets `Access-Control-Allow-Credentials: true`: `workers/sync-api/src/lib/cors.ts:47`, `workers/sync-api/src/lib/cors.ts:49`.
- Local requirements say this should be omitted for the bearer-token model: `docs/specs/cors-allowlist/requirements.md:35`.
- Tests currently assert the credential header, so the test suite preserves the mismatch: `services/workerRoutes.test.ts:86`, `services/workerRoutes.test.ts:87`, `services/workerRoutes.test.ts:131`, `services/workerRoutes.test.ts:132`.

Impact: this is not an immediate exploit with the current strict allowlist, but it weakens the safety margin if an origin is later added by mistake or cookie auth is introduced without CSRF.

Recommendation: remove `Access-Control-Allow-Credentials` unless a cookie-authenticated endpoint is intentionally added, then add CSRF protections with that change.

## CORS/401 First-Load Assessment

Current source should not produce a browser-visible CORS failure for allowlisted production `401` responses:

- Unknown origins get no `Access-Control-Allow-Origin`, but allowlisted origins are echoed exactly: `workers/sync-api/src/lib/cors.ts:40`, `workers/sync-api/src/lib/cors.ts:42`, `workers/sync-api/src/lib/cors.ts:48`.
- `jsonErr()` includes CORS headers: `workers/sync-api/src/lib/json.ts:14`, `workers/sync-api/src/lib/json.ts:17`.
- The Worker wraps routed responses and uncaught errors with CORS headers: `workers/sync-api/src/index.ts:77`, `workers/sync-api/src/index.ts:81`.
- Unit tests cover readable `401` responses with CORS headers: `services/workerRoutes.test.ts:119`, `services/workerRoutes.test.ts:130`, `services/workerRoutes.test.ts:131`.

Most likely root causes:

- Production Worker is stale or not deployed with the current CORS wrapper.
- The live frontend origin differs from the hardcoded allowlist, for example a `www` or staging domain not in `workers/sync-api/src/lib/cors.ts:1`.
- Production D1 is missing migration/data for `account_devices`; current auth depends on that table: `workers/sync-api/migrations/0007_account_devices.sql:1`, `workers/sync-api/migrations/0007_account_devices.sql:9`, `workers/sync-api/src/routes/auth.ts:60`, `workers/sync-api/src/routes/auth.ts:123`.
- The client masks real `401`/`429`/network states as generic sync failure, as described in F1.

Production smoke commands:

```bash
curl -i -X OPTIONS \
  -H "Origin: https://drivertax.rudradigital.uk" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-device-id,x-session-token,sentry-trace,baggage" \
  https://drivertax-sync-api.cvchaudhary.workers.dev/sync/pull

curl -i \
  -H "Origin: https://drivertax.rudradigital.uk" \
  https://drivertax-sync-api.cvchaudhary.workers.dev/sync/pull
```

Expected: first response `204` with CORS headers; second response `401` with matching `Access-Control-Allow-Origin`. If either fails, fix deployment/allowlist before changing client code.

## Performance Review

Observed current `dist/assets` size: 27 JS/CSS files, about 1050.5 KB raw. Largest assets:

- `dist/assets/chunks/prod-6OPWYMGR.js`: 409.2 KB raw, 136.4 KB gzip. This is the deferred Sentry browser SDK chunk.
- `dist/assets/index.js`: 333.0 KB raw, 99.3 KB gzip.
- `dist/assets/index.css`: 71.2 KB raw, 12.6 KB gzip.
- `Settings`, `ExpenseLog`, `TaxLogic`, `WorkLog`, `MileageLog`, and other tab chunks are already lazy-loaded: `components/AppShell.tsx:69`, `components/AppShell.tsx:77`.

Recommendations:

- Keep the Sentry import deferred, but reduce the chunk by loading replay only after explicit need/consent or by using narrower Sentry imports. Current Sentry load path is `src/sentry.ts:26`, `src/sentry.ts:47`, `src/sentry.ts:80`, `src/sentry.ts:83`.
- Keep esbuild metafiles in CI instead of deleting them so bundle regressions are visible: `scripts/build-main.mjs:47`, `scripts/build.cmd:13`.
- Add bundle budgets for initial JS, idle Sentry JS, and CSS.
- Replace whole-state `JSON.stringify` equality and full-payload pushes as the data set grows: `hooks/useSyncOrchestrator.ts:45`, `hooks/useSyncOrchestrator.ts:46`, `hooks/useSyncOrchestrator.ts:190`, `hooks/useSyncOrchestrator.ts:192`.
- Move persistence/sync toward normalized entity stores and dirty-entity queues. Current persistence serializes whole arrays: `hooks/usePersistence.ts:36`, `hooks/usePersistence.ts:40`, `hooks/usePersistence.ts:49`, `hooks/usePersistence.ts:57`.

## Code Quality Review

Strengths:

- Main app and Worker both use `strict` TypeScript; main config also enables `noUncheckedIndexedAccess`: `tsconfig.json:22`, `tsconfig.json:23`, `workers/sync-api/tsconfig.json:8`.
- Worker SQL writes use bound parameters in reviewed routes.
- Tests cover sync merges, receipt transparency, CORS boundaries, auth/device checks, and calculations.

Issues and recommendations:

- The local React shim weakens strictness. It permits broad DOM props and `any` event payloads: `react-shim.d.ts:8`, `react-shim.d.ts:136`, `react-shim.d.ts:143`, `react-shim.d.ts:146`. Add `@types/react` and `@types/react-dom`, then remove the shim.
- The test helper imports `act` from `react-dom/test-utils`, which React 19 warns against: `test-support/testing-library-react.ts:1`, `test-support/testing-library-react.ts:3`, `react-shim.d.ts:129`. Import `act` from `react`.
- The production build is custom esbuild, not Vite. `package.json` points `build` and `build:vite` to `scripts/build.cmd`: `package.json:8`, `package.json:9`. That means `vite.config.ts` build/manual-chunk/PWA settings are not production source of truth: `vite.config.ts:16`, `vite.config.ts:18`, `vite.config.ts:141`.
- There are likely unused or mis-scoped dependencies if the custom build remains, including `@sentry/react`, `clsx`, `decimal.js-light`, and possibly `vite-plugin-pwa`: `package.json:17`, `package.json:19`, `package.json:20`, `package.json:37`.

## Top 3 Architectural Improvements Before Major Features

1. Build a real auth/session subsystem.
   Use typed auth states, prevent protected calls without a token, add device lifecycle UX, and add production smoke checks for CORS plus `401` readability.

2. Turn receipts into a server-owned object model.
   Add D1 receipt metadata, strict upload validation, generated object names, safe serving rules, status transitions, and a local-only/cloud-synced reconciliation path.

3. Normalize sync and app state.
   Replace full-array persistence/sync with versioned schemas, entity-level deltas, dirty queues, payload limits, and selector-based UI state so performance and conflict handling stay manageable as users accumulate years of tax data.
