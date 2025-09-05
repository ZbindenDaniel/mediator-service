import type { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function genId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

const action: Action = {
  key: 'import-item',
  label: 'Import item',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import/item' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const p = new URLSearchParams(raw);
      const actor = (p.get('actor') || '').trim();
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      let BoxID = (p.get('BoxID') || '').trim();
      if (!BoxID) BoxID = genId('B');
      let ItemUUID = (p.get('ItemUUID') || '').trim();
      if (!ItemUUID) ItemUUID = genId('I');
      const now = new Date().toISOString();
      const data = {
        BoxID,
        ItemUUID,
        Location: (p.get('Location') || '').trim(),
        UpdatedAt: now,
        Datum_erfasst: (p.get('Datum_erfasst') || '').trim(),
        Artikel_Nummer: (p.get('Artikel_Nummer') || '').trim(),
        Grafikname: (p.get('Grafikname') || '').trim(),
        Artikelbeschreibung: (p.get('Artikelbeschreibung') || '').trim(),
        Auf_Lager: parseInt((p.get('Auf_Lager') || '1').trim(), 10) || 1,
        Verkaufspreis: parseFloat((p.get('Verkaufspreis') || '0').replace(',', '.').trim()) || 0,
        Kurzbeschreibung: (p.get('Kurzbeschreibung') || '').trim(),
        Langtext: (p.get('Langtext') || '').trim(),
        Hersteller: (p.get('Hersteller') || '').trim(),
        Länge_mm: parseInt((p.get('Länge_mm') || '').trim(), 10) || null,
        Breite_mm: parseInt((p.get('Breite_mm') || '').trim(), 10) || null,
        Höhe_mm: parseInt((p.get('Höhe_mm') || '').trim(), 10) || null,
        Gewicht_kg: parseFloat((p.get('Gewicht_kg') || '').replace(',', '.').trim()) || null,
        Hauptkategorien_A: (p.get('Hauptkategorien_A') || '').trim(),
        Unterkategorien_A: (p.get('Unterkategorien_A') || '').trim(),
        Hauptkategorien_B: (p.get('Hauptkategorien_B') || '').trim(),
        Unterkategorien_B: (p.get('Unterkategorien_B') || '').trim(),
        Veröffentlicht_Status: (p.get('Veröffentlicht_Status') || '').trim(),
        Shopartikel: parseInt((p.get('Shopartikel') || '0').trim(), 10) || 0,
        Artikeltyp: (p.get('Artikeltyp') || '').trim(),
        Einheit: (p.get('Einheit') || '').trim(),
        WmsLink: (p.get('WmsLink') || '').trim(),
      };

      ctx.upsertBox.run({
        BoxID,
        Location: data.Location,
        CreatedAt: now,
        Notes: null,
        PlacedBy: null,
        PlacedAt: null,
        UpdatedAt: now
      });
      ctx.upsertItem.run(data);
      ctx.logEvent.run({ Actor: actor, EntityType: 'Item', EntityId: ItemUUID, Event: 'ManualCreateOrUpdate', Meta: JSON.stringify({ BoxID }) });
      sendJson(res, 200, { ok: true, item: { ItemUUID, BoxID } });
    } catch (err) {
      console.error('Import item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Import item API</p></div>'
};

export default action;
