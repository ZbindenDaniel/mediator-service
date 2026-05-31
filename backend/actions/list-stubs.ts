import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'list-stubs',
  label: 'List stubs',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/stubs' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url ?? '/api/stubs', 'http://localhost');
      const activeOnly = url.searchParams.get('isActive') !== 'false';
      const shelfId = url.searchParams.get('shelfId');
      const stubs = activeOnly ? await ctx.listStubs.active() : await ctx.listStubs.all();
      const filtered = shelfId ? stubs.filter((s: any) => s.ShelfId === shelfId) : stubs;
      sendJson(res, 200, { stubs: filtered });
    } catch (err) {
      console.error('list-stubs failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">List stubs API</p></div>'
});

export default action;
