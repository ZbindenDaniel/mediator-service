import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { execute, queryOne, withTransaction } from '../db-client';
import { generateShopwareCorrelationId } from '../db';
import { recordPartLeftParent } from '../lib/parent-slot';
import { resolveEffectiveSubCategory } from '../lib/quality-score';
import { graduateComponentInTx, needsGraduation, WriteOnceIdentityError } from '../lib/graduate-component';
import { resolveActor } from '../utils/actor';
import { guardWrite } from '../utils/write-guard';
import { resolveTenant } from '../utils/tenant';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Resolve the Artikelnummer to graduate into: an existing ref, or a freshly created one.
// `slotSubCategory` is the subcategory the component was assessed with (its slot's target): a ref of
// another subcategory would silently switch its contracts and orphan its answers, so that needs an
// explicit `confirmSubCategoryChange` (R5); a new ref defaults to the slot's subcategory.
async function resolveGraduationRef(
  ctx: any,
  data: any,
  slotSubCategory: number | null
): Promise<{ artikelNummer: string } | { error: string; status?: number; slotSubCategory?: number; refSubCategory?: number }> {
  const confirmed = data.confirmSubCategoryChange === true;
  const artikelNummer = typeof data.artikelNummer === 'string' ? data.artikelNummer.trim() : '';
  if (artikelNummer) {
    const ref = await queryOne<{ Artikel_Nummer: string; Unterkategorien_A: unknown }>(
      'SELECT "Artikel_Nummer", "Unterkategorien_A" FROM item_refs WHERE "Artikel_Nummer" = $1 LIMIT 1',
      [artikelNummer]
    );
    if (!ref) return { error: 'artikelNummer not found' };
    const refSub = ref.Unterkategorien_A === null || ref.Unterkategorien_A === undefined || ref.Unterkategorien_A === ''
      ? null
      : Math.round(Number(ref.Unterkategorien_A));
    if (!confirmed && slotSubCategory !== null && refSub !== null && Number.isFinite(refSub) && refSub !== slotSubCategory) {
      return {
        error: `Artikel ist Kategorie ${refSub}, der Steckplatz erwartet ${slotSubCategory} — mit confirmSubCategoryChange bestätigen`,
        status: 409,
        slotSubCategory,
        refSubCategory: refSub
      };
    }
    return { artikelNummer };
  }

  const newRef = data.newRef && typeof data.newRef === 'object' ? data.newRef : null;
  if (!newRef) return { error: 'artikelNummer or newRef required to set component identity' };

  const artikelbeschreibung = typeof newRef.Artikelbeschreibung === 'string' ? newRef.Artikelbeschreibung.trim() : '';
  const hersteller = typeof newRef.Hersteller === 'string' ? newRef.Hersteller.trim() : '';
  const subCategory = typeof newRef.Unterkategorien_A === 'number' ? newRef.Unterkategorien_A : slotSubCategory;
  if (!artikelbeschreibung) return { error: 'newRef.Artikelbeschreibung is required' };
  if (!confirmed && slotSubCategory !== null && subCategory !== null && subCategory !== slotSubCategory) {
    return {
      error: `Neuer Artikel mit Kategorie ${subCategory}, der Steckplatz erwartet ${slotSubCategory} — mit confirmSubCategoryChange bestätigen`,
      status: 409,
      slotSubCategory,
      refSubCategory: subCategory
    };
  }

  const maxStr: string | null = await ctx.getMaxArtikelNummer();
  const next = String((maxStr ? parseInt(maxStr, 10) : 0) + 1).padStart(6, '0');
  await execute(
    `INSERT INTO item_refs ("Artikel_Nummer","Artikelbeschreibung","Hersteller","Unterkategorien_A","ContributedByTenant")
     VALUES ($1,$2,$3,$4,$5)`,
    [next, artikelbeschreibung, hersteller || null, subCategory, resolveTenant(ctx)]
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
      if (!(await guardWrite(ctx, res, 'item', uuid))) return;

      const item = await ctx.getItem(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const actor = resolveActor(ctx, typeof data.actor === 'string' ? data.actor : '');
      const toBoxId = typeof data.toBoxId === 'string' ? data.toBoxId.trim() : '';
      // Contract signal: whether extracting this part turns the parent into a spare-part donor.
      // Decoupled from extraction — a drive pulled from a device sold whole must NOT mark it.
      // Silent caller → the contract decides (unweighted slot = historical "grade 1", weighted = score).
      const markParentAsSpare: boolean | undefined = typeof data.markParentAsSpare === 'boolean' ? data.markParentAsSpare : undefined;

      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      if (!toBoxId) return sendJson(res, 400, { error: 'toBoxId is required' });
      if (!(await guardWrite(ctx, res, 'box', toBoxId))) return;

      // Verify the item has a Zerlegt_aus relation to get the parent device UUID
      const relation = await queryOne<{ ParentItemUUID: string; SlotKey: string | null }>(
        `SELECT "ParentItemUUID", "SlotKey" FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
        [uuid]
      );
      if (!relation) {
        return sendJson(res, 400, { error: 'Artikel ist kein katalogisiertes Ersatzteil (kein Zerlegt_aus-Link)' });
      }
      const parentUuid = relation.ParentItemUUID;
      const slotKey = relation.SlotKey ?? null;

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
        const resolved = await resolveGraduationRef(ctx, data, await resolveEffectiveSubCategory(uuid));
        if ('error' in resolved) {
          const { status, ...body } = resolved;
          return sendJson(res, status ?? 400, body);
        }
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

      // 2. Record the slot as missing on the parent; mark it as spare donor per contract (lib/parent-slot).
      let qualityAssessmentId: number | null = null;
      let markedSpare = false;
      try {
        const result = await recordPartLeftParent(parentUuid, slotKey, actor, {
          ...(markParentAsSpare === undefined ? {} : { markParentAsSpare }),
          actor,
          logEvent: ctx.logEvent
        });
        qualityAssessmentId = result.assessmentId;
        markedSpare = result.markedSpare;
      } catch (qaErr) {
        console.error('[remove-from-device] Failed to update parent device quality', { parentUuid, error: qaErr });
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
        Meta: JSON.stringify({ childItemUUID: effectiveUuid, toBoxId, qualityAssessmentId, markedParentAsSpare: markedSpare })
      });

      // Enqueue Shopware sync for parent device quality change — only if we changed it.
      if (markedSpare) {
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
