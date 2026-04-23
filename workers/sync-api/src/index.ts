import { getCorsHeaders, handleOptions } from './lib/cors';
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
  RECEIPT_SECRET: string;
  ADMIN_TOKEN: string;
  PLAID_TOKEN_KEY: string;
  PLAID_TOKEN_KEY_V2?: string;
  EXTRA_ALLOWED_ORIGINS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === 'OPTIONS') return handleOptions(request, env);

      const { pathname: path } = new URL(request.url);
      const method = request.method;

      if (path === '/api/health' && method === 'GET') return handleHealth(request, env);
      if (path === '/api/auth/register' && method === 'POST') return handleAuthRegister(request, env);
      if (path === '/api/auth/session' && method === 'POST') return handleAuthSession(request, env);
      if (path === '/api/auth/devices' && method === 'GET') return handleListDevices(request, env);
      if (path.startsWith('/api/auth/devices/') && method === 'DELETE') {
        return handleDeleteDevice(request, env, decodeURIComponent(path.slice('/api/auth/devices/'.length)));
      }
      if (path === '/api/admin/plaid/backfill-encryption' && method === 'POST') return handleBackfillPlaidEncryption(request, env);
      if (path === '/api/events' && method === 'POST') return handleEvents(request, env);
      if (path === '/feedback' && method === 'POST') return handleFeedback(request, env);
      if (path === '/sync/push' && method === 'POST') return handleSyncPush(request, env);
      if (path === '/sync/pull' && (method === 'GET' || method === 'POST')) return handleSyncPull(request, env);
      if (path === '/sync/account' && method === 'DELETE') return handleSyncDeleteAccount(request, env);
      if (path === '/api/plaid/status' && method === 'GET') return handlePlaidStatus(request, env);
      if (path === '/api/plaid/disconnect' && method === 'POST') return handlePlaidDisconnect(request, env);
      if (path === '/api/receipts/request-upload' && method === 'POST') return handleRequestUpload(request, env);
      if (path === '/api/receipts/migrate-legacy' && method === 'POST') return handleMigrateLegacy(request, env);

      if (path.startsWith('/api/receipts/') && method === 'GET') {
        return handleGetReceipt(request, env, decodeURIComponent(path.slice('/api/receipts/'.length)));
      }

      if (path.startsWith('/api/receipts/') && method === 'DELETE') {
        return handleDeleteReceipt(request, env, decodeURIComponent(path.slice('/api/receipts/'.length)));
      }

      return new Response('Not Found', { status: 404, headers: getCorsHeaders(request, env) });
    } catch {
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500,
        headers: { ...getCorsHeaders(request, env), 'Content-Type': 'application/json' },
      });
    }
  },
};
