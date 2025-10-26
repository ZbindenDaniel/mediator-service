import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import {
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  resolveAgenticRunStatus
} from '../../models';
import type { AgenticRunStatus } from '../../models';
import type { Action } from './index';
import { resolveStandortLabel, normalizeStandortCode } from '../standort-label';
import { forwardAgenticTrigger } from './agentic-trigger';

const DEFAULT_EINHEIT = 'Stück';

function coalesceEinheit(value: string | null): string {
  const trimmed = (value || '').trim();
  return trimmed || DEFAULT_EINHEIT;
}

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
      const providedBoxId = (p.get('BoxID') || '').trim();
      const BoxID = providedBoxId ? providedBoxId : null;
      if (!BoxID) {
        console.info('[import-item] Persisting item without box placement', { actor });
      }
      const incomingItemUUID = (p.get('ItemUUID') || '').trim();
      let ItemUUID = '';
      if (incomingItemUUID) {
        try {
          const existingItem = ctx.getItem?.get
            ? ((ctx.getItem.get(incomingItemUUID) as { ItemUUID: string } | undefined) ?? null)
            : null;
          if (existingItem) {
            ItemUUID = existingItem.ItemUUID;
            console.info('[import-item] Preserving existing ItemUUID from payload', { ItemUUID });
          } else {
            console.info('[import-item] Incoming ItemUUID not found; generating new identifier', {
              ItemUUID: incomingItemUUID
            });
          }
        } catch (lookupErr) {
          console.error('[import-item] Failed to verify incoming ItemUUID; generating new identifier instead', lookupErr);
        }
      }

      if (!ItemUUID) {
        try {
          const lastItem = ctx.getMaxItemId.get() as { ItemUUID: string } | undefined;
          let iSeq = 0;
          if (lastItem?.ItemUUID) {
            const m = lastItem.ItemUUID.match(/^I-\d{6}-(\d+)$/);
            if (m) iSeq = parseInt(m[1], 10);
          }
          ItemUUID = `I-${dd}${mm}${yy}-${(iSeq + 1).toString().padStart(4, '0')}`;
          console.info('[import-item] Generated new ItemUUID for item import', { ItemUUID });
        } catch (idGenerationErr) {
          console.error('[import-item] Failed to generate ItemUUID for item import', idGenerationErr);
          throw idGenerationErr;
        }
      }
      const now = nowDate.toISOString();
      const images = [p.get('picture1') || '', p.get('picture2') || '', p.get('picture3') || ''];
      let firstImage = '';
      try {
        const dir = path.join(__dirname, '../../media', ItemUUID);
        fs.mkdirSync(dir, { recursive: true });
        const artNr = (p.get('Artikel_Nummer') || '').trim() || ItemUUID;
        images.forEach((img, idx) => {
          if (!img) return;
          const m = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
          if (!m) return;
          const ext = m[1].split('/')[1];
          const buf = Buffer.from(m[2], 'base64');
          const file = `${artNr}-${idx + 1}.${ext}`;
          fs.writeFileSync(path.join(dir, file), buf);
          if (!firstImage) firstImage = `/media/${ItemUUID}/${file}`;
        });
      } catch (e) {
        console.error('Failed to save images', e);
      }
      const requestedLocationRaw = BoxID ? (p.get('Location') || '').trim() : '';
      if (!BoxID && requestedLocationRaw) {
        console.warn('[import-item] Ignoring Location for unplaced item import', {
          actor,
          location: requestedLocationRaw
        });
      }
      const normalizedLocation = BoxID ? normalizeStandortCode(requestedLocationRaw) : null;
      const requestedStandortLabel = BoxID && normalizedLocation ? resolveStandortLabel(normalizedLocation) : null;
      if (normalizedLocation && !requestedStandortLabel) {
        console.warn('[import-item] Missing Standort label mapping for requested location', { location: normalizedLocation });
      }
      const data = {
        BoxID,
        ItemUUID,
        Location: normalizedLocation,
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
        Einheit: coalesceEinheit(p.get('Einheit')),
      };

      const agenticSearchQuery = (p.get('agenticSearch') || data.Artikelbeschreibung || '').trim();
      const requestedStatus = (p.get('agenticStatus') || '').trim();
      const agenticStatus: AgenticRunStatus = resolveAgenticRunStatus(requestedStatus);
      const agenticRunManuallySkipped = agenticStatus === AGENTIC_RUN_STATUS_NOT_STARTED;

      let boxLocationToPersist: string | null = normalizedLocation || null;
      let boxStandortLabelToPersist: string | null = requestedStandortLabel;
      if (BoxID) {
        if (!normalizedLocation) {
          console.warn(
            '[import-item] Empty Location provided for box import; attempting to preserve existing Standort',
            { BoxID, actor }
          );
          try {
            const existingBox = ctx.getBox?.get
              ? (ctx.getBox.get(BoxID) as { Location?: string | null; StandortLabel?: string | null } | undefined)
              : undefined;
            if (existingBox?.Location) {
              boxLocationToPersist = existingBox.Location;
              boxStandortLabelToPersist = existingBox.StandortLabel ?? resolveStandortLabel(existingBox.Location);
              console.info('[import-item] Preserved existing box Location', { BoxID, Location: existingBox.Location });
            } else {
              boxLocationToPersist = null;
              boxStandortLabelToPersist = null;
              console.info('[import-item] No existing Location found to preserve for box', { BoxID });
            }
          } catch (lookupErr) {
            console.error('[import-item] Failed to load box while preserving Location', lookupErr);
          }
        }
      } else {
        boxLocationToPersist = null;
        boxStandortLabelToPersist = null;
      }

      const txn = ctx.db.transaction(
        (
          boxId: string | null,
          itemData: any,
          a: string,
          search: string,
          status: string,
          boxLocation: string | null,
          agenticEnabled: boolean,
          manuallySkipped: boolean
        ) => {
          if (boxId) {
            ctx.upsertBox.run({
              BoxID: boxId,
              Location: boxLocation,
              StandortLabel: boxStandortLabelToPersist,
              CreatedAt: now,
              Notes: null,
              PlacedBy: null,
              PlacedAt: null,
              UpdatedAt: now
            });
          } else {
            console.info('[import-item] Skipping box upsert because the item is unplaced', {
              ItemUUID: itemData.ItemUUID,
              Actor: a
            });
          }
          ctx.persistItemWithinTransaction(itemData);

          let previousAgenticRun: { Status?: string | null } | null = null;
          if (!manuallySkipped) {
            try {
              previousAgenticRun = ctx.getAgenticRun?.get
                ? ((ctx.getAgenticRun.get(itemData.ItemUUID) as { Status?: string | null } | undefined) ?? null)
                : null;
            } catch (agenticLookupErr) {
              console.error('[import-item] Failed to load existing agentic run before upsert', agenticLookupErr);
            }
          }

          const agenticRun = {
            ItemUUID: itemData.ItemUUID,
            SearchQuery: search || null,
            Status: status,
            LastModified: now,
            ReviewState: 'not_required',
            ReviewedBy: null
          };

          try {
            ctx.upsertAgenticRun.run(agenticRun);
          } catch (agenticPersistErr) {
            console.error('[import-item] Failed to upsert agentic run during import transaction', agenticPersistErr);
            throw agenticPersistErr;
          }
          const itemExists = ctx.getItem.get(itemData.ItemUUID) as { ItemUUID: string } | undefined;
          ctx.logEvent.run({ Actor: a, EntityType: 'Item', EntityId: itemData.ItemUUID, Event: itemExists == undefined ? 'Updated' : 'Created', Meta: JSON.stringify({ BoxID: boxId }) });
          if (manuallySkipped) {
            console.info('[import-item] Agentic run persisted as notStarted due to manual submission', {
              ItemUUID: itemData.ItemUUID,
              Actor: a
            });
          } else {
            const agenticEventMeta = {
              SearchQuery: search,
              Status: status,
              QueuedLocally: true,
              RemoteTriggerDispatched: Boolean(agenticEnabled)
            };
            const previousStatus = (previousAgenticRun?.Status || '').toLowerCase();
            const shouldEmitAgenticQueuedEvent =
              !previousAgenticRun || previousStatus !== AGENTIC_RUN_STATUS_QUEUED;

            if (shouldEmitAgenticQueuedEvent) {
              ctx.logEvent.run({
                Actor: a,
                EntityType: 'Item',
                EntityId: itemData.ItemUUID,
                Event: 'AgenticSearchQueued',
                Meta: JSON.stringify(agenticEventMeta)
              });
            } else {
              console.info('[import-item] Skipping AgenticSearchQueued log for already queued run', {
                ItemUUID: itemData.ItemUUID,
                Actor: a
              });
            }
            if (!agenticEnabled) {
              console.info('[import-item] Agentic service disabled; queued agentic run locally without remote trigger', {
                ItemUUID: itemData.ItemUUID,
                Actor: a,
                SearchQuery: search
              });
            }
          }
        }
      );
      txn(
        BoxID,
        { ...data, ItemUUID },
        actor,
        agenticSearchQuery,
        agenticStatus,
        boxLocationToPersist,
        Boolean(ctx.agenticServiceEnabled),
        agenticRunManuallySkipped
      );

      let agenticTriggerDispatched = false;

      if (ctx.agenticServiceEnabled && !agenticRunManuallySkipped) {
        const triggerPayload = {
          itemId: ItemUUID,
          artikelbeschreibung: agenticSearchQuery || data.Artikelbeschreibung || ''
        };

        if (!triggerPayload.artikelbeschreibung) {
          console.warn('[import-item] Agentic trigger skipped due to missing Artikelbeschreibung', {
            ItemUUID,
            actor
          });
        } else {
          try {
            agenticTriggerDispatched = true;
            void forwardAgenticTrigger(triggerPayload, {
              context: 'import-item',
              logger: console
            })
              .then((result) => {
                if (!result.ok) {
                  console.error('[import-item] Agentic trigger response indicated failure', {
                    ItemUUID,
                    status: result.status,
                    details: result.body ?? result.rawBody
                  });
                }
              })
              .catch((agenticErr) => {
                console.error('[import-item] Failed to trigger agentic run after import', agenticErr);
              });
          } catch (dispatchErr) {
            console.error('[import-item] Failed to schedule agentic trigger dispatch', dispatchErr);
          }
        }
      } else if (ctx.agenticServiceEnabled && agenticRunManuallySkipped) {
        console.info('[import-item] Agentic trigger skipped due to manual submission status', {
          ItemUUID,
          actor
        });
      } else {
        console.info('[import-item] Agentic service disabled; queued agentic run locally and skipped remote trigger dispatch', {
          ItemUUID,
          actor,
          agenticSearchQuery
        });
      }

      sendJson(res, 200, { ok: true, item: { ItemUUID, BoxID }, agenticTriggerDispatched });
    } catch (err) {
      console.error('Import item failed', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Import item API</p></div>'
};

export default action;
