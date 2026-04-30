import { handleOptions, withCorsHeaders } from './lib/cors';
import { handleBackfillPlaidEncryption } from './routes/admin';
import { handleAuthRegister, handleAuthSession, handleDeleteDevice, handleListDevices } from './routes/auth';
import { handleEvents } from './routes/events';
import { handleFeedback } from './routes/feedback';
import { handleHealth } from './routes/health';
import { handlePlaidDisconnect, handlePlaidStatus } from './routes/plaid';
import {
  handleDeleteReceipt,
  handleGetReceipt,
  handleMigrateLegacy,
  handleRequestUpload,
} from './routes/receipts';
import { handleSyncDeleteAccount, handleSyncPull, handleSyncPush } from './routes/sync';

export interface Env {
  DB: D1Database;
  RECEIPTS: R2Bucket;
  ANALYTICS: AnalyticsEngineDataset;
  SESSION_SECRET: string;
  ADMIN_TOKEN: string;
  PLAID_TOKEN_KEY: string;
  PLAID_TOKEN_KEY_V2?: string;
  EXTRA_ALLOWED_ORIGINS?: string;
}

async function routeRequest(request: Request, env: Env): Promise<Response> {
  const { pathname: path } = new URL(request.url);
  const method = request.method;

  if (path === '/api/health' && method === 'GET') return await handleHealth(request, env);
  if (path === '/api/auth/register' && method === 'POST') return await handleAuthRegister(request, env);
  if (path === '/api/auth/session' && method === 'POST') return await handleAuthSession(request, env);
  if (path === '/api/auth/devices' && method === 'GET') return await handleListDevices(request, env);
  if (path.startsWith('/api/auth/devices/') && method === 'DELETE') {
    return await handleDeleteDevice(request, env, decodeURIComponent(path.slice('/api/auth/devices/'.length)));
  }
  if (path === '/api/admin/plaid/backfill-encryption' && method === 'POST') return await handleBackfillPlaidEncryption(request, env);
  if (path === '/api/events' && method === 'POST') return await handleEvents(request, env);
  if (path === '/feedback' && method === 'POST') return await handleFeedback(request, env);
  if (path === '/sync/push' && method === 'POST') return await handleSyncPush(request, env);
  if (path === '/sync/pull' && (method === 'GET' || method === 'POST')) return await handleSyncPull(request, env);
  if (path === '/sync/account' && method === 'DELETE') return await handleSyncDeleteAccount(request, env);
  if (path === '/api/plaid/status' && method === 'GET') return await handlePlaidStatus(request, env);
  if (path === '/api/plaid/disconnect' && method === 'POST') return await handlePlaidDisconnect(request, env);
  if (path === '/api/receipts/request-upload' && method === 'POST') return await handleRequestUpload(request, env);
  if (path === '/api/receipts/migrate-legacy' && method === 'POST') return await handleMigrateLegacy(request, env);

  if (path.startsWith('/api/receipts/') && method === 'GET') {
    return await handleGetReceipt(request, env, decodeURIComponent(path.slice('/api/receipts/'.length)));
  }

  if (path.startsWith('/api/receipts/') && method === 'DELETE') {
    return await handleDeleteReceipt(request, env, decodeURIComponent(path.slice('/api/receipts/'.length)));
  }

  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return handleOptions(request, env);

    try {
      return withCorsHeaders(request, await routeRequest(request, env), env);
    } catch {
      return withCorsHeaders(request, new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }), env);
    }
  },
};
