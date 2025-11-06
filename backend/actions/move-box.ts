import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { resolveStandortLabel } from '../standort-label';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const action = defineHttpAction({
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
      const rawLocationValue = typeof data.location === 'string' ? data.location : '';
      const locationRaw = rawLocationValue.trim().toUpperCase();
      const hasLocation = locationRaw.length > 0;
      const notes = (data.notes ?? '').toString().trim();
      const hasNotesField = Object.prototype.hasOwnProperty.call(data, 'notes');

      if (!hasLocation && hasNotesField) {
        const noteTxn = ctx.db.transaction((boxId: string, note: string, a: string) => {
          ctx.db.prepare(`UPDATE boxes SET Notes=?, UpdatedAt=datetime('now') WHERE BoxID=?`).run(note, boxId);
        ctx.logEvent({
          Actor: a,
          EntityType: 'Box',
          EntityId: boxId,
          Event: 'Note',
          Meta: JSON.stringify({ notes: note })
        });
        });
        try {
          noteTxn(id, notes, actor);
          console.info('[move-box] Processed note-only update', { boxId: id, actor });
        } catch (noteErr) {
          console.error('Note-only update failed', noteErr);
          throw noteErr;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (!hasLocation) {
        return sendJson(res, 400, { error: 'location is required' });
      }

      const standortLabel = resolveStandortLabel(locationRaw);
      if (locationRaw && !standortLabel) {
        console.warn('[move-box] Missing Standort label mapping for location', { location: locationRaw });
      }
      const txn = ctx.db.transaction((boxId: string, loc: string, note: string, a: string, label: string | null) => {
        ctx.db.prepare(`UPDATE boxes SET Location=?, StandortLabel=?, Notes=?, PlacedBy=?, PlacedAt=datetime('now'), UpdatedAt=datetime('now') WHERE BoxID=?`).run(loc, label, note, a, boxId);
        ctx.logEvent({
          Actor: a,
          EntityType: 'Box',
          EntityId: boxId,
          Event: 'Moved',
          Meta: JSON.stringify({ location: loc, notes: note, standortLabel: label })
        });
      });
      txn(id, locationRaw, notes, actor, standortLabel);
      console.info('[move-box] Processed move update', { boxId: id, actor, location: locationRaw });
      sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Move box failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Move box API</p></div>'
});

export default action;

