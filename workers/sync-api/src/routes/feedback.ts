import { jsonErr, jsonOk } from '../lib/json';

export interface Env {
  DB: D1Database;
}

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  const deviceId = request.headers.get('X-Device-ID');

  let body: { type?: string; message?: string; page?: string };
  try {
    body = (await request.json()) as { type?: string; message?: string; page?: string };
  } catch {
    return jsonErr(request, 'invalid json');
  }

  if (!body.message || !body.type) return jsonErr(request, 'type and message required');

  const id = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    'INSERT INTO feedback (id, device_id, type, message, app_page, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, deviceId ?? null, body.type, body.message, body.page ?? null, Date.now()).run();

  return jsonOk(request, { ok: true });
}
