// Graduation: give an in-device component its identity (write-once) when it leaves the device.
//
// The component keeps its ItemUUID (C-<root>-<subcategory>-<####>, see itemIds.ts); only its
// Artikel_Nummer, box and location are set. Relations, events, attachments and printed labels stay
// valid — an earlier design re-minted an I- UUID here and had to re-point every UUID-keyed table.

import type { PoolClient } from 'pg';

export class WriteOnceIdentityError extends Error {
  constructor(public readonly itemUUID: string, public readonly existing: string) {
    super(`identity already set for ${itemUUID} (Artikel_Nummer=${existing}); it is write-once`);
    this.name = 'WriteOnceIdentityError';
  }
}

export interface GraduateParams {
  itemUUID: string;
  artikelNummer: string;
  boxId: string;
  location: string | null;
  now: string; // ISO timestamp
}

/**
 * Set the component's identity, box and location inside an already-open transaction `client`. The
 * target item_refs row must already exist (items.Artikel_Nummer FK). Guards write-once: throws
 * WriteOnceIdentityError if the component already has an Artikel_Nummer. Returns the parent's
 * Artikel_Nummer (if any) so the caller can write the provenance link.
 */
export async function graduateComponentInTx(
  client: PoolClient,
  params: GraduateParams
): Promise<{ parentArtikelNummer: string | null }> {
  const { itemUUID, artikelNummer, boxId, location, now } = params;

  const cur = await client.query(
    'SELECT "Artikel_Nummer" FROM items WHERE "ItemUUID" = $1 FOR UPDATE',
    [itemUUID]
  );
  if (cur.rowCount === 0) throw new Error(`component ${itemUUID} not found`);
  const existingRef = cur.rows[0].Artikel_Nummer as string | null;
  if (existingRef != null && String(existingRef).trim() !== '') {
    throw new WriteOnceIdentityError(itemUUID, String(existingRef));
  }

  // The parent link (for the Ersatzteil provenance record the caller writes).
  const parentRow = await client.query(
    `SELECT p."Artikel_Nummer" AS "ParentArtikelNummer"
       FROM item_relations ir
       JOIN items p ON p."ItemUUID" = ir."ParentItemUUID"
      WHERE ir."ChildItemUUID" = $1 AND ir."RelationType" = 'Zerlegt_aus'
      LIMIT 1`,
    [itemUUID]
  );
  const parentArtikelNummer: string | null = parentRow.rows[0]?.ParentArtikelNummer ?? null;

  await client.query(
    `UPDATE items
        SET "Artikel_Nummer" = $1, "BoxID" = $2, "Location" = $3, "UpdatedAt" = $4
      WHERE "ItemUUID" = $5`,
    [artikelNummer, boxId, location, now, itemUUID]
  );

  return { parentArtikelNummer };
}

/**
 * True when this item still needs graduation — i.e. it has no Artikelnummer yet (an in-device
 * component, whatever its ID looks like). An item that already has
 * a reference (e.g. a legacy catalog-spare-part instance) is relocated as-is, not graduated.
 */
export function needsGraduation(item: { ItemUUID?: string; Artikel_Nummer?: string | null }): boolean {
  return item.Artikel_Nummer == null || String(item.Artikel_Nummer).trim() === '';
}
