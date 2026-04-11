import { useEffect } from 'react';
import type { Settings } from '../types';
import { getDeviceId } from '../services/deviceId';

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const WORKER_BASE_URL = env?.VITE_SYNC_WORKER_URL ?? '';
const EVENTS_ENDPOINT = WORKER_BASE_URL ? `${WORKER_BASE_URL}/api/events` : '';

type TrackEvent = (name: string, props?: Record<string, unknown>) => void;

async function postEvent(settings: Settings, name: string, props: Record<string, unknown>) {
  if (!settings.analyticsConsent) return;
  if (!EVENTS_ENDPOINT || !navigator.onLine) return;

  try {
    const response = await fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': getDeviceId(),
      },
      keepalive: true,
      body: JSON.stringify({ event: name, properties: props }),
    });

    if (!response.ok) {
      return;
    }
  } catch {
    // Analytics are strictly best-effort and must stay invisible to users.
  }
}

export function useAnalytics(settings: Settings): { trackEvent: TrackEvent } {
  const trackEvent: TrackEvent = (name, props = {}) => {
    void postEvent(settings, name, props);
  };

  useEffect(() => {
    void postEvent(settings, 'app_opened', {});
  }, []);

  return { trackEvent };
}
