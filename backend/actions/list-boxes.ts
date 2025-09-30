import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'list-boxes',
  label: 'List boxes',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/boxes' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const boxes = ctx.listBoxes.all();
      console.log('list-boxes', boxes.length);
      sendJson(res, 200, { boxes });
    } catch (err) {
      console.error('List boxes failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">List boxes API</p></div>'
};

export default action;
