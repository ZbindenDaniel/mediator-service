import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

// TODO(agent): Consider pagination or response limiting for filtered list box queries.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'list-boxes',
  label: 'List boxes',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/boxes' && method === 'GET',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const url = new URL(req.url ?? '/api/boxes', 'http://localhost');
      const rawType = url.searchParams.get('type') ?? '';
      const normalizedType = rawType.trim().toUpperCase();

      if (normalizedType && !/^[A-Z0-9]$/.test(normalizedType)) {
        console.warn('Invalid box type filter for list-boxes', { rawType });
        return sendJson(res, 400, { error: 'invalid box type filter' });
      }

      const queryHelper = ctx.listBoxes;
      if (!queryHelper || typeof queryHelper.all !== 'function') {
        console.error('list-boxes helper is missing or invalid');
        return sendJson(res, 500, { error: 'list boxes unavailable' });
      }

      if (normalizedType && typeof queryHelper.byType !== 'function') {
        console.error('list-boxes type filter requested but unsupported');
        return sendJson(res, 500, { error: 'filtered list boxes unavailable' });
      }

      const boxes = normalizedType ? queryHelper.byType(normalizedType) : queryHelper.all();
      console.log('list-boxes', { count: boxes.length, filtered: Boolean(normalizedType), type: normalizedType || undefined });
      sendJson(res, 200, { boxes });
    } catch (err) {
      console.error('List boxes failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">List boxes API</p></div>'
});

export default action;
