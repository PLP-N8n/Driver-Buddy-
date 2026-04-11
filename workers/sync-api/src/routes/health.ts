import { jsonOk } from '../lib/json';

export async function handleHealth(): Promise<Response> {
  return jsonOk({ status: 'ok', ts: Date.now() });
}
