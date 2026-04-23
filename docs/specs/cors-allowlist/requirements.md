# cors-allowlist — requirements

## R1 — Unrecognised origins SHALL receive no `Access-Control-Allow-Origin` header

**The system SHALL** change `getCorsHeaders` (`workers/sync-api/src/lib/cors.ts`) so that requests from origins NOT in the allowlist (and NOT matching the Pages preview regex) receive a response with NO `Access-Control-Allow-Origin` header. The current behaviour silently falls back to the production origin, which lets attackers trigger preflight failures cleanly but masks misconfiguration.

**Acceptance:** `curl -i -H "Origin: https://evil.example" https://drivertax-sync-api.cvchaudhary.workers.dev/api/health` returns a response WITHOUT `Access-Control-Allow-Origin`. The browser blocks the cross-origin read by default.

## R2 — Allowlist SHALL be config-driven, not hardcoded

**The system SHALL** read additional allowed origins from `env.EXTRA_ALLOWED_ORIGINS` (comma-separated string) so non-production origins (staging, demo) can be added without code changes.

**Acceptance:** set `EXTRA_ALLOWED_ORIGINS=https://staging.example` via `wrangler secret put`; `curl -i -H "Origin: https://staging.example"` returns the matching `Access-Control-Allow-Origin: https://staging.example`.

## R3 — Preflight requests SHALL only succeed for allowlisted origins

**The system SHALL** ensure `handleOptions` returns `204` only when the request's origin is allowlisted; for unrecognised origins it returns `403` with no CORS headers.

**Acceptance:** `curl -i -X OPTIONS -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST"` returns `403`; same call with `Origin: https://drivertax.rudradigital.uk` returns `204` with the expected headers.

## R4 — Vary: Origin SHALL be present on every CORS response

**The system SHALL** preserve the `Vary: Origin` header on every response (success and rejection) so caches don't leak headers across origins.

**Acceptance:** `curl -i` for any cross-origin request shows `Vary: Origin` in the response headers.

## R5 — Allowed methods and headers SHALL be the minimum required

**The system SHALL** review `Access-Control-Allow-Methods` (`GET, POST, DELETE, OPTIONS`) and `Access-Control-Allow-Headers` (`Content-Type, X-Device-ID, X-Session-Token, Authorization`) and remove any unused entries. Document the rationale for each in a comment in `cors.ts`.

**Acceptance:** every method listed appears in at least one route handler; every header listed is read by at least one route. `grep -r '"X-Device-ID"' workers/sync-api/src` confirms each header is used.

## R6 — `Access-Control-Allow-Credentials` SHALL NOT be set

**The system SHALL** explicitly omit `Access-Control-Allow-Credentials: true` because the worker uses bearer tokens, not cookies. This prevents browser-level credential leakage in case the allowlist is later loosened.

**Acceptance:** `grep -i "allow-credentials" workers/sync-api/src` returns no matches.

## R7 — Tests SHALL cover allowlist boundaries

**The system SHALL** add unit tests in `workers/sync-api/test/cors.test.ts` covering:
- exact-match production origin → allowed
- exact-match localhost dev port → allowed
- Pages preview hash → allowed
- arbitrary origin → no `Access-Control-Allow-Origin` header
- empty / missing `Origin` header → no header
- spoofed `Origin` lookalike (`https://drivertax.rudradigital.uk.evil.com`) → blocked

**Acceptance:** `cd workers/sync-api && npm test -- cors` passes all 6 cases.

## R8 — No regression on existing routes

**The system SHALL** preserve every working CORS interaction with the live frontend (`https://drivertax.rudradigital.uk`).

**Acceptance:** post-deploy, the production frontend continues to make `pull`, `push`, `auth`, `events`, `feedback`, and `receipts` requests without console errors.
