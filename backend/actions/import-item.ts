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
      let BoxID = (p.get('BoxID') || '').trim();
      let ItemUUID = (p.get('ItemUUID') || '').trim();
      const now = nowDate.toISOString();
      const requestedLocation = (p.get('Location') || '').trim();
      const datumErfasstRaw = (p.get('Datum_erfasst') || '').trim();
      const data = {
        Location: requestedLocation,
        UpdatedAt: nowDate,
        Datum_erfasst: datumErfasstRaw ? new Date(datumErfasstRaw) : undefined,
        Artikel_Nummer: (p.get('Artikel_Nummer') || '').trim(),
        Grafikname: '',
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

      const agenticSearchQuery = (p.get('agenticSearch') || data.Artikelbeschreibung || '').trim();
      const requestedStatus = (p.get('agenticStatus') || 'queued').trim().toLowerCase();
      const agenticStatus = ['queued', 'running'].includes(requestedStatus) ? requestedStatus : 'queued';

      const imageInputs = [p.get('picture1') || '', p.get('picture2') || '', p.get('picture3') || ''];
      const decodedImages = imageInputs
        .map((raw, idx) => {
          const value = raw.trim();
          if (!value) {
            return null;
          }
          const m = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (!m) {
            console.warn('[import-item] Ignoring invalid image payload', { index: idx });
            return null;
          }
          try {
            const buf = Buffer.from(m[2], 'base64');
            const ext = m[1].split('/')[1];
            return { idx, buffer: buf, extension: ext };
          } catch (decodeErr) {
            console.error('[import-item] Failed to decode base64 image payload', decodeErr);
            return null;
          }
        })
        .filter((entry): entry is { idx: number; buffer: Buffer; extension: string } => Boolean(entry));

      const result = ctx.db.transaction(() => {
        let generatedBoxId = BoxID;
        if (!generatedBoxId) {
          const lastBox = ctx.getMaxBoxId.get() as { BoxID?: string } | undefined;
          let bSeq = 0;
          if (lastBox?.BoxID) {
            const trimmed = lastBox.BoxID.trim();
            const m = trimmed.match(/^B-\d{6}-(\d+)$/);
            if (m) {
              bSeq = parseInt(m[1], 10);
            } else {
              console.warn('[import-item] Encountered unexpected BoxID format while generating next BoxID', { lastBoxId: trimmed });
            }
          }
          generatedBoxId = `B-${dd}${mm}${yy}-${(bSeq + 1).toString().padStart(4, '0')}`;
          console.info('[import-item] Generated new BoxID', { BoxID: generatedBoxId });
        }

        let generatedItemUUID = ItemUUID;
        if (!generatedItemUUID) {
          const lastItem = ctx.getMaxItemId.get() as { ItemUUID?: string } | undefined;
          let iSeq = 0;
          if (lastItem?.ItemUUID) {
            const trimmed = lastItem.ItemUUID.trim();
            const m = trimmed.match(/^I-\d{6}-(\d+)$/);
            if (m) {
              iSeq = parseInt(m[1], 10);
            } else {
              console.warn('[import-item] Encountered unexpected ItemUUID format while generating next ItemUUID', { lastItemUUID: trimmed });
            }
          }
          generatedItemUUID = `I-${dd}${mm}${yy}-${(iSeq + 1).toString().padStart(4, '0')}`;
          console.info('[import-item] Generated new ItemUUID', { ItemUUID: generatedItemUUID });
        }

        let boxLocationToPersist: string | null = requestedLocation || null;
        if (!requestedLocation) {
          console.warn(
            '[import-item] Empty Location provided for box import; attempting to preserve existing Standort',
            { BoxID: generatedBoxId, actor }
          );
          try {
            const existingBox = ctx.getBox?.get
              ? (ctx.getBox.get(generatedBoxId) as { Location?: string } | undefined)
              : undefined;
            if (existingBox?.Location) {
              boxLocationToPersist = existingBox.Location;
              console.info('[import-item] Preserved existing box Location', {
                BoxID: generatedBoxId,
                Location: existingBox.Location
              });
            } else {
              boxLocationToPersist = null;
              console.info('[import-item] No existing Location found to preserve for box', { BoxID: generatedBoxId });
            }
          } catch (lookupErr) {
            console.error('[import-item] Failed to load box while preserving Location', lookupErr);
          }
        }

        let firstImage = '';
        if (decodedImages.length) {
          try {
            const dir = path.join(__dirname, '../../media', generatedItemUUID);
            fs.mkdirSync(dir, { recursive: true });
            const artNr = data.Artikel_Nummer || generatedItemUUID;
            decodedImages.forEach(({ idx, buffer, extension }) => {
              const file = `${artNr}-${idx + 1}.${extension}`;
              fs.writeFileSync(path.join(dir, file), buffer);
              if (!firstImage) {
                firstImage = `/media/${generatedItemUUID}/${file}`;
              }
            });
          } catch (imageErr) {
            console.error('[import-item] Failed to save images for item import', imageErr);
          }
        }

        const itemRecord = {
          ...data,
          BoxID: generatedBoxId,
          ItemUUID: generatedItemUUID,
          Grafikname: firstImage
        };

        ctx.upsertBox.run({
          BoxID: generatedBoxId,
          Location: boxLocationToPersist,
          CreatedAt: now,
          Notes: null,
          PlacedBy: null,
          PlacedAt: null,
          UpdatedAt: now
        });
        ctx.upsertItem.run({
          ...itemRecord,
          UpdatedAt: itemRecord.UpdatedAt.toISOString(),
          Datum_erfasst: itemRecord.Datum_erfasst ? itemRecord.Datum_erfasst.toISOString() : null,
          Veröffentlicht_Status: itemRecord.Veröffentlicht_Status ? 'yes' : 'no'
        });
        ctx.upsertAgenticRun.run({
          ItemUUID: itemRecord.ItemUUID,
          SearchQuery: agenticSearchQuery || null,
          Status: agenticStatus,
          LastModified: now,
          ReviewState: 'not_required',
          ReviewedBy: null
        });
        ctx.logEvent.run({
          Actor: actor,
          EntityType: 'Item',
          EntityId: itemRecord.ItemUUID,
          Event: 'ManualCreateOrUpdate',
          Meta: JSON.stringify({ BoxID: generatedBoxId })
        });
        ctx.logEvent.run({
          Actor: actor,
          EntityType: 'Item',
          EntityId: itemRecord.ItemUUID,
          Event: 'AgenticSearchQueued',
          Meta: JSON.stringify({ SearchQuery: agenticSearchQuery, Status: agenticStatus })
        });

        return { boxId: generatedBoxId, itemUUID: generatedItemUUID };
      })();

      BoxID = result.boxId;
      ItemUUID = result.itemUUID;
      sendJson(res, 200, { ok: true, item: { ItemUUID, BoxID } });
    } catch (err) {
      console.error('Import item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Import item API</p></div>'
};

export default action;
