import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { requireAdminAuth } from '../utils/admin-auth';
import { queryOne, query } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'admin-label-queue',
  label: 'Admin: label queue',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/admin/label-queue' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, _ctx: any) {
    if (!requireAdminAuth(req, res)) return;
    try {
      const pendingRow = await queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM label_queue WHERE "Status" = $1`, ['Queued']);
      const failedRow = await queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM label_queue WHERE "Status" = $1`, ['Error']);
      const recentFailed = await query(
        `SELECT "Id", "ItemUUID", "CreatedAt", "Error" FROM label_queue WHERE "Status" = $1 ORDER BY "Id" DESC LIMIT 10`,
        ['Error']
      );
      sendJson(res, 200, { pending: pendingRow?.c ?? 0, failed: failedRow?.c ?? 0, recentFailed });
    } catch (err) {
      console.error('[admin-label-queue] Failed to query label queue', err);
      sendJson(res, 500, { error: 'Failed to load label queue' });
    }
  },
  view: () => '<div class="card"><p class="muted">Admin label queue API</p></div>'
});

export default action;
