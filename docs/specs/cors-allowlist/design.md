# cors-allowlist — design

## Goal

Tighten the CORS implementation. The 2026-04-12 audit flagged a `*` wildcard, but that's already been fixed — `workers/sync-api/src/lib/cors.ts` ships an allowlist + Pages preview regex. This spec closes the remaining gaps: silently-falling-back-to-production for unknown origins (which masks bugs), no preflight rejection, and no test coverage of allowlist boundaries.

## Context

### Current implementation review

`workers/sync-api/src/lib/cors.ts` (32 lines):
- `ALLOWED_ORIGINS` array with prod, preview, localhost:3000, localhost:4173
- `PAGES_PREVIEW_RE` matches `https://<hex>.drivertax.pages.dev`
- `getCorsHeaders(request)` reads `Origin`; if it's allowlisted, echoes it back; **otherwise falls back to the production origin** (line 19)
- `handleOptions` returns 204 with `getCorsHeaders` — accepts preflight from any origin (because the headers always set *something*)

### Why the fallback is a problem

Echoing `Access-Control-Allow-Origin: https://drivertax.rudradigital.uk` for a request from `https://evil.example` doesn't grant `evil.example` access — the browser still blocks the response read because the origins don't match. So it's not an exploit. But:
1. It hides misconfiguration: a typo in a dev origin returns "success" with the production origin set, swallowing the error.
2. It wastes 1 byte and a header allocation per malicious request.
3. It makes preflight requests from random origins succeed at the HTTP level (204 response) when they should clearly fail at the application level.

The cleaner stance: if the origin isn't allowlisted, return no `Access-Control-Allow-Origin` header. The browser blocks the request without ambiguity.

### Why config-driven allowlist

When we ship a staging environment or invite a beta tester via Cloudflare Access, we shouldn't have to recompile the worker. `env.EXTRA_ALLOWED_ORIGINS` (comma-separated) gives us a runtime knob.

## Approach

### Phase 1 — `cors.ts` rewrite

```
function getAllowedOrigins(env): Set<string>
function isAllowedOrigin(origin, env): boolean
function getCorsHeaders(request, env): Record<string, string>  // no fallback
function handleOptions(request, env): Response  // 403 if origin not allowed
```

Key change: `getCorsHeaders` now returns either the full CORS header set (allowlisted) OR an object with only `Vary: Origin` (not allowlisted). Callers don't need to branch — they always merge the result.

### Phase 2 — Update call sites

Every caller of `getCorsHeaders(request)` needs to pass `env`. Search-and-replace via grep:
```
grep -rn 'getCorsHeaders(request)' workers/sync-api/src
```
Update each call site to `getCorsHeaders(request, env)`.

`handleOptions(request)` similarly becomes `handleOptions(request, env)` and returns 403 instead of 204 for unknown origins.

### Phase 3 — Tests

`workers/sync-api/test/cors.test.ts` (new):
- helper builds a `Request` with a given Origin header and an `env` with default allowlist
- 8 cases per R7

### Phase 4 — Header inventory

Audit `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` against actual route usage. As of today:
- `GET` — used by `/health`, `/sync/pull`, `/plaid/status`, `/admin/...`
- `POST` — used by `/auth/register`, `/auth/session`, `/sync/push`, `/receipts/request-upload`, `/feedback`, `/events`, `/plaid/disconnect`
- `DELETE` — currently unused except in proposed `/auth/devices/:suffix` (cross-device-restore spec). Keep it; it's coming.
- `OPTIONS` — preflight; required.

Headers:
- `Content-Type` — JSON bodies, required
- `X-Device-ID` — sent by `services/sessionManager.ts:buildAuthHeaders`
- `X-Session-Token` — same source
- `Authorization` — accepted by `lib/auth.ts:getAuthenticatedAccountId` as a `Bearer` fallback

All currently used. No removals; add a comment block in `cors.ts` documenting the rationale per entry.

### Phase 5 — Optional: log denied origins

Add `console.log({ event: 'cors_denied', origin })` for unrecognised origins so we can spot misconfigured legitimate clients in worker logs (not Sentry — too noisy).

## Out of scope

- Per-route CORS policies (different methods per endpoint). The current uniform policy is fine.
- Preflight caching with `Access-Control-Max-Age`. Consider a follow-up if preflight latency becomes a concern.
- Origin migration tooling. Allowlist changes are infrequent and code-reviewed.
- CSRF tokens for cookie-bearing requests — not applicable; bearer-token model.

## Testing

1. Unit (vitest): `workers/sync-api/test/cors.test.ts` — 8 cases per R7.
2. Integration smoke (manual):
   - `curl -i -H "Origin: https://drivertax.rudradigital.uk" https://drivertax-sync-api.cvchaudhary.workers.dev/api/health` → 200 with allowlist headers
   - `curl -i -H "Origin: https://evil.example" ...` → 200 (health is public) but NO `Access-Control-Allow-Origin` header
   - `curl -i -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" ...` → 403
3. Production smoke after deploy: open `https://drivertax.rudradigital.uk` in a browser, perform a sync, verify no console CORS errors.
4. Regression: `cd workers/sync-api && npm test`.
