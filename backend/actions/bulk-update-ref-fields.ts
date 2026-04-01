import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

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
  key: 'bulk-update-ref-fields',
  label: 'Bulk update article reference fields (shop status)',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/items/bulk/update-ref' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try {
        data = JSON.parse(raw || '{}');
      } catch (parseErr) {
        console.warn('[bulk-update-ref-fields] Failed to parse request body', parseErr);
      }

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const confirm = isConfirmed(data.confirm);
      const itemIdsInput: unknown[] = Array.isArray(data.itemIds) ? data.itemIds : [];
      const itemIds = Array.from(
        new Set(
          itemIdsInput
            .map((v) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
            .filter((v) => v.length > 0)
        )
      );

      if (!itemIds.length) return sendJson(res, 400, { error: 'itemIds is required' });
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      if (!confirm) return sendJson(res, 400, { error: 'confirm=true required' });

      // Normalise field values — null means "do not change"
      const shopartikel: number | null = data.shopartikel === null || data.shopartikel === undefined
        ? null
        : (Number.isFinite(Number(data.shopartikel)) ? (Number(data.shopartikel) ? 1 : 0) : null);

      const veröffentlicht: string | null = (() => {
        const v = data.veröffentlicht;
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v ? 'yes' : 'no';
        if (typeof v === 'number') return v ? 'yes' : 'no';
        if (typeof v === 'string') {
          const t = v.trim().toLowerCase();
          if (!t) return null;
          if (['yes', 'ja', 'true', '1', 'published'].includes(t)) return 'yes';
          if (['no', 'nein', 'false', '0', 'unpublished'].includes(t)) return 'no';
          return t;
        }
        return null;
      })();

      const verkaufspreis: number | null = data.verkaufspreis === null || data.verkaufspreis === undefined
        ? null
        : (() => {
            const n = typeof data.verkaufspreis === 'number' ? data.verkaufspreis : parseFloat(String(data.verkaufspreis));
            return Number.isFinite(n) ? n : null;
          })();

      // Resolve Artikel_Nummer for each ItemUUID and group them
      const missing: string[] = [];
      const groupMap = new Map<string, string[]>();

      for (const itemId of itemIds) {
        const item = ctx.getItem.get(itemId);
        if (!item) {
          missing.push(itemId);
          continue;
        }
        const artikelNummer: string | null = typeof item.Artikel_Nummer === 'string' ? item.Artikel_Nummer.trim() || null : null;
        if (!artikelNummer) {
          console.warn('[bulk-update-ref-fields] Item has no Artikel_Nummer, skipping', { itemId });
          missing.push(itemId);
          continue;
        }
        if (!groupMap.has(artikelNummer)) {
          groupMap.set(artikelNummer, []);
        }
        groupMap.get(artikelNummer)!.push(itemId);
      }

      if (groupMap.size === 0) {
        return sendJson(res, 404, { error: 'no items with valid Artikel_Nummer found', itemIds: missing });
      }
      if (missing.length) {
        return sendJson(res, 404, { error: 'items not found or missing Artikel_Nummer', itemIds: missing });
      }

      const groups = Array.from(groupMap.entries()).map(([artikelNummer, ids]) => ({ artikelNummer, itemIds: ids }));

      let updatedArtikelNummern: string[] = [];
      try {
        updatedArtikelNummern = ctx.bulkUpdateItemRefShopFields(groups, shopartikel, veröffentlicht, verkaufspreis, actor);
      } catch (dbErr) {
        console.error('[bulk-update-ref-fields] Database transaction failed', dbErr);
        return sendJson(res, 500, { error: (dbErr as Error).message });
      }

      console.log('[bulk-update-ref-fields] Updated shop fields', {
        updated: updatedArtikelNummern.length,
        shopartikel,
        veröffentlicht,
        verkaufspreis,
        actor
      });

      return sendJson(res, 200, {
        ok: true,
        updated: updatedArtikelNummern.length,
        artikelNummern: updatedArtikelNummern
      });
    } catch (err) {
      console.error('[bulk-update-ref-fields] Request failed', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Bulk update article reference fields API</p></div>'
});

export default action;
