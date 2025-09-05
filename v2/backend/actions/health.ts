import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'health',
  label: 'Health',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/health' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse) {
    try {
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Health endpoint failed', err);
      sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Health API</p></div>'
};

export default action;
