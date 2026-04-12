import { jsonOk } from '../lib/json';

export async function handleHealth(request: Request): Promise<Response> {
  return jsonOk(request, { status: 'ok', ts: Date.now() });
}
