import { jsonOk } from '../lib/json';

export interface Env {
  EXTRA_ALLOWED_ORIGINS?: string;
}

export async function handleHealth(request: Request, env?: Env): Promise<Response> {
  return jsonOk(request, { status: 'ok', ts: Date.now() }, 200, env);
}
