import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'box-detail',
  label: 'Box detail',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/boxes\/[^/]+$/.test(path) && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/boxes\/([^/]+)/);
      const id = match ? decodeURIComponent(match[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'Invalid box id' });
      const box = ctx.getBox.get(id);
      if (!box) return sendJson(res, 404, { error: 'not found' });
      const items = ctx.itemsByBox.all(id);
      const events = ctx.listEventsForBox.all(id);
      sendJson(res, 200, { box, items, events });
    } catch (err) {
      console.error('Box detail failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Box detail API</p></div>'
});

export default action;
