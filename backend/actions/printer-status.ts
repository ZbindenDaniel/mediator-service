import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import {
  PRINTER_QUEUE,
  PRINTER_QUEUE_BOX,
  PRINTER_QUEUE_ITEM,
  PRINTER_QUEUE_ITEM_SMALL,
  PRINTER_QUEUE_SHELF,
  PRINTER_QUEUE_MARKETING,
} from '../config';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const QUEUE_DEFS = [
  { label: 'Standard', queue: PRINTER_QUEUE },
  { label: 'Box', queue: PRINTER_QUEUE_BOX },
  { label: 'Artikel', queue: PRINTER_QUEUE_ITEM },
  { label: 'Artikel klein', queue: PRINTER_QUEUE_ITEM_SMALL },
  { label: 'Regal', queue: PRINTER_QUEUE_SHELF },
  { label: 'Produktblatt', queue: PRINTER_QUEUE_MARKETING },
].filter((q) => q.queue) as Array<{ label: string; queue: string }>;

const action = defineHttpAction({
  key: 'printer-status',
  label: 'Printer status',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/printer/status' && method === 'GET',
  async handle(_req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      if (QUEUE_DEFS.length === 0) {
        sendJson(res, 200, { ok: false, queues: [], reason: 'printer_queue_not_configured' });
        return;
      }

      // Test each unique queue name once in parallel, then map results back to labels.
      const uniqueQueues = [...new Set(QUEUE_DEFS.map((q) => q.queue))];
      const resultMap = new Map<string, { ok: boolean; reason?: string }>();

      await Promise.all(
        uniqueQueues.map(async (queue) => {
          const result = await ctx.testPrinterConnection(queue);
          resultMap.set(queue, result ?? { ok: false, reason: 'no_response' });
        })
      );

      const queues = QUEUE_DEFS.map((q) => {
        const r = resultMap.get(q.queue)!;
        return { label: q.label, queue: q.queue, ok: r.ok, reason: r.reason };
      });

      const ok = queues.every((q) => q.ok);

      if (!ok) {
        const failing = queues.filter((q) => !q.ok).map((q) => `${q.label}(${q.reason})`).join(', ');
        console.warn('[printer-status] Some queues not ok', { failing });
      }

      sendJson(res, 200, { ok, queues });
    } catch (err) {
      console.error('[printer-status] Printer status check failed', err);
      sendJson(res, 500, { ok: false, queues: [], reason: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Printer status API</p></div>',
});

export default action;
