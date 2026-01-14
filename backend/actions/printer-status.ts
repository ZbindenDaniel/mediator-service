import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'printer-status',
  label: 'Printer status',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/printer/status' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const status = await ctx.testPrinterConnection();
      if (!status?.ok) {
        console.warn('Printer status not ok', { reason: status?.reason });
      }
      sendJson(res, 200, { ok: status?.ok === true, reason: status?.reason });
    } catch (err) {
      console.error('Printer status failed', err);
      sendJson(res, 500, { ok: false, reason: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Printer status API</p></div>'
});

export default action;
