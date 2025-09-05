import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';

const LOC_RE = /^[A-Z]-\d{2}-\d{2}$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action: Action = {
  key: 'move-box',
  label: 'Move box',
  appliesTo: () => false,
  matches: (path, method) => /^\/api\/boxes\/[^/]+\/move$/.test(path) && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/boxes\/([^/]+)\/move$/);
      const id = match ? decodeURIComponent(match[1]) : '';
      if (!id) return sendJson(res, 400, { error: 'invalid box id' });
      const box = ctx.getBox.get(id);
      if (!box) return sendJson(res, 404, { error: 'box not found' });
      let raw = '';
      for await (const c of req) raw += c;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = (data.actor || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      const locationRaw = (data.location ?? box.Location ?? '').toString().trim().toUpperCase();
      const notes = (data.notes || '').trim();
      if (!locationRaw) return sendJson(res, 400, { error: 'location is required' });
      if (!LOC_RE.test(locationRaw)) return sendJson(res, 400, { error: 'invalid location format' });
      ctx.db.prepare(`UPDATE boxes SET Location=?, Notes=?, PlacedBy=?, PlacedAt=datetime('now'), UpdatedAt=datetime('now') WHERE BoxID=?`).run(locationRaw, notes, actor, id);
      ctx.logEvent.run({ Actor: actor, EntityType: 'Box', EntityId: id, Event: 'Moved', Meta: JSON.stringify({ location: locationRaw, notes }) });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Move box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Move box API</p></div>'
};

export default action;

