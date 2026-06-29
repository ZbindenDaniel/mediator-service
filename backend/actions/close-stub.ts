import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
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

      const closedBy = url.searchParams.get('closedBy') ?? 'unknown';
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
