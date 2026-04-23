# Environment Variables

## Local development

Use `.env.development.local` for local-only overrides. It is ignored by git and is loaded by `npm run dev`.

Recommended local defaults:

```ini
VITE_SYNC_WORKER_URL=
VITE_SENTRY_DSN=
```

This keeps localhost offline-first and avoids CORS or Sentry ingest noise while you are working locally. Keep production/staging values in deployment configuration, or in `.env.local` only when you intentionally need a production-like local build.

## Frontend runtime

`VITE_SENTRY_DSN`
Sentry DSN for the frontend app. Get this from Sentry project settings.

`VITE_ENV`
Deployment environment label, for example `production` or `staging`.

`VITE_APP_VERSION`
App release string sent to Sentry. If omitted, the custom build falls back to `package.json` version.

`VITE_SYNC_WORKER_URL`
Cloudflare Worker base URL used for optional sync, receipts, feedback, Plaid, and analytics events. Leave blank for local-only development.

## Build and worker secrets

`SENTRY_AUTH_TOKEN`
CI-only token for Sentry source map upload. Local builds can leave this unset.

`RECEIPT_SECRET`
Worker-only HMAC secret used to sign and verify sync/receipt session tokens. Set it with Wrangler or deployment secrets only; do not expose it as a `VITE_` variable or build-time frontend variable.

`ADMIN_TOKEN`
Worker-only bearer token for admin maintenance routes such as Plaid token backfill.

`PLAID_TOKEN_KEY`
Worker-only 64-character hex AES key for Plaid access-token encryption. `PLAID_TOKEN_KEY_V2` is reserved for key rotation.
