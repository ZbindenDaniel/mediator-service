import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'item-adjacent',
  label: 'Adjacent items',
  appliesTo: () => false,
  matches: (path, method) => method === 'GET' && /^\/api\/items\/[^/]+\/adjacent$/.test(path),
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const url = req.url || '';
    const match = url.match(/^\/api\/items\/([^/]+)\/adjacent$/);
    const itemId = match ? decodeURIComponent(match[1]) : '';

    if (!itemId) {
      return sendJson(res, 400, { error: 'Invalid item id' });
    }

    try {
      const neighbors = ctx.getAdjacentItemIds.get({ ItemUUID: itemId }) as
        | { previousId?: string | null; nextId?: string | null }
        | undefined;
      const previousId = typeof neighbors?.previousId === 'string' && neighbors.previousId.trim()
        ? neighbors.previousId.trim()
        : null;
      const nextId = typeof neighbors?.nextId === 'string' && neighbors.nextId.trim()
        ? neighbors.nextId.trim()
        : null;

      console.info('Resolved adjacent item ids', { itemId, previousId, nextId });
      return sendJson(res, 200, { previousId, nextId });
    } catch (err) {
      console.error('Failed to resolve adjacent item ids', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Adjacent item lookup API</p></div>'
});

export default action;
