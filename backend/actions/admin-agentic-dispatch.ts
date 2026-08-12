import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Admin toggle for the agentic keep-busy auto-feeder. When disabled, the dispatcher stops feeding
// never-started runs into the queue (explicit, user-triggered enrichments still run). Default ON when
// unset — only an explicit 'false' disables — so upgrades keep the prior behavior.
const SETTING_KEY = 'agentic_auto_dispatch_enabled';

const action = defineHttpAction({
  key: 'admin-agentic-dispatch',
  label: 'Admin: Agentic Auto-Dispatch Toggle',
  appliesTo: () => false,
  matches: (path, method) =>
    path === '/api/admin/agentic-dispatch' && (method === 'GET' || method === 'POST'),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!requireAdminAuth(req, res)) return;

    if (req.method === 'GET') {
      const value = await ctx.getSystemSetting(SETTING_KEY);
      sendJson(res, 200, { enabled: value !== 'false' });
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
    await ctx.setSystemSetting(SETTING_KEY, enabled ? 'true' : 'false');
    sendJson(res, 200, { enabled });
  },
  view: () => ''
});

export default action;
