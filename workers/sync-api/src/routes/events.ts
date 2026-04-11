import { jsonErr, jsonOk } from '../lib/json';

export interface Env {
  ANALYTICS: AnalyticsEngineDataset;
}

export async function handleEvents(request: Request, env: Env): Promise<Response> {
  const deviceId = request.headers.get('X-Device-ID');
  if (!deviceId) return jsonErr('Missing X-Device-ID header');
  if (!env.ANALYTICS) return jsonErr('Analytics engine is not configured', 503);

  let body: { event?: string; properties?: Record<string, unknown> };
  try {
    body = (await request.json()) as { event?: string; properties?: Record<string, unknown> };
  } catch {
    return jsonErr('invalid json');
  }

  const event = typeof body.event === 'string' ? body.event : '';
  const properties =
    body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
      ? body.properties
      : {};

  if (!event) return jsonErr('event is required');

  env.ANALYTICS.writeDataPoint({
    blobs: [event, JSON.stringify(properties)],
    doubles: [Date.now()],
    indexes: [deviceId],
  });

  return jsonOk({ ok: true }, 202);
}
