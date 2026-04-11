import { jsonErr, jsonOk } from '../lib/json';
import { issueSessionToken } from '../lib/session';

export interface Env {
  RECEIPT_SECRET: string;
}

export async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  let body: { accountId?: string };

  try {
    body = (await request.json()) as { accountId?: string };
  } catch {
    return jsonErr('invalid json');
  }

  if (!body.accountId || typeof body.accountId !== 'string') {
    return jsonErr('accountId required');
  }

  if (!/^[a-zA-Z0-9-]{6,36}$/.test(body.accountId)) {
    return jsonErr('invalid accountId');
  }

  const token = await issueSessionToken(body.accountId, env.RECEIPT_SECRET);
  return jsonOk({ token, expiresIn: 3600 });
}
