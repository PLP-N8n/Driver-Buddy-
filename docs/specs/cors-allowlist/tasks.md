# cors-allowlist — tasks

## Task 1 — Refactor `cors.ts` (no-fallback + env support)

- [ ] Open `C:/Projects/ventures/Driver-Buddy/workers/sync-api/src/lib/cors.ts`
- [ ] Add `Env` import or local interface: `{ EXTRA_ALLOWED_ORIGINS?: string }`
- [ ] Add helper `function getAllowedOrigins(env: { EXTRA_ALLOWED_ORIGINS?: string }): Set<string>`:
  - returns `new Set([...ALLOWED_ORIGINS, ...(env.EXTRA_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])])`
- [ ] Update `isAllowedOrigin(origin, env)` to use the merged set
- [ ] Refactor `getCorsHeaders(request, env)`:
  - if origin allowlisted → return full CORS headers
  - else → return only `{ Vary: 'Origin' }` (no `Access-Control-Allow-*`)
- [ ] Refactor `handleOptions(request, env)`:
  - if origin allowlisted → return 204 with full CORS headers
  - else → return 403 with `{ Vary: 'Origin' }` header only
- [ ] Add a comment block at the top of the file listing each method/header and why it's needed
- [ ] Verify: `cd workers/sync-api && npx tsc --noEmit` passes
- [ ] Commit: `feat(cors): drop production-fallback for unknown origins, add env override`

## Task 2 — Update all `getCorsHeaders` call sites

- [ ] `grep -rn 'getCorsHeaders(request)' C:/Projects/ventures/Driver-Buddy/workers/sync-api/src`
- [ ] For each call site, change to `getCorsHeaders(request, env)`
- [ ] `grep -rn 'handleOptions(request)' C:/Projects/ventures/Driver-Buddy/workers/sync-api/src`
- [ ] For each call site, change to `handleOptions(request, env)`
- [ ] Verify: `npx tsc --noEmit` passes; no remaining single-arg calls
- [ ] Commit: `refactor(routes): pass env to CORS helpers`

## Task 3 — Add cors unit tests

- [ ] Create `C:/Projects/ventures/Driver-Buddy/workers/sync-api/test/cors.test.ts`
- [ ] Helper to build a `Request` with a given Origin header
- [ ] Cases (R7):
  - prod origin → allowed
  - localhost:3000 → allowed
  - Pages preview hash (`https://abc123.drivertax.pages.dev`) → allowed
  - arbitrary origin (`https://evil.example`) → no `Access-Control-Allow-Origin`, has `Vary: Origin`
  - empty Origin → no `Access-Control-Allow-Origin`
  - lookalike (`https://drivertax.rudradigital.uk.evil.com`) → blocked
  - `EXTRA_ALLOWED_ORIGINS=https://staging.example` → staging origin allowed
  - `handleOptions` with evil origin → 403
- [ ] Verify: `cd workers/sync-api && npm test -- cors` passes all 8 cases
- [ ] Commit: `test(cors): allowlist boundaries and env override`

## Task 4 — Optional logging of denied origins

- [ ] In `getCorsHeaders` and `handleOptions`, when an origin is rejected, `console.log(JSON.stringify({ event: 'cors_denied', origin, path: new URL(request.url).pathname }))`
- [ ] Verify: in `wrangler tail`, denied requests appear with structured log line
- [ ] Commit: `chore(cors): log denied origins for misconfiguration debugging`

## Task 5 — Deploy and verify production

- [ ] Deploy: `cd workers/sync-api && npx wrangler deploy`
- [ ] Manual checks:
  - `curl -i -H "Origin: https://drivertax.rudradigital.uk" https://drivertax-sync-api.cvchaudhary.workers.dev/api/health` → 200 with `Access-Control-Allow-Origin: https://drivertax.rudradigital.uk`
  - `curl -i -H "Origin: https://evil.example" https://drivertax-sync-api.cvchaudhary.workers.dev/api/health` → 200 with NO `Access-Control-Allow-Origin`, but has `Vary: Origin`
  - `curl -i -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" https://drivertax-sync-api.cvchaudhary.workers.dev/api/sync/push` → 403
- [ ] Open the live frontend in a browser; trigger a sync; assert no CORS errors in DevTools console
- [ ] Commit: `chore(deploy): cors hardening live`

## Task 6 — Regression sweep

- [ ] `cd workers/sync-api && npm test`
- [ ] Browser smoke: production frontend syncs cleanly
- [ ] No commit (verification only)
