import { jsonErr, jsonOk } from '../lib/json';
import { checkRateLimit } from '../lib/rateLimit';

export interface Env {
  DB: D1Database;
  ANALYTICS: AnalyticsEngineDataset;
  EXTRA_ALLOWED_ORIGINS?: string;
}

export async function handleEvents(request: Request, env: Env): Promise<Response> {
  const deviceId = request.headers.get('X-Device-ID');
  if (!deviceId) return jsonErr(request, 'Missing X-Device-ID header', 400, env);

  const { limited } = await checkRateLimit(request, 'events', env.DB, 60, deviceId);
  if (limited) return jsonErr(request, 'too many requests', 429, env);

  if (!env.ANALYTICS) return jsonErr(request, 'Analytics engine is not configured', 503, env);

  let body: { event?: string; properties?: Record<string, unknown> };
  try {
    body = (await request.json()) as { event?: string; properties?: Record<string, unknown> };
  } catch {
    return jsonErr(request, 'invalid json', 400, env);
  }

  const event = typeof body.event === 'string' ? body.event : '';
  const properties =
    body.properties && typeof body.properties === 'object' && !Array.isArray(body.properties)
      ? body.properties
      : {};

  if (!event) return jsonErr(request, 'event is required', 400, env);

  env.ANALYTICS.writeDataPoint({
    blobs: [event, JSON.stringify(properties)],
    doubles: [Date.now()],
    indexes: [deviceId],
  });

  return jsonOk(request, { ok: true }, 202, env);
}
