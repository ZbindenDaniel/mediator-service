import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';
import { withTransaction, query } from '../db-client';
import { resolveActor } from '../utils/actor';
import { guardWrite } from '../utils/write-guard';
import { recomputeQualityScoreSafely, resolveEffectiveSubCategory } from '../lib/quality-score';
import { getAssemblyContract } from '../contracts/registry';
import { mintPartItemUUID, PartIdError } from '../lib/part-ids';

// POST /api/items/:parentUuid/spare-parts/component — the Einzelteile page's lazy part creation.

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const SPARE_PARTS_COMPONENT_ROUTE = /^\/api\/items\/([^/]+)\/spare-parts\/component$/;

const action = defineHttpAction({
  key: 'part-component',
  label: 'Create in-device part',
  appliesTo: () => false,
  matches: (path, method) => SPARE_PARTS_COMPONENT_ROUTE.test(path) && method === 'POST',

  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    // Catalogue a part into a slot WITHOUT a reference yet (in-device component, C- part ID), so it
    // can be assessed on its own; its article is set when it leaves the device (remove-from-device).
    // Intake already creates such components from scans — this is the manual counterpart.
    const urlPath = (req.url || '').split('?')[0];
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
    console.info('[part-component] Component cataloged (no reference)', { parentUuid, newItemUUID, slotKey, actor });
    return sendJson(res, 201, { itemUUID: newItemUUID, subCategory: part.targetSubcategory });
  },
  view: () => '<div class="card"><p class="muted">In-device part API</p></div>'
});

export default action;
