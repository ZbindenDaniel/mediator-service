import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { execute, queryOne, withTransaction } from '../db-client';
import { insertQualityAssessment, updateItemQualityAssessment, generateShopwareCorrelationId } from '../db';
import { graduateComponentInTx, needsGraduation, WriteOnceIdentityError } from '../lib/graduate-component';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Resolve the Artikelnummer to graduate into: an existing ref, or a freshly created one.
async function resolveGraduationRef(
  ctx: any,
  data: any
): Promise<{ artikelNummer: string } | { error: string }> {
  const artikelNummer = typeof data.artikelNummer === 'string' ? data.artikelNummer.trim() : '';
  if (artikelNummer) {
    const ref = await queryOne<{ Artikel_Nummer: string }>(
      'SELECT "Artikel_Nummer" FROM item_refs WHERE "Artikel_Nummer" = $1 LIMIT 1',
      [artikelNummer]
    );
    if (!ref) return { error: 'artikelNummer not found' };
    return { artikelNummer };
  }

  const newRef = data.newRef && typeof data.newRef === 'object' ? data.newRef : null;
  if (!newRef) return { error: 'artikelNummer or newRef required to set component identity' };

  const artikelbeschreibung = typeof newRef.Artikelbeschreibung === 'string' ? newRef.Artikelbeschreibung.trim() : '';
  const hersteller = typeof newRef.Hersteller === 'string' ? newRef.Hersteller.trim() : '';
  const subCategory = typeof newRef.Unterkategorien_A === 'number' ? newRef.Unterkategorien_A : null;
  if (!artikelbeschreibung) return { error: 'newRef.Artikelbeschreibung is required' };

  const maxStr: string | null = await ctx.getMaxArtikelNummer();
  const next = String((maxStr ? parseInt(maxStr, 10) : 0) + 1).padStart(6, '0');
  await execute(
    `INSERT INTO item_refs ("Artikel_Nummer","Artikelbeschreibung","Hersteller","Unterkategorien_A")
     VALUES ($1,$2,$3,$4)`,
    [next, artikelbeschreibung, hersteller || null, subCategory]
  );
  return { artikelNummer: next };
}

