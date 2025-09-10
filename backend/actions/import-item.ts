import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import type { Action } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
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
      const nowDate = new Date();
      const dd = String(nowDate.getDate()).padStart(2, '0');
      const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
      const yy = String(nowDate.getFullYear()).slice(-2);
      let BoxID = (p.get('BoxID') || null);
      if (!BoxID) {
        const lastBox = ctx.getMaxBoxId.get() as { BoxID: string } | undefined;
        let bSeq = 0;
        if (lastBox?.BoxID) {
          const m = lastBox.BoxID.match(/^B-\d{6}-(\d+)$/);
          if (m) bSeq = parseInt(m[1], 10);
        }
        BoxID = `B-${dd}${mm}${yy}-${(bSeq + 1).toString().padStart(4, '0')}`;
      }
      let ItemUUID = (p.get('ItemUUID') || '').trim();
      if (!ItemUUID) {
        const lastItem = ctx.getMaxItemId.get() as { ItemUUID: string } | undefined;
        let iSeq = 0;
        if (lastItem?.ItemUUID) {
          const m = lastItem.ItemUUID.match(/^I-\d{6}-(\d+)$/);
          if (m) iSeq = parseInt(m[1], 10);
        }
        ItemUUID = `I-${dd}${mm}${yy}-${(iSeq + 1).toString().padStart(4, '0')}`;
      }
      const now = nowDate.toISOString();
      const images = [p.get('picture1') || '', p.get('picture2') || '', p.get('picture3') || ''];
      let firstImage = '';
      try {
        const dir = path.join(__dirname, '../../media', ItemUUID);
        fs.mkdirSync(dir, { recursive: true });
        images.forEach((img, idx) => {
          if (!img) return;
          const m = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (!m) return;
          const ext = m[1].split('/')[1];
          const buf = Buffer.from(m[2], 'base64');
          const file = `${ItemUUID}-${idx + 1}.${ext}`;
          fs.writeFileSync(path.join(dir, file), buf);
          if (!firstImage) firstImage = `/media/${ItemUUID}/${file}`;
        });
      } catch (e) {
        console.error('Failed to save images', e);
      }
      const data = {
        BoxID,
        ItemUUID,
        Location: (p.get('Location') || '').trim(),
        UpdatedAt: nowDate,
        Datum_erfasst: (p.get('Datum_erfasst') || '').trim() ? new Date((p.get('Datum_erfasst') || '').trim()) : undefined,
        Artikel_Nummer: (p.get('Artikel_Nummer') || '').trim(),
        Grafikname: firstImage,
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
        Hauptkategorien_A: ((v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined; })((p.get('Hauptkategorien_A') || '').trim()),
        Unterkategorien_A: ((v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined; })((p.get('Unterkategorien_A') || '').trim()),
        Hauptkategorien_B: ((v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined; })((p.get('Hauptkategorien_B') || '').trim()),
        Unterkategorien_B: ((v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined; })((p.get('Unterkategorien_B') || '').trim()),
        Veröffentlicht_Status: ['yes','ja','true','1'].includes((p.get('Veröffentlicht_Status') || '').trim().toLowerCase()),
        Shopartikel: parseInt((p.get('Shopartikel') || '0').trim(), 10) || 0,
        Artikeltyp: (p.get('Artikeltyp') || '').trim(),
        Einheit: (p.get('Einheit') || '').trim(),
        WmsLink: (p.get('WmsLink') || '').trim(),
      };

        const txn = ctx.db.transaction((boxId: string, itemData: any, a: string) => {
          ctx.upsertBox.run({
            BoxID: boxId,
            Location: itemData.Location,
            CreatedAt: now,
            Notes: null,
            PlacedBy: null,
            PlacedAt: null,
            UpdatedAt: now
          });
          ctx.upsertItem.run({
            ...itemData,
            UpdatedAt: itemData.UpdatedAt.toISOString(),
            Datum_erfasst: itemData.Datum_erfasst ? itemData.Datum_erfasst.toISOString() : null,
            Veröffentlicht_Status: itemData.Veröffentlicht_Status ? 'yes' : 'no'
          });
          ctx.logEvent.run({ Actor: a, EntityType: 'Item', EntityId: itemData.ItemUUID, Event: 'ManualCreateOrUpdate', Meta: JSON.stringify({ BoxID: boxId }) });
        });
        txn(BoxID, { ...data, ItemUUID }, actor);
        sendJson(res, 200, { ok: true, item: { ItemUUID, BoxID } });
    } catch (err) {
      console.error('Import item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Import item API</p></div>'
};

export default action;
