import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'overview',
  label: 'Overview',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/overview' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const counts = {
        boxes: ctx.countBoxes.get().c || 0,
        items: ctx.countItems.get().c || 0,
        itemsNoWms: ctx.countItemsNoWms.get().c || 0
      };
      const recentBoxes = ctx.listRecentBoxes.all();
      const recentEvents = ctx.listRecentEvents.all();
      sendJson(res, 200, { counts, recentBoxes, recentEvents });
    } catch (err) {
      console.error('Overview endpoint failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Overview API</p></div>'
};

export default action;
