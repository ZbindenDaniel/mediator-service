import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'admin-nightly-erp-sync',
  label: 'Admin: Nightly ERP Sync Toggle',
  appliesTo: () => false,
  matches: (path, method) =>
    path === '/api/admin/nightly-erp-sync' && (method === 'GET' || method === 'POST'),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!requireAdminAuth(req, res)) return;

    if (req.method === 'GET') {
      const value = await ctx.getSystemSetting('erp_nightly_sync_enabled');
      sendJson(res, 200, { enabled: value === 'true' });
      return;
    }

    // POST — read body and toggle
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' });
      return;
    }
    const enabled = (parsed as any)?.enabled;
    if (typeof enabled !== 'boolean') {
      sendJson(res, 400, { error: 'enabled must be a boolean' });
      return;
    }
    await ctx.setSystemSetting('erp_nightly_sync_enabled', enabled ? 'true' : 'false');
    sendJson(res, 200, { enabled });
  },
  view: () => ''
});

export default action;
