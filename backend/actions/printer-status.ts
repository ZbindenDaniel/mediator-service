import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'printer-status',
  label: 'Printer status',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/printer/status' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const ok = await ctx.testPrinterConnection();
      sendJson(res, 200, { ok });
    } catch (err) {
      console.error('Printer status failed', err);
      sendJson(res, 500, { ok: false, error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Printer status API</p></div>'
};

export default action;
