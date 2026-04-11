# Environment Variables

`VITE_SENTRY_DSN`
Sentry DSN for the frontend app. Get this from Sentry project settings.

`VITE_ENV`
Deployment environment label, for example `production` or `staging`.

`VITE_APP_VERSION`
App release string sent to Sentry. If omitted, the custom build falls back to `package.json` version.

`SENTRY_AUTH_TOKEN`
CI-only token for Sentry source map upload. Local builds can leave this unset.

`RECEIPT_SECRET`
Shared HMAC secret used by receipt upload/read requests and validated by the Cloudflare worker. Set this in the worker environment, and make the same value available at build time for the current static app flow so the browser can sign receipt requests.
