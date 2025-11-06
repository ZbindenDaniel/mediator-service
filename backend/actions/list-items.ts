import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'list-items',
  label: 'List items',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/items' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const items = ctx.listItems.all();
      console.log('list-items', items.length);
      sendJson(res, 200, { items });
    } catch (err) {
      console.error('List items failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">List items API</p></div>'
});

export default action;
