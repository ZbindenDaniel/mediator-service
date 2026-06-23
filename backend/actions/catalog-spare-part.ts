import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { withTransaction, query } from '../db-client';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const SPARE_PARTS_ROUTE = /^\/api\/items\/([^/]+)\/spare-parts$/;
const SPARE_PARTS_NEW_REF_ROUTE = /^\/api\/items\/([^/]+)\/spare-parts\/new-ref$/;
const SPARE_PART_LINK_DELETE_ROUTE = /^\/api\/items\/([^/]+)\/spare-part-link$/;

const action = defineHttpAction({
  key: 'catalog-spare-part',
  label: 'Catalog spare part',
  appliesTo: () => false,
  matches: (path, method) =>
    (SPARE_PARTS_ROUTE.test(path) && (method === 'GET' || method === 'POST')) ||
    (SPARE_PARTS_NEW_REF_ROUTE.test(path) && method === 'POST') ||
    (SPARE_PART_LINK_DELETE_ROUTE.test(path) && method === 'DELETE'),

  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const method = req.method || 'GET';
    const urlPath = (req.url || '').split('?')[0];

    // ── GET /api/items/:parentUuid/spare-parts ────────────────────────────────
    if (method === 'GET' && SPARE_PARTS_ROUTE.test(urlPath)) {
      const match = urlPath.match(SPARE_PARTS_ROUTE);
      const parentUuid = match ? decodeURIComponent(match[1]) : '';
      if (!parentUuid) return sendJson(res, 400, { error: 'invalid item id' });

      const spareParts = await query(`
        SELECT ir."ChildItemUUID" AS "ItemUUID", ir."Notes" AS "slotKey",
               i."Artikel_Nummer", i."BoxID", i."Location",
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

      const item = await ctx.getItem(uuid);
      if (!item) return sendJson(res, 404, { error: 'item not found' });
      if (item.BoxID !== null) {
        return sendJson(res, 409, { error: 'Bauteil wurde bereits entnommen und kann nicht mehr gelöst werden' });
      }

      await withTransaction(async (client) => {
        await client.query(
          `DELETE FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
          [uuid]
        );
        await client.query(`DELETE FROM items WHERE "ItemUUID" = $1`, [uuid]);
      });

      return sendJson(res, 200, { ok: true });
    }

    // ── POST /api/items/:parentUuid/spare-parts/new-ref ───────────────────────
    if (method === 'POST' && SPARE_PARTS_NEW_REF_ROUTE.test(urlPath)) {
      const match = urlPath.match(SPARE_PARTS_NEW_REF_ROUTE);
      const parentUuid = match ? decodeURIComponent(match[1]) : '';
      if (!parentUuid) return sendJson(res, 400, { error: 'invalid item id' });

      const parentItem = await ctx.getItem(parentUuid);
      if (!parentItem) return sendJson(res, 404, { error: 'parent item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const artikelbeschreibung = typeof data.artikelbeschreibung === 'string' ? data.artikelbeschreibung.trim() : '';
      const hersteller = typeof data.hersteller === 'string' ? data.hersteller.trim() : '';
      const subCategory = typeof data.subCategory === 'number' ? data.subCategory : null;
      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
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
          `INSERT INTO item_refs ("Artikel_Nummer","Artikelbeschreibung","Hersteller","SubCategory","CreatedAt","UpdatedAt")
           VALUES ($1,$2,$3,$4,$5,$5)`,
          [next, artikelbeschreibung, hersteller || null, subCategory, now]
        );

        await client.query(
          `INSERT INTO items ("ItemUUID","Artikel_Nummer","BoxID","Location","Auf_Lager","InstanceSpecs","Datum_erfasst","UpdatedAt")
           VALUES ($1,$2,NULL,$3,1,$4,$5,$5)`,
          [newItemUUID, next, deviceLabel, instanceSpecsJson, now]
        );

        await client.query(
          `INSERT INTO item_relations ("ParentItemUUID","ChildItemUUID","RelationType","Notes","CreatedAt","UpdatedAt")
           VALUES ($1,$2,'Zerlegt_aus',$3,NOW(),NOW())`,
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

      console.info('[catalog-spare-part] New ref + spare part cataloged', { parentUuid, newItemUUID, artikelNummer: next, slotKey, actor });
      return sendJson(res, 201, { itemUUID: newItemUUID, artikelNummer: next });
    }

    // ── POST /api/items/:parentUuid/spare-parts ───────────────────────────────
    if (method === 'POST' && SPARE_PARTS_ROUTE.test(urlPath)) {
      const match = urlPath.match(SPARE_PARTS_ROUTE);
      const parentUuid = match ? decodeURIComponent(match[1]) : '';
      if (!parentUuid) return sendJson(res, 400, { error: 'invalid item id' });

      const parentItem = await ctx.getItem(parentUuid);
      if (!parentItem) return sendJson(res, 404, { error: 'parent item not found' });

      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data: any = {};
      try { data = JSON.parse(raw || '{}'); } catch {}

      const artikelNummer = typeof data.artikelNummer === 'string' ? data.artikelNummer.trim() : '';
      const actor = typeof data.actor === 'string' ? data.actor.trim() : '';
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
          `INSERT INTO items ("ItemUUID","Artikel_Nummer","BoxID","Location","Auf_Lager","InstanceSpecs","Datum_erfasst","UpdatedAt")
           VALUES ($1,$2,NULL,$3,1,$4,$5,$5)`,
          [newItemUUID, artikelNummer, deviceLabel, instanceSpecsJson, now]
        );

        await client.query(
          `INSERT INTO item_relations ("ParentItemUUID","ChildItemUUID","RelationType","Notes","CreatedAt","UpdatedAt")
           VALUES ($1,$2,'Zerlegt_aus',$3,NOW(),NOW())`,
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

      console.info('[catalog-spare-part] Spare part cataloged', { parentUuid, newItemUUID, artikelNummer, slotKey, actor });
      return sendJson(res, 201, { itemUUID: newItemUUID });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  },
  view: () => '<div class="card"><p class="muted">Catalog spare part API</p></div>'
});

export default action;
