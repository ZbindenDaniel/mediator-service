// Graduation: set a component's identity (write-once) and re-mint its UUID, atomically.
//
// An in-device component carries a temporary C- UUID and no Artikel_Nummer. At Zerlegung it
// is given a real Artikelnummer and re-keyed to a normal I-<Artikelnummer>-#### UUID so a
// graduated component is indistinguishable from an ordinary item. Every UUID-keyed row is
// re-pointed in ONE transaction — a partial swap would strand relations/events, so it must be
// all-or-nothing. Reports are serial-keyed, so they are untouched by the UUID change.

import type { PoolClient } from 'pg';

export class WriteOnceIdentityError extends Error {
  constructor(public readonly itemUUID: string, public readonly existing: string) {
    super(`identity already set for ${itemUUID} (Artikel_Nummer=${existing}); it is write-once`);
    this.name = 'WriteOnceIdentityError';
  }
}

export interface GraduateParams {
  oldUUID: string;
  newUUID: string;
  artikelNummer: string;
  boxId: string;
  location: string | null;
  now: string; // ISO timestamp
}

/**
 * Perform the graduation swap inside an already-open transaction `client`. The target
 * item_refs row and the new UUID must already exist / be minted by the caller. Guards
 * write-once: throws WriteOnceIdentityError if the component already has an Artikel_Nummer.
 * Returns the parent's Artikel_Nummer (if any) so the caller can write the provenance link.
 */
export async function graduateComponentInTx(
  client: PoolClient,
  params: GraduateParams
): Promise<{ parentArtikelNummer: string | null }> {
  const { oldUUID, newUUID, artikelNummer, boxId, location, now } = params;

  const cur = await client.query(
    'SELECT "Artikel_Nummer" FROM items WHERE "ItemUUID" = $1 FOR UPDATE',
    [oldUUID]
  );
  if (cur.rowCount === 0) throw new Error(`component ${oldUUID} not found`);
  const existingRef = cur.rows[0].Artikel_Nummer as string | null;
  if (existingRef != null && String(existingRef).trim() !== '') {
    throw new WriteOnceIdentityError(oldUUID, String(existingRef));
  }

  // The parent link (for the Ersatzteil provenance record the caller writes).
  const parentRow = await client.query(
    `SELECT p."Artikel_Nummer" AS "ParentArtikelNummer"
       FROM item_relations ir
       JOIN items p ON p."ItemUUID" = ir."ParentItemUUID"
      WHERE ir."ChildItemUUID" = $1 AND ir."RelationType" = 'Zerlegt_aus'
      LIMIT 1`,
    [oldUUID]
  );
  const parentArtikelNummer: string | null = parentRow.rows[0]?.ParentArtikelNummer ?? null;

  // 1. Re-key the item row + set identity, box, location. items.Artikel_Nummer FK requires the
  //    ref to already exist (caller's responsibility). user_item_marks cascades via its FK.
  await client.query(
    `UPDATE items
        SET "ItemUUID" = $1, "Artikel_Nummer" = $2, "BoxID" = $3, "Location" = $4, "UpdatedAt" = $5
      WHERE "ItemUUID" = $6`,
    [newUUID, artikelNummer, boxId, location, now, oldUUID]
  );

  // 2. Re-point every remaining UUID-keyed table by hand — these columns have no FK to items,
  //    so nothing cascades for them.
  await client.query('UPDATE item_relations SET "ChildItemUUID" = $1 WHERE "ChildItemUUID" = $2', [newUUID, oldUUID]);
  await client.query('UPDATE item_relations SET "ParentItemUUID" = $1 WHERE "ParentItemUUID" = $2', [newUUID, oldUUID]);
  await client.query(`UPDATE events SET "EntityId" = $1 WHERE "EntityId" = $2 AND "EntityType" = 'Item'`, [newUUID, oldUUID]);
  await client.query('UPDATE item_attachments SET "ItemUUID" = $1 WHERE "ItemUUID" = $2', [newUUID, oldUUID]);
  await client.query('UPDATE label_queue SET "ItemUUID" = $1 WHERE "ItemUUID" = $2', [newUUID, oldUUID]);

  return { parentArtikelNummer };
}

/**
 * True when this item still needs graduation — i.e. it has no Artikelnummer yet, whether it
 * carries a temporary C- UUID or is an otherwise reference-less row. An item that already has
 * a reference (e.g. a legacy catalog-spare-part instance) is relocated as-is, not graduated.
 */
export function needsGraduation(item: { ItemUUID?: string; Artikel_Nummer?: string | null }): boolean {
  return item.Artikel_Nummer == null || String(item.Artikel_Nummer).trim() === '';
}
