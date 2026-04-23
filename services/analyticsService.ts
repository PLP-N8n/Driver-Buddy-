import { getDeviceId } from './deviceId';

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const WORKER_URL = env?.VITE_SYNC_WORKER_URL ?? '';

let analyticsConsent = false;

export function setAnalyticsConsent(consent: boolean): void {
  analyticsConsent = consent;
}

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (!WORKER_URL || !analyticsConsent) return;

  globalThis.setTimeout(() => {
    void fetch(`${WORKER_URL}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': getDeviceId(),
      },
      body: JSON.stringify({
        event,
        properties: properties ?? {},
      }),
    }).catch(() => {});
  }, 1);
}
