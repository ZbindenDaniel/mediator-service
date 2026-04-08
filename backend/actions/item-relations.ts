import type { IncomingMessage, ServerResponse } from 'http';
import { defineHttpAction } from './index';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

const INSTANCE_RELATION_RE = /^\/api\/item\/([^/]+)\/relations(?:\/([^/]+))?$/;
const REF_RELATION_RE = /^\/api\/ref\/([^/]+)\/relations(?:\/([^/]+))?$/;

const action = defineHttpAction({
  key: 'item-relations',
  label: 'Item relations',
  appliesTo: () => false,
  matches: (path, method) => {
    if (INSTANCE_RELATION_RE.test(path) && ['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return true;
    if (REF_RELATION_RE.test(path) && ['GET', 'POST', 'DELETE'].includes(method)) return true;
    return false;
  },
  async handle(req: IncomingMessage, res: ServerResponse, ctx: any) {
    const method = req.method || 'GET';
    const urlPath = (req.url || '').split('?')[0];

    // ── Instance-level relations (/api/item/:uuid/relations[/:childUUID]) ──────
    const instanceMatch = urlPath.match(INSTANCE_RELATION_RE);
    if (instanceMatch) {
      const parentUUID = decodeURIComponent(instanceMatch[1]);
      const childUUID = instanceMatch[2] ? decodeURIComponent(instanceMatch[2]) : null;

      if (method === 'GET') {
        const accessories = ctx.db.prepare(`
          SELECT ir.Id, ir.ChildItemUUID AS ItemUUID, ir.RelationType, ir.Notes,
                 ir.CreatedAt AS RelationCreatedAt, ir.UpdatedAt,
                 i.Artikel_Nummer, r.Artikelbeschreibung, r.Kurzbeschreibung,
                 i.BoxID, i.Location
          FROM item_relations ir
          JOIN items i ON i.ItemUUID = ir.ChildItemUUID
          LEFT JOIN item_refs r ON r.Artikel_Nummer = i.Artikel_Nummer
          WHERE ir.ParentItemUUID = ?
          ORDER BY ir.CreatedAt
        `).all(parentUUID);

        const devices = ctx.db.prepare(`
          SELECT ir.Id, ir.ParentItemUUID AS ItemUUID, ir.RelationType, ir.Notes,
                 ir.CreatedAt AS RelationCreatedAt, ir.UpdatedAt,
                 i.Artikel_Nummer, r.Artikelbeschreibung, r.Kurzbeschreibung,
                 i.BoxID, i.Location
          FROM item_relations ir
          JOIN items i ON i.ItemUUID = ir.ParentItemUUID
          LEFT JOIN item_refs r ON r.Artikel_Nummer = i.Artikel_Nummer
          WHERE ir.ChildItemUUID = ?
          ORDER BY ir.CreatedAt
        `).all(parentUUID);

        return sendJson(res, 200, { connectedAccessories: accessories, connectedToDevices: devices });
      }

      if (method === 'POST' && !childUUID) {
        const data = await readJson(req) as Record<string, unknown>;
        const child = typeof data.childItemUUID === 'string' ? data.childItemUUID.trim() : null;
        if (!child) return sendJson(res, 400, { error: 'childItemUUID is required' });
        if (child === parentUUID) return sendJson(res, 400, { error: 'cannot link item to itself' });

        const parentExists = ctx.db.prepare('SELECT ItemUUID FROM items WHERE ItemUUID = ?').get(parentUUID);
        if (!parentExists) return sendJson(res, 404, { error: 'parent item not found' });
        const childExists = ctx.db.prepare('SELECT ItemUUID FROM items WHERE ItemUUID = ?').get(child);
        if (!childExists) return sendJson(res, 404, { error: 'child item not found' });

        const relationType = typeof data.relationType === 'string' ? data.relationType.trim() : 'Zubehör';
        const notes = typeof data.notes === 'string' ? data.notes.trim() || null : null;
        try {
          ctx.db.prepare(`
            INSERT INTO item_relations (ParentItemUUID, ChildItemUUID, RelationType, Notes)
            VALUES (?, ?, ?, ?)
          `).run(parentUUID, child, relationType, notes);
          ctx.logEvent({
            EntityType: 'Item',
            EntityId: parentUUID,
            Event: 'AccessoryLinked',
            Meta: JSON.stringify({ childItemUUID: child, relationType })
          });
          return sendJson(res, 201, { ok: true });
        } catch (err: any) {
          if (String(err?.message).includes('UNIQUE')) return sendJson(res, 409, { error: 'relation already exists' });
          throw err;
        }
      }

      if (method === 'PATCH' && childUUID) {
        const data = await readJson(req) as Record<string, unknown>;
        const notes = typeof data.notes === 'string' ? data.notes.trim() || null : null;
        const result = ctx.db.prepare(`
          UPDATE item_relations SET Notes = ?, UpdatedAt = datetime('now')
          WHERE ParentItemUUID = ? AND ChildItemUUID = ?
        `).run(notes, parentUUID, childUUID);
        if (result.changes === 0) return sendJson(res, 404, { error: 'relation not found' });
        ctx.logEvent({
          EntityType: 'Item',
          EntityId: parentUUID,
          Event: 'AccessoryRelationUpdated',
          Meta: JSON.stringify({ childItemUUID: childUUID })
        });
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'DELETE' && childUUID) {
        const result = ctx.db.prepare(
          'DELETE FROM item_relations WHERE ParentItemUUID = ? AND ChildItemUUID = ?'
        ).run(parentUUID, childUUID);
        if (result.changes === 0) return sendJson(res, 404, { error: 'relation not found' });
        ctx.logEvent({
          EntityType: 'Item',
          EntityId: parentUUID,
          Event: 'AccessoryUnlinked',
          Meta: JSON.stringify({ childItemUUID: childUUID })
        });
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 405, { error: 'method not allowed' });
    }

    // ── Ref-level relations (/api/ref/:artikelNr/relations[/:childArtikelNr]) ──
    const refMatch = urlPath.match(REF_RELATION_RE);
    if (refMatch) {
      const parentNr = decodeURIComponent(refMatch[1]);
      const childNr = refMatch[2] ? decodeURIComponent(refMatch[2]) : null;

      if (method === 'GET') {
        // Compatible child accessory refs, with available (unconnected) instance count
        const compatibleChildren = ctx.db.prepare(`
          SELECT irr.Id, irr.ChildArtikel_Nummer AS Artikel_Nummer,
                 irr.RelationType, irr.Notes, irr.CreatedAt,
                 r.Artikelbeschreibung, r.Kurzbeschreibung,
                 (
                   SELECT COUNT(*) FROM items i2
                   WHERE i2.Artikel_Nummer = irr.ChildArtikel_Nummer
                     AND i2.ItemUUID NOT IN (SELECT ChildItemUUID FROM item_relations)
                 ) AS availableCount
          FROM item_ref_relations irr
          LEFT JOIN item_refs r ON r.Artikel_Nummer = irr.ChildArtikel_Nummer
          WHERE irr.ParentArtikel_Nummer = ?
          ORDER BY irr.CreatedAt
        `).all(parentNr);

        // Device refs this ref is an accessory for
        const compatibleParents = ctx.db.prepare(`
          SELECT irr.Id, irr.ParentArtikel_Nummer AS Artikel_Nummer,
                 irr.RelationType, irr.Notes, irr.CreatedAt,
                 r.Artikelbeschreibung, r.Kurzbeschreibung
          FROM item_ref_relations irr
          LEFT JOIN item_refs r ON r.Artikel_Nummer = irr.ParentArtikel_Nummer
          WHERE irr.ChildArtikel_Nummer = ?
          ORDER BY irr.CreatedAt
        `).all(parentNr);

        return sendJson(res, 200, { compatibleAccessoryRefs: compatibleChildren, compatibleParentRefs: compatibleParents });
      }

      if (method === 'POST' && !childNr) {
        const data = await readJson(req) as Record<string, unknown>;
        const child = typeof data.childArtikelNummer === 'string' ? data.childArtikelNummer.trim() : null;
        if (!child) return sendJson(res, 400, { error: 'childArtikelNummer is required' });
        if (child === parentNr) return sendJson(res, 400, { error: 'cannot link ref to itself' });

        const relationType = typeof data.relationType === 'string' ? data.relationType.trim() : 'Zubehör';
        const notes = typeof data.notes === 'string' ? data.notes.trim() || null : null;
        try {
          ctx.db.prepare(`
            INSERT INTO item_ref_relations (ParentArtikel_Nummer, ChildArtikel_Nummer, RelationType, Notes)
            VALUES (?, ?, ?, ?)
          `).run(parentNr, child, relationType, notes);
          return sendJson(res, 201, { ok: true });
        } catch (err: any) {
          if (String(err?.message).includes('UNIQUE')) return sendJson(res, 409, { error: 'relation already exists' });
          throw err;
        }
      }

      if (method === 'DELETE' && childNr) {
        const result = ctx.db.prepare(
          'DELETE FROM item_ref_relations WHERE ParentArtikel_Nummer = ? AND ChildArtikel_Nummer = ?'
        ).run(parentNr, childNr);
        if (result.changes === 0) return sendJson(res, 404, { error: 'relation not found' });
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 405, { error: 'method not allowed' });
    }

    return sendJson(res, 404, { error: 'not found' });
  },
  view: () => '<div class="card"><p class="muted">Item relations API</p></div>'
});

export default action;
