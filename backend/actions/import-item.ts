import type { IncomingMessage, ServerResponse } from 'http';
import type { Action } from './index';
import { DEFAULT_ITEM_UNIT } from '../../models';
import { prepareNewItemCreationBranch } from '../ops/import-item/branching';
import { persistItemImages } from '../ops/import-item/imagePersistence';
import { prepareAgenticTrigger } from '../ops/import-item/agentic';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
}

const action: Action = {
  key: 'import-item',
  label: 'Import item',
  appliesTo: () => false,
  matches: (path, method) => path === '/api/import/item' && method === 'POST',
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const logger = ctx.logger ?? console;
    try {
      const raw = await readRequestBody(req);
      const params = new URLSearchParams(raw);

      const actor = (params.get('actor') || '').trim();
      if (!actor) {
        logger.warn('Manual import missing actor');
        return sendJson(res, 400, { error: 'actor is required' });
      }

      const nowDate = new Date();
      const branch = prepareNewItemCreationBranch(
        {
          now: nowDate,
          requestedBoxId: params.get('BoxID'),
          requestedItemId: params.get('ItemUUID')
        },
        {
          getMaxBoxId: ctx.getMaxBoxId,
          getMaxItemId: ctx.getMaxItemId,
          logger
        }
      );

      const images = [
        params.get('picture1') || '',
        params.get('picture2') || '',
        params.get('picture3') || ''
      ];
      const firstImage = persistItemImages({
        itemUUID: branch.reference.ItemUUID,
        mediaDir: ctx.MEDIA_DIR,
        images,
        artikelNummer: params.get('Artikel_Nummer') || undefined,
        logger
      });

      const unitRaw = (params.get('Einheit') || '').trim();
      const resolvedUnit = unitRaw || DEFAULT_ITEM_UNIT;
      if (!unitRaw) {
        logger.warn('Missing Einheit on manual import, defaulting to fallback', {
          itemUUID: branch.reference.ItemUUID,
          artikelNummer: (params.get('Artikel_Nummer') || '').trim() || branch.reference.ItemUUID,
          fallback: DEFAULT_ITEM_UNIT
        });
      }

      const datumErfasstRaw = (params.get('Datum_erfasst') || '').trim();
      const datumErfasst = datumErfasstRaw ? new Date(datumErfasstRaw) : undefined;

      const data = {
        BoxID: branch.reference.BoxID,
        ItemUUID: branch.reference.ItemUUID,
        Location: (params.get('Location') || '').trim(),
        UpdatedAt: nowDate,
        Datum_erfasst: datumErfasst,
        Artikel_Nummer: (params.get('Artikel_Nummer') || '').trim(),
        Grafikname: firstImage,
        Artikelbeschreibung: (params.get('Artikelbeschreibung') || '').trim(),
        Auf_Lager: parseInt((params.get('Auf_Lager') || '1').trim(), 10) || 1,
        Verkaufspreis: parseFloat((params.get('Verkaufspreis') || '0').replace(',', '.').trim()) || 0,
        Kurzbeschreibung: (params.get('Kurzbeschreibung') || '').trim(),
        Langtext: (params.get('Langtext') || '').trim(),
        Hersteller: (params.get('Hersteller') || '').trim(),
        Länge_mm: parseInt((params.get('Länge_mm') || '').trim(), 10) || null,
        Breite_mm: parseInt((params.get('Breite_mm') || '').trim(), 10) || null,
        Höhe_mm: parseInt((params.get('Höhe_mm') || '').trim(), 10) || null,
        Gewicht_kg: parseFloat((params.get('Gewicht_kg') || '').replace(',', '.').trim()) || null,
        Hauptkategorien_A: ((v: string) => {
          const n = parseInt(v, 10);
          return Number.isFinite(n) ? n : undefined;
        })((params.get('Hauptkategorien_A') || '').trim()),
        Unterkategorien_A: ((v: string) => {
          const n = parseInt(v, 10);
          return Number.isFinite(n) ? n : undefined;
        })((params.get('Unterkategorien_A') || '').trim()),
        Hauptkategorien_B: ((v: string) => {
          const n = parseInt(v, 10);
          return Number.isFinite(n) ? n : undefined;
        })((params.get('Hauptkategorien_B') || '').trim()),
        Unterkategorien_B: ((v: string) => {
          const n = parseInt(v, 10);
          return Number.isFinite(n) ? n : undefined;
        })((params.get('Unterkategorien_B') || '').trim()),
        Veröffentlicht_Status: ['yes', 'ja', 'true', '1'].includes((params.get('Veröffentlicht_Status') || '').trim().toLowerCase()),
        Shopartikel: parseInt((params.get('Shopartikel') || '0').trim(), 10) || 0,
        Artikeltyp: (params.get('Artikeltyp') || '').trim(),
        Einheit: resolvedUnit,
        WmsLink: (params.get('WmsLink') || '').trim()
      };

      const agenticPreparation = prepareAgenticTrigger(
        {
          requestedStatus: params.get('agenticStatus'),
          agenticSearch: params.get('agenticSearch'),
          fallbackDescription: data.Artikelbeschreibung
        },
        logger
      );

      const txn = ctx.db.transaction(
        (
          reference: { BoxID: string; ItemUUID: string },
          itemData: typeof data,
          actorName: string,
          agentic: { status: string; searchQuery: string },
          isoNow: string
        ) => {
          ctx.upsertBox.run({
            BoxID: reference.BoxID,
            Location: itemData.Location,
            CreatedAt: isoNow,
            Notes: null,
            PlacedBy: null,
            PlacedAt: null,
            UpdatedAt: isoNow
          });
          ctx.upsertItem.run({
            ...itemData,
            UpdatedAt: itemData.UpdatedAt.toISOString(),
            Datum_erfasst: itemData.Datum_erfasst ? itemData.Datum_erfasst.toISOString() : null,
            Veröffentlicht_Status: itemData.Veröffentlicht_Status ? 'yes' : 'no'
          });
          ctx.upsertAgenticRun.run({
            ItemUUID: reference.ItemUUID,
            SearchQuery: agentic.searchQuery || null,
            Status: agentic.status,
            LastModified: isoNow,
            ReviewState: 'not_required',
            ReviewedBy: null
          });
          ctx.logEvent.run({
            Actor: actorName,
            EntityType: 'Item',
            EntityId: reference.ItemUUID,
            Event: 'ManualCreateOrUpdate',
            Meta: JSON.stringify({ BoxID: reference.BoxID })
          });
          ctx.logEvent.run({
            Actor: actorName,
            EntityType: 'Item',
            EntityId: reference.ItemUUID,
            Event: 'AgenticSearchQueued',
            Meta: JSON.stringify({ SearchQuery: agentic.searchQuery, Status: agentic.status })
          });
        }
      );

      txn(branch.reference, data, actor, agenticPreparation, branch.isoNow);

      return sendJson(res, 200, { ok: true, item: branch.reference });
    } catch (err) {
      logger.error('Import item failed', {
        error: err instanceof Error ? err.message : String(err)
      });
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Import item API</p></div>'
};

export default action;
