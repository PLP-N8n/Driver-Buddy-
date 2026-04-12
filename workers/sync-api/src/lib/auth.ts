import { verifySessionToken } from './session';

export interface AuthEnv {
  RECEIPT_SECRET: string;
}

export async function getAuthenticatedAccountId(request: Request, env: AuthEnv): Promise<string | null> {
  const sessionHeader = request.headers.get('X-Session-Token');
  if (sessionHeader) {
    const payload = await verifySessionToken(sessionHeader, env.RECEIPT_SECRET);
    if (payload?.sub) return payload.sub;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const payload = await verifySessionToken(token, env.RECEIPT_SECRET);
  return payload?.sub ?? null;
}
