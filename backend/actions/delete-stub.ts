import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { withTransaction } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
  key: 'delete-stub',
  label: 'Delete stub',
  appliesTo: () => false,
  matches: (p, m) => /^\/api\/stubs\/[^/]+\/delete$/.test(p) && m === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/stubs\/([^/]+)\/delete$/);
      const id = match ? decodeURIComponent(match[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid path' });

      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const actor = (data.actor || '').trim();
      const confirm = !!data.confirm;
      if (!actor || !confirm) return sendJson(res, 400, { error: 'actor and confirm=true required' });

      const stub = await ctx.getStub(id);
      if (!stub) return sendJson(res, 404, { error: 'stub not found' });

      await withTransaction(async (_client: any) => {
        await ctx.deleteStub(id);
        await ctx.logEvent({
          Actor: actor,
          EntityType: 'BoxStub',
          EntityId: id,
          Event: 'Deleted',
          Meta: null
        });
      });

      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Delete stub failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Delete stub API</p></div>'
});

export default action;
