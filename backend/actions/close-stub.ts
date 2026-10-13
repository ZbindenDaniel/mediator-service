import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { resolveActor } from '../utils/actor';
import { guardWrite } from '../utils/write-guard';
import { queryOne } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  feature: 'stubs',
  key: 'close-stub',
  label: 'Close stub',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/stubs\/[^/]+$/.test(path) && method === 'DELETE',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const pathParts = url.pathname.split('/');
      const id = pathParts[pathParts.length - 1] ?? '';
      if (!id) return sendJson(res, 400, { error: 'id is required' });
      // A stub belongs to its shelf's org.
      const stub = await queryOne<{ ShelfId: string }>(`SELECT "ShelfId" FROM box_stubs WHERE "Id" = $1`, [id]);
      if (stub && !(await guardWrite(ctx, res, 'box', stub.ShelfId))) return;

      const closedBy = resolveActor(ctx, url.searchParams.get('closedBy')) || 'unknown';
      const closedAt = new Date().toISOString();

      const closed = await ctx.closeStub(id, closedBy, closedAt);
      if (!closed) return sendJson(res, 404, { error: 'Stub not found or already closed' });

      res.writeHead(204);
      res.end();
    } catch (err) {
      console.error('close-stub failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Close stub API</p></div>'
});

export default action;
