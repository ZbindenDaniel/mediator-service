import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { withTransaction, query } from '../db-client';
import { resolveActor } from '../utils/actor';
import { guardWrite } from '../utils/write-guard';
import { resolveTenant } from '../utils/tenant';
import { recomputeQualityScoreSafely, resolveEffectiveSubCategory } from '../lib/quality-score';
import { getAssemblyContract } from '../contracts/registry';
import { mintPartItemUUID, PartIdError } from '../lib/part-ids';
import { buildPartsTree } from '../lib/parts-tree';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const SPARE_PARTS_ROUTE = /^\/api\/items\/([^/]+)\/spare-parts$/;
const SPARE_PARTS_NEW_REF_ROUTE = /^\/api\/items\/([^/]+)\/spare-parts\/new-ref$/;
const SPARE_PART_LINK_DELETE_ROUTE = /^\/api\/items\/([^/]+)\/spare-part-link$/;
const SPARE_PARTS_COMPONENT_ROUTE = /^\/api\/items\/([^/]+)\/spare-parts\/component$/;
const PARTS_TREE_ROUTE = /^\/api\/items\/([^/]+)\/parts-tree$/;

const action = defineHttpAction({
  key: 'catalog-spare-part',
  label: 'Catalog spare part',
  appliesTo: () => false,
  matches: (path, method) =>
    (SPARE_PARTS_ROUTE.test(path) && (method === 'GET' || method === 'POST')) ||
    (SPARE_PARTS_NEW_REF_ROUTE.test(path) && method === 'POST') ||
    (SPARE_PARTS_COMPONENT_ROUTE.test(path) && method === 'POST') ||
    (PARTS_TREE_ROUTE.test(path) && method === 'GET') ||
    (SPARE_PART_LINK_DELETE_ROUTE.test(path) && method === 'DELETE'),

  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const method = req.method || 'GET';
    const urlPath = (req.url || '').split('?')[0];

    // ── POST /api/items/:parentUuid/spare-parts/component ─────────────────────
    // Catalogue a part into a slot WITHOUT a reference yet (in-device component, C- part ID), so it
    // can be assessed during the parent's quality review; identity is set later, at Zerlegung.
    // Intake already creates such components from scans — this is the manual counterpart.
    if (method === 'POST' && SPARE_PARTS_COMPONENT_ROUTE.test(urlPath)) {
      const match = urlPath.match(SPARE_PARTS_COMPONENT_ROUTE);
      const parentUuid = match ? decodeURIComponent(match[1]) : '';
      if (!parentUuid) return sendJson(res, 400, { error: 'invalid item id' });
      if (!(await guardWrite(ctx, res, 'item', parentUuid))) return;

      const parentItem = await ctx.getItem(parentUuid);
      if (!parentItem) return sendJson(res, 404, { error: 'parent item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}
      const actor = resolveActor(ctx, typeof data.actor === 'string' ? data.actor : '');
      const slotKey = typeof data.slotKey === 'string' ? data.slotKey.trim() : '';
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });
      if (!slotKey) return sendJson(res, 400, { error: 'slotKey is required' });

      // The slot must exist on the parent's contract: the component's subcategory is derived from it.
      const parentSub = await resolveEffectiveSubCategory(parentUuid);
      const part = parentSub !== null ? getAssemblyContract(parentSub)?.parts.find((p) => p.key === slotKey) : undefined;
      if (!part) return sendJson(res, 400, { error: `slot "${slotKey}" is not defined for this device` });

      const occupied = await query<{ ItemUUID: string }>(
        `SELECT c."ItemUUID" FROM item_relations ir JOIN items c ON c."ItemUUID" = ir."ChildItemUUID"
          WHERE ir."ParentItemUUID" = $1 AND ir."RelationType" = 'Zerlegt_aus' AND ir."SlotKey" = $2
            AND (c."BoxID" IS NULL OR c."BoxID" = '')`,
        [parentUuid, slotKey]
      );
      if (occupied.length > 0 && !part.multipleAllowed) {
        return sendJson(res, 409, { error: 'Steckplatz ist bereits belegt', itemUUID: occupied[0].ItemUUID });
      }

      let newItemUUID: string;
      try {
        newItemUUID = await mintPartItemUUID(parentUuid, part.targetSubcategory);
      } catch (err) {
        if (err instanceof PartIdError) return sendJson(res, 400, { error: err.message });
        throw err;
      }

      const deviceLabel = (parentItem.Bezeichnung || parentItem.Artikelbeschreibung || parentItem.Artikel_Nummer || parentUuid) as string;
      const now = new Date().toISOString();
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO items ("ItemUUID","Artikel_Nummer","BoxID","Location","Auf_Lager","Datum_erfasst","UpdatedAt","TenantId")
           VALUES ($1,NULL,NULL,$2,1,$3,$3,(SELECT "TenantId" FROM items WHERE "ItemUUID" = $4))`,
          [newItemUUID, deviceLabel, now, parentUuid]
        );
        await client.query(
          `INSERT INTO item_relations ("ParentItemUUID","ChildItemUUID","RelationType","SlotKey","CreatedAt","UpdatedAt","TenantId")
           VALUES ($1,$2,'Zerlegt_aus',$3,NOW(),NOW(),(SELECT "TenantId" FROM items WHERE "ItemUUID" = $1))`,
          [parentUuid, newItemUUID, slotKey]
        );
      });

      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: parentUuid,
        Event: 'SparePartCataloged',
        Meta: JSON.stringify({ childItemUUID: newItemUUID, artikelNummer: null, slotKey, component: true })
      });
      await recomputeQualityScoreSafely(newItemUUID, { actor, logEvent: ctx.logEvent });
      console.info('[catalog-spare-part] Component cataloged (no reference)', { parentUuid, newItemUUID, slotKey, actor });
      return sendJson(res, 201, { itemUUID: newItemUUID, subCategory: part.targetSubcategory });
    }

    // ── GET /api/items/:uuid/parts-tree ───────────────────────────────────────
    // The Einzelteile page: slots, stored answers and linked parts, recursively (lib/parts-tree).
    if (method === 'GET' && PARTS_TREE_ROUTE.test(urlPath)) {
      const uuid = decodeURIComponent(urlPath.match(PARTS_TREE_ROUTE)![1]);
      const tree = await buildPartsTree(uuid);
      if (!tree) return sendJson(res, 404, { error: 'item not found' });
      return sendJson(res, 200, { tree });
    }

    // ── GET /api/items/:parentUuid/spare-parts ────────────────────────────────
    if (method === 'GET' && SPARE_PARTS_ROUTE.test(urlPath)) {
      const match = urlPath.match(SPARE_PARTS_ROUTE);
      const parentUuid = match ? decodeURIComponent(match[1]) : '';
      if (!parentUuid) return sendJson(res, 400, { error: 'invalid item id' });

      const spareParts = await query(`
        SELECT ir."ChildItemUUID" AS "ItemUUID", ir."SlotKey" AS "slotKey",
               i."Artikel_Nummer", i."BoxID", i."Location",
               i."QualityScoreMin", i."QualityScoreMax",
               r."Artikelbeschreibung", r."Kurzbeschreibung"
        FROM item_relations ir
        JOIN items i ON i."ItemUUID" = ir."ChildItemUUID"
        LEFT JOIN item_refs r ON r."Artikel_Nummer" = i."Artikel_Nummer"
        WHERE ir."ParentItemUUID" = $1 AND ir."RelationType" = 'Zerlegt_aus'
        ORDER BY ir."CreatedAt"
      `, [parentUuid]);

      return sendJson(res, 200, { spareParts });
    }

    // ── DELETE /api/items/:uuid/spare-part-link ───────────────────────────────
    if (method === 'DELETE') {
      const match = urlPath.match(SPARE_PART_LINK_DELETE_ROUTE);
      const uuid = match ? decodeURIComponent(match[1]) : '';
      if (!uuid) return sendJson(res, 400, { error: 'invalid item id' });
      if (!(await guardWrite(ctx, res, 'item', uuid))) return;

      const item = await ctx.getItem(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      if (item.BoxID !== null) {
        return sendJson(res, 409, { error: 'Bauteil wurde bereits entnommen und kann nicht mehr gelöst werden' });
      }
      const [linkParent] = await query<{ ParentItemUUID: string }>(
        `SELECT "ParentItemUUID" FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
        [uuid]
      );

      await withTransaction(async (client) => {
        await client.query(
          `DELETE FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
          [uuid]
        );
        await client.query(`DELETE FROM items WHERE "ItemUUID" = $1`, [uuid]);
      });

      // The relation is gone, so the parent must be read before the delete and recomputed after.
      if (linkParent?.ParentItemUUID) {
        await recomputeQualityScoreSafely(linkParent.ParentItemUUID, { actor: resolveActor(ctx, ''), logEvent: ctx.logEvent });
      }
      return sendJson(res, 200, { ok: true });
    }

    // ── POST /api/items/:parentUuid/spare-parts/new-ref ───────────────────────
    if (method === 'POST' && SPARE_PARTS_NEW_REF_ROUTE.test(urlPath)) {
      const match = urlPath.match(SPARE_PARTS_NEW_REF_ROUTE);
      const parentUuid = match ? decodeURIComponent(match[1]) : '';
      if (!parentUuid) return sendJson(res, 400, { error: 'invalid item id' });
      // Disassembling a device creates parts from it: the device must be the requester's own.
      if (!(await guardWrite(ctx, res, 'item', parentUuid))) return;

      const parentItem = await ctx.getItem(parentUuid);
      if (!parentItem) return sendJson(res, 404, { error: 'parent item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const artikelbeschreibung = typeof data.artikelbeschreibung === 'string' ? data.artikelbeschreibung.trim() : '';
      const hersteller = typeof data.hersteller === 'string' ? data.hersteller.trim() : '';
      const subCategory = typeof data.subCategory === 'number' ? data.subCategory : null;
      const actor = resolveActor(ctx, typeof data.actor === 'string' ? data.actor : '');
      const slotKey = typeof data.slotKey === 'string' ? data.slotKey.trim() : '';
      const instanceSpecs = data.instanceSpecs && typeof data.instanceSpecs === 'object' && !Array.isArray(data.instanceSpecs)
        ? data.instanceSpecs as Record<string, string>
        : null;

      if (!artikelbeschreibung) return sendJson(res, 400, { error: 'artikelbeschreibung is required' });
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });

      // Generate new Artikel_Nummer
      const maxStr: string | null = await ctx.getMaxArtikelNummer();
      const next = String((maxStr ? parseInt(maxStr, 10) : 0) + 1).padStart(6, '0');

      // Generate UUID for the new instance
      let newItemUUID: string | null = null;
      for (let i = 0; i < 5; i++) {
        const candidate = await ctx.generateItemUUID(next);
        const existing = await ctx.getItem(candidate);
        if (!existing) { newItemUUID = candidate; break; }
      }
      if (!newItemUUID) return sendJson(res, 500, { error: 'Failed to generate item UUID' });

      const deviceLabel = (parentItem.Bezeichnung || parentItem.Artikelbeschreibung || parentItem.Artikel_Nummer || parentUuid) as string;
      const now = new Date().toISOString();
      const instanceSpecsJson = instanceSpecs ? JSON.stringify(instanceSpecs) : null;

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO item_refs ("Artikel_Nummer","Artikelbeschreibung","Hersteller","Unterkategorien_A","ContributedByTenant")
           VALUES ($1,$2,$3,$4,$5)`,
          [next, artikelbeschreibung, hersteller || null, subCategory, resolveTenant(ctx)]
        );

        await client.query(
          // A part taken out of a device belongs to the device's owner.
          `INSERT INTO items ("ItemUUID","Artikel_Nummer","BoxID","Location","Auf_Lager","InstanceSpecs","Datum_erfasst","UpdatedAt","TenantId")
           VALUES ($1,$2,NULL,$3,1,$4,$5,$5,(SELECT "TenantId" FROM items WHERE "ItemUUID" = $6))`,
          [newItemUUID, next, deviceLabel, instanceSpecsJson, now, parentUuid]
        );

        await client.query(
          `INSERT INTO item_relations ("ParentItemUUID","ChildItemUUID","RelationType","SlotKey","CreatedAt","UpdatedAt","TenantId")
           VALUES ($1,$2,'Zerlegt_aus',$3,NOW(),NOW(),(SELECT "TenantId" FROM items WHERE "ItemUUID" = $1))`,
          [parentUuid, newItemUUID, slotKey || null]
        );

        const parentArtikelNr = parentItem.Artikel_Nummer;
        if (parentArtikelNr) {
          await client.query(
            `INSERT INTO item_ref_relations ("ParentArtikel_Nummer","ChildArtikel_Nummer","RelationType","Notes","CreatedAt")
             VALUES ($1,$2,'Ersatzteil',NULL,NOW())
             ON CONFLICT DO NOTHING`,
            [parentArtikelNr, next]
          );
        }
      });

      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: parentUuid,
        Event: 'SparePartCataloged',
        Meta: JSON.stringify({ childItemUUID: newItemUUID, artikelNummer: next, slotKey: slotKey || null, newRef: true })
      });

      await recomputeQualityScoreSafely(newItemUUID, { actor, logEvent: ctx.logEvent });
      console.info('[catalog-spare-part] New ref + spare part cataloged', { parentUuid, newItemUUID, artikelNummer: next, slotKey, actor });
      return sendJson(res, 201, { itemUUID: newItemUUID, artikelNummer: next });
    }

    // ── POST /api/items/:parentUuid/spare-parts ───────────────────────────────
    if (method === 'POST' && SPARE_PARTS_ROUTE.test(urlPath)) {
      const match = urlPath.match(SPARE_PARTS_ROUTE);
      const parentUuid = match ? decodeURIComponent(match[1]) : '';
      if (!parentUuid) return sendJson(res, 400, { error: 'invalid item id' });
      // Disassembling a device creates parts from it: the device must be the requester's own.
      if (!(await guardWrite(ctx, res, 'item', parentUuid))) return;

      const parentItem = await ctx.getItem(parentUuid);
      if (!parentItem) return sendJson(res, 404, { error: 'parent item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const artikelNummer = typeof data.artikelNummer === 'string' ? data.artikelNummer.trim() : '';
      const actor = resolveActor(ctx, typeof data.actor === 'string' ? data.actor : '');
      const slotKey = typeof data.slotKey === 'string' ? data.slotKey.trim() : '';
      const instanceSpecs = data.instanceSpecs && typeof data.instanceSpecs === 'object' && !Array.isArray(data.instanceSpecs)
        ? data.instanceSpecs as Record<string, string>
        : null;

      if (!artikelNummer) return sendJson(res, 400, { error: 'artikelNummer is required' });
      if (!actor) return sendJson(res, 400, { error: 'actor is required' });

      let newItemUUID: string | null = null;
      for (let i = 0; i < 5; i++) {
        const candidate = await ctx.generateItemUUID(artikelNummer);
        const existing = await ctx.getItem(candidate);
        if (!existing) { newItemUUID = candidate; break; }
      }
      if (!newItemUUID) return sendJson(res, 500, { error: 'Failed to generate item UUID' });

      const deviceLabel = (parentItem.Bezeichnung || parentItem.Artikelbeschreibung || parentItem.Artikel_Nummer || parentUuid) as string;
      const now = new Date().toISOString();
      const instanceSpecsJson = instanceSpecs ? JSON.stringify(instanceSpecs) : null;

      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO items ("ItemUUID","Artikel_Nummer","BoxID","Location","Auf_Lager","InstanceSpecs","Datum_erfasst","UpdatedAt","TenantId")
           VALUES ($1,$2,NULL,$3,1,$4,$5,$5,(SELECT "TenantId" FROM items WHERE "ItemUUID" = $6))`,
          [newItemUUID, artikelNummer, deviceLabel, instanceSpecsJson, now, parentUuid]
        );

        await client.query(
          `INSERT INTO item_relations ("ParentItemUUID","ChildItemUUID","RelationType","SlotKey","CreatedAt","UpdatedAt","TenantId")
           VALUES ($1,$2,'Zerlegt_aus',$3,NOW(),NOW(),(SELECT "TenantId" FROM items WHERE "ItemUUID" = $1))`,
          [parentUuid, newItemUUID, slotKey || null]
        );

        const parentArtikelNr = parentItem.Artikel_Nummer;
        if (parentArtikelNr) {
          await client.query(
            `INSERT INTO item_ref_relations ("ParentArtikel_Nummer","ChildArtikel_Nummer","RelationType","Notes","CreatedAt")
             VALUES ($1,$2,'Ersatzteil',NULL,NOW())
             ON CONFLICT DO NOTHING`,
            [parentArtikelNr, artikelNummer]
          );
        }
      });

      await ctx.logEvent({
        Actor: actor,
        EntityType: 'Item',
        EntityId: parentUuid,
        Event: 'SparePartCataloged',
        Meta: JSON.stringify({ childItemUUID: newItemUUID, artikelNummer, slotKey: slotKey || null })
      });

      // Starts at the new part (no score yet) and walks up: the parent's slot becomes "present, unassessed".
      await recomputeQualityScoreSafely(newItemUUID, { actor, logEvent: ctx.logEvent });
      console.info('[catalog-spare-part] Spare part cataloged', { parentUuid, newItemUUID, artikelNummer, slotKey, actor });
      return sendJson(res, 201, { itemUUID: newItemUUID });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  },
  view: () => '<div class="card"><p class="muted">Catalog spare part API</p></div>'
});

export default action;
