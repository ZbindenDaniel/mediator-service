import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import type { BulkMoveResult } from '../persistence';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function isConfirmed(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

const action = defineHttpAction({
  key: 'bulk-move-items',
  label: 'Bulk move items',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/items/bulk/move' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try {
        data = JSON.parse(raw || '{}');
      } catch (parseErr) {
        console.warn('[bulk-move-items] Failed to parse request body', parseErr);
      }

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const toBoxId = typeof data.toBoxId === 'string' ? data.toBoxId.trim() : '';
      const confirm = isConfirmed(data.confirm);
      const itemIdsInput: unknown[] = Array.isArray(data.itemIds) ? data.itemIds : [];
      const itemIds = Array.from(
        new Set(
          itemIdsInput
            .map((value) => (typeof value === 'string' ? value.trim() : String(value ?? '').trim()))
            .filter((value) => value.length > 0)
        )
      );

      if (!itemIds.length) return sendJson(res, 400, { error: 'itemIds is required' });
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      if (!toBoxId) return sendJson(res, 400, { error: 'toBoxId is required' });
      if (!confirm) return sendJson(res, 400, { error: 'confirm=true required' });

      const destination = ctx.getBox.get(toBoxId);
      if (!destination) return sendJson(res, 404, { error: 'Behälter nicht gefunden!' });
      const locationRaw = destination?.Location;
      const normalizedLocation = typeof locationRaw === 'string' ? locationRaw.trim() : null;
      if (!normalizedLocation) {
        console.warn('[bulk-move-items] Destination box missing Location', { boxId: toBoxId });
      }

      const missing: string[] = [];
      const validItemIds: string[] = [];
      for (const id of itemIds) {
        const item = ctx.getItem.get(id);
        if (!item) {
          missing.push(id);
        } else {
          validItemIds.push(id);
        }
      }

      if (!validItemIds.length) {
        return sendJson(res, 404, { error: 'no items found', itemIds: missing.length ? missing : itemIds });
      }
      if (missing.length) {
        return sendJson(res, 404, { error: 'items not found', itemIds: missing });
      }

      let results: BulkMoveResult[] = [];
      try {
        results = ctx.bulkMoveItems(validItemIds, toBoxId, actor, normalizedLocation ?? null);
      } catch (dbErr) {
        console.error('[bulk-move-items] Database transaction failed', dbErr);
        return sendJson(res, 500, { error: (dbErr as Error).message });
      }

      console.log('[bulk-move-items] Moved items', { count: results.length, toBoxId });
      return sendJson(res, 200, {
        ok: true,
        moved: results.length,
        boxId: toBoxId,
        location: normalizedLocation ?? null,
        itemIds: results.map((entry) => entry.itemId)
      });
    } catch (err) {
      console.error('Bulk move items failed', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Bulk move items API</p></div>'
});

export default action;

