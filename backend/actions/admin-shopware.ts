import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { SHOPWARE_CONFIG, SHOPWARE_SYNC_ENABLED, getShopwareConfigIssues } from '../config';
import { createShopwareClient, type ShopwareConnectionResult } from '../shopware/client';
import { getShopwareSyncQueueCounts, enqueueShopwareSyncForShopRefs } from '../db';
import { requireAdminAuth } from '../utils/admin-auth';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Never echo secrets — only whether each credential is present, and which auth mode results.
type CredentialMode = 'client_credentials' | 'access_token_only' | 'none';

function resolveCredentialMode(): CredentialMode {
  const creds = SHOPWARE_CONFIG.credentials;
  if (creds.clientId && creds.clientSecret) return 'client_credentials';
  if (creds.accessToken) return 'access_token_only';
  return 'none';
}

function buildConfigSummary() {
  const credentialMode = resolveCredentialMode();
  return {
    enabled: SHOPWARE_CONFIG.enabled,
    baseUrl: SHOPWARE_CONFIG.baseUrl,
    salesChannelConfigured: Boolean(SHOPWARE_CONFIG.salesChannelAccessKey),
    credentialMode,
    requestTimeoutMs: SHOPWARE_CONFIG.requestTimeoutMs,
    issues: getShopwareConfigIssues(),
    // Both auth modes (client credentials and a static access token) can drive a live check.
    checkSupported: SHOPWARE_CONFIG.enabled && credentialMode !== 'none'
  };
}

const action = defineHttpAction({
  key: 'admin-shopware',
  label: 'Admin: Shopware status & connection check',
  appliesTo: () => false,
  matches: (path, method) =>
    (path === '/api/admin/shopware/status' && method === 'GET') ||
    (path === '/api/admin/shopware/check' && method === 'POST') ||
    (path === '/api/admin/shopware/sync' && method === 'POST'),
  async handle(req: IncomingMessage, res: ServerResponse) {
    if (!requireAdminAuth(req, res)) return;

    const url = req.url || '';

    // POST /sync — manual "Shop-Sync": enqueue a resync of every shop-article ref (the worker drains it).
    if (req.method === 'POST' && url.startsWith('/api/admin/shopware/sync')) {
      if (!SHOPWARE_SYNC_ENABLED) {
        sendJson(res, 200, { ok: false, reason: 'sync_disabled', enqueued: 0 });
        return;
      }
      try {
        const { enqueued, total } = await enqueueShopwareSyncForShopRefs();
        sendJson(res, 200, { ok: true, enqueued, total });
      } catch (error) {
        console.error('[admin-shopware] Manual shop sync failed', error);
        sendJson(res, 500, { ok: false, error: 'Shop sync failed' });
      }
      return;
    }

    // GET /status — cheap summary, no outbound network. Also reports queue depth so an operator can
    // watch jobs accumulate (proof the dispatcher is not yet implemented).
    if (req.method === 'GET') {
      try {
        const queue = await getShopwareSyncQueueCounts();
        sendJson(res, 200, { config: buildConfigSummary(), queue });
      } catch (error) {
        console.error('[admin-shopware] Failed to load status', error);
        sendJson(res, 500, { error: 'Failed to load Shopware status' });
      }
      return;
    }

    // POST /check — actively probe the connection.
    if (req.method === 'POST' && url.startsWith('/api/admin/shopware/check')) {
      const summary = buildConfigSummary();
      if (!summary.enabled) {
        sendJson(res, 200, { ok: false, reason: 'disabled', config: summary });
        return;
      }
      if (summary.credentialMode === 'none') {
        sendJson(res, 200, { ok: false, reason: 'no_credentials', config: summary });
        return;
      }

      let result: ShopwareConnectionResult;
      try {
        const client = createShopwareClient(SHOPWARE_CONFIG);
        result = await client.checkConnection();
      } catch (error) {
        // Constructor throws on missing base URL / credentials / sales channel — report, don't 500.
        console.warn('[admin-shopware] Connection check could not run', error);
        sendJson(res, 200, {
          ok: false,
          reason: 'config_error',
          message: error instanceof Error ? error.message : 'Shopware client could not be created',
          config: summary
        });
        return;
      }

      sendJson(res, 200, { ...result, config: summary });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  },
  view: () => '<div class="card"><p class="muted">Shopware status &amp; connection check API</p></div>'
});

export default action;
