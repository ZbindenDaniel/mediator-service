import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'admin-label-queue',
  label: 'Admin: label queue',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/admin/label-queue' && method === 'GET',
  handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    if (!requireAdminAuth(req, res)) return;
    try {
      const pending = (ctx.db.prepare(`SELECT COUNT(*) as c FROM label_queue WHERE Status = 'Queued'`).get() as { c: number }).c;
      const failed = (ctx.db.prepare(`SELECT COUNT(*) as c FROM label_queue WHERE Status = 'Error'`).get() as { c: number }).c;
      const recentFailed = ctx.db.prepare(
        `SELECT Id, ItemUUID, CreatedAt, Error FROM label_queue WHERE Status = 'Error' ORDER BY Id DESC LIMIT 10`
      ).all();
      sendJson(res, 200, { pending, failed, recentFailed });
    } catch (err) {
      console.error('[admin-label-queue] Failed to query label queue', err);
      sendJson(res, 500, { error: 'Failed to load label queue' });
    }
  },
  view: () => '<div class="card"><p class="muted">Admin label queue API</p></div>'
});

export default action;