const action = defineHttpAction({
  key: 'remove-from-device',
  label: 'Remove spare part from device',
  appliesTo: () => false,
  matches: (path, method) =>
    /^\/api\/items\/[^/]+\/remove-from-device$/.test(path) && method === 'POST',

  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    try {
      const match = req.url?.match(/^\/api\/items\/([^/]+)\/remove-from-device$/);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });

      const item = await ctx.getItem(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
      const toBoxId = typeof data.toBoxId === 'string' ? data.toBoxId.trim() : '';
      // Contract signal: whether extracting this part turns the parent into a spare-part donor.
      // Decoupled from extraction — a drive pulled from a device sold whole must NOT mark it.
      // Default true preserves the historical parting-out behavior when the caller is silent.
      const markParentAsSpare = data.markParentAsSpare !== false;

      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      if (!toBoxId) return sendJson(res, 400, { error: 'toBoxId is required' });

      // Verify the item has a Zerlegt_aus relation to get the parent device UUID
      const relation = await queryOne<{ ParentItemUUID: string }>(
        `SELECT "ParentItemUUID" FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
        [uuid]
      );
      if (!relation) {
        return sendJson(res, 400, { error: 'Artikel ist kein katalogisiertes Ersatzteil (kein Zerlegt_aus-Link)' });
      }
      const parentUuid = relation.ParentItemUUID;

      const dest = await ctx.getBox(toBoxId);
      if (!dest) {
        return sendJson(res, 404, { error: 'Behälter nicht gefunden!' });
      }

      const rawLocationId = typeof dest.LocationId === 'string' ? dest.LocationId.trim() : null;
      const rawLocation = typeof dest.Location === 'string' ? dest.Location.trim() : null;
      const normalizedLocation = rawLocationId || rawLocation || null;
      const now = new Date().toISOString();

      // Effective UUID after this call — changes if the component graduates (C- → I-).
      let effectiveUuid = uuid;

      if (needsGraduation(item)) {
        // 1a. Set identity (write-once) and extract in one atomic swap.
        const resolved = await resolveGraduationRef(ctx, data);
        if ('error' in resolved) return sendJson(res, 400, resolved);
        const artikelNummer = resolved.artikelNummer;

        // Mint the new I- UUID, guarding against collision (matches catalog-spare-part).
        let newUUID: string | null = null;
        for (let i = 0; i < 5; i++) {
          const candidate = await ctx.generateItemUUID(artikelNummer);
          if (!(await ctx.getItem(candidate))) { newUUID = candidate; break; }
        }
        if (!newUUID) return sendJson(res, 500, { error: 'Failed to generate item UUID' });

        try {
          await withTransaction(async (client) => {
            const { parentArtikelNummer } = await graduateComponentInTx(client, {
              oldUUID: uuid,
              newUUID: newUUID!,
              artikelNummer,
              boxId: toBoxId,
              location: normalizedLocation,
              now,
            });
            // Provenance: record that this ref was parted out of the parent ref.
            if (parentArtikelNummer) {
              await client.query(
                `INSERT INTO item_ref_relations ("ParentArtikel_Nummer","ChildArtikel_Nummer","RelationType","Notes","CreatedAt")
                 VALUES ($1,$2,'Ersatzteil',NULL,NOW())
                 ON CONFLICT DO NOTHING`,
                [parentArtikelNummer, artikelNummer]
              );
            }
          });
        } catch (err) {
          if (err instanceof WriteOnceIdentityError) {
            return sendJson(res, 409, { error: 'Identität ist bereits gesetzt und kann nicht geändert werden' });
          }
          throw err;
        }
        effectiveUuid = newUUID;

        await ctx.logEvent({
          Actor: actor,
          EntityType: 'Item',
          EntityId: effectiveUuid,
          Event: 'ComponentGraduated',
          Meta: JSON.stringify({ parentUuid, artikelNummer, previousUuid: uuid, toBoxId }),
        });
      } else {
        // 1b. Legacy path: component already has a reference — just relocate it.
        await execute(
          `UPDATE items SET "BoxID"=$1, "Location"=$2, "UpdatedAt"=$3 WHERE "ItemUUID"=$4`,
          [toBoxId, normalizedLocation, now, uuid]
        );
      }

      // 2. Mark the parent device as Ersatzteil — only when the contract parts it out.
      let qualityAssessmentId: number | null = null;
      if (markParentAsSpare) {
        try {
          qualityAssessmentId = await insertQualityAssessment({
            tag: 'Ersatzteil',
            value: 1,
            is_complete: false,
            has_defects: null,
            is_functional: false,
            notes: 'Ersatzteil entnommen',
            reviewed_at: now,
            reviewed_by: actor,
          });
          await updateItemQualityAssessment(parentUuid, qualityAssessmentId, 1);
        } catch (qaErr) {
          console.error('[remove-from-device] Failed to update parent device quality', { parentUuid, error: qaErr });
        }
      }

      // Log events
      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: effectiveUuid,
        Event: 'RemovedFromDevice',
        Meta: JSON.stringify({ parentUuid, toBoxId, location: normalizedLocation })
      });
      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: parentUuid,
        Event: 'SparePartRemoved',
        Meta: JSON.stringify({ childItemUUID: effectiveUuid, toBoxId, qualityAssessmentId, markedParentAsSpare: markParentAsSpare })
      });

      // Enqueue Shopware sync for parent device quality change — only if we changed it.
      if (markParentAsSpare) {
        try {
          const correlationId = generateShopwareCorrelationId('remove-from-device', parentUuid);
          await ctx.enqueueShopwareSyncJob({
            CorrelationId: correlationId,
            JobType: 'item-upsert',
            Payload: JSON.stringify({ actor, itemUUID: parentUuid, trigger: 'remove-from-device', quality: 1 })
          });
        } catch (queueErr) {
          console.error('[remove-from-device] Failed to enqueue Shopware sync job', { parentUuid, error: queueErr });
        }
      }

      console.info('[remove-from-device] Spare part relocated', { uuid: effectiveUuid, parentUuid, toBoxId, actor, graduated: effectiveUuid !== uuid });
      return sendJson(res, 200, { ok: true, itemUUID: effectiveUuid, toBoxId, locationId: normalizedLocation });
    } catch (err) {
      console.error('[remove-from-device] Unexpected error', err);
      return sendJson(res, 500, { error: (err as Error).message });
    }
  },
  view: () => '<div class="card"><p class="muted">Remove from device API</p></div>'
});

export default action;
