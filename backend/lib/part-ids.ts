// Minting of in-device part IDs (C-<root Artikelnummer>-<subcategory>-<####>, see itemIds.ts).
//
// Both creators — the reference-less catalogue route and intake's serial-bearing components — go
// through mintPartItemUUID so the format and the counter cannot drift apart. The query function is
// injected because intake mints several parts inside one transaction: the counter must see the rows
// that transaction already inserted, so it has to run on the transaction's client.

import type { PoolClient } from 'pg';
import { queryOne as defaultQueryOne } from '../db-client';
import { getAssemblyContract } from '../contracts/registry';
import { resolveEffectiveSubCategory } from './quality-score';
import { partItemUUIDStem, nextPartItemUUID } from './itemIds';

export type PartIdQueryOne = <T>(sql: string, params: unknown[]) => Promise<T | null | undefined>;

// Assembly trees are a handful of levels deep; the bound only guards against corrupt relation loops.
const MAX_DEPTH = 12;

export class PartIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartIdError';
  }
}

/** Query function bound to an open transaction client. */
export function partIdQueryOneFor(client: PoolClient): PartIdQueryOne {
  return async <T>(sql: string, params: unknown[]) => (await client.query(sql, params)).rows[0] as T | undefined;
}

/**
 * Artikelnummer of the top device `itemUUID` sits in (itself when it is not a part). Walks
 * `Zerlegt_aus` up in one query; a removed part keeps its relation, so this is its origin device.
 */
export async function resolveRootArtikelNummer(
  itemUUID: string,
  queryOne: PartIdQueryOne = defaultQueryOne
): Promise<string | null> {
  const row = await queryOne<{ Artikel_Nummer: string | null }>(
    `WITH RECURSIVE up AS (
       SELECT $1::text AS id, 0 AS depth
       UNION ALL
       SELECT ir."ParentItemUUID", up.depth + 1
         FROM item_relations ir JOIN up ON ir."ChildItemUUID" = up.id
        WHERE ir."RelationType" = 'Zerlegt_aus' AND up.depth < $2
     )
     SELECT i."Artikel_Nummer" FROM up JOIN items i ON i."ItemUUID" = up.id
      ORDER BY up.depth DESC LIMIT 1`,
    [itemUUID, MAX_DEPTH]
  );
  const value = typeof row?.Artikel_Nummer === 'string' ? row.Artikel_Nummer.trim() : '';
  return value || null;
}

/** Target subcategory of `slotKey` on the parent's assembly contract, or null when it has none. */
export async function resolveSlotSubCategory(parentUUID: string, slotKey: string): Promise<number | null> {
  const parentSub = await resolveEffectiveSubCategory(parentUUID);
  if (parentSub === null) return null;
  return getAssemblyContract(parentSub)?.parts.find((p) => p.key === slotKey)?.targetSubcategory ?? null;
}

/**
 * Next free ID for a part placed under `parentUUID` with `subCategory`. Two concurrent mints of the
 * same pair can still collide; the items primary key then rejects the second insert, as for I- IDs.
 */
export async function mintPartItemUUID(
  parentUUID: string,
  subCategory: number | null,
  queryOne: PartIdQueryOne = defaultQueryOne
): Promise<string> {
  const root = await resolveRootArtikelNummer(parentUUID, queryOne);
  if (!root) throw new PartIdError('Gerät ohne Artikelnummer: Teile-ID kann nicht gebildet werden');
  let stem: string;
  try {
    stem = partItemUUIDStem(root, subCategory);
  } catch {
    throw new PartIdError(`Artikelnummer "${root}" des Geräts eignet sich nicht für eine Teile-ID`);
  }
  const latest = await queryOne<{ ItemUUID: string }>(
    `SELECT "ItemUUID" FROM items
      WHERE "ItemUUID" LIKE $1 AND substr("ItemUUID", $2) ~ '^[0-9]+$'
      ORDER BY CAST(substr("ItemUUID", $2) AS INTEGER) DESC
      LIMIT 1`,
    [`${stem}%`, stem.length + 1]
  );
  return nextPartItemUUID(stem, latest?.ItemUUID);
}
