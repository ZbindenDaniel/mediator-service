// The Einzelteile tree of a device: its assembly contract's slots with their stored answers and the
// part items linked to them, recursively. Built on the server in one call so the page's two panels
// read one consistent snapshot instead of stitching ~15 requests together.

import { query, queryOne } from '../db-client';
import { getAssemblyContract } from '../contracts/registry';
import { resolveEffectiveSubCategory } from './quality-score';
import type { PartsTreeNode, PartsTreeSlot } from '../../models/parts-tree';

// Assembly trees are a handful of levels deep; the bound only guards against corrupt relation loops.
const MAX_DEPTH = 8;

interface ItemRow {
  ItemUUID: string;
  Artikel_Nummer: string | null;
  BoxID: string | null;
  QualityId: number | null;
  QualityScoreMin: number | null;
  QualityScoreMax: number | null;
  Quality: number | null;
  Artikelbeschreibung: string | null;
  Kurzbeschreibung: string | null;
  responses: string | null;
}

function parseAnswers(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

async function buildNode(itemUUID: string, fallbackLabel: string, depth: number): Promise<PartsTreeNode | null> {
  const row = await queryOne<ItemRow>(
    `SELECT i."ItemUUID", i."Artikel_Nummer", i."BoxID", i."QualityId", i."QualityScoreMin", i."QualityScoreMax",
            i."Quality", r."Artikelbeschreibung", r."Kurzbeschreibung", qa.responses
       FROM items i
       LEFT JOIN item_refs r ON r."Artikel_Nummer" = NULLIF(i."Artikel_Nummer", '')
       LEFT JOIN quality_assessments qa ON qa.id = i."QualityId"
      WHERE i."ItemUUID" = $1`,
    [itemUUID]
  );
  if (!row) return null;
  const subCategory = await resolveEffectiveSubCategory(itemUUID);
  const contract = subCategory !== null ? getAssemblyContract(subCategory) : null;
  const node: PartsTreeNode = {
    itemUUID: row.ItemUUID,
    artikelNummer: row.Artikel_Nummer || null,
    label: row.Kurzbeschreibung || row.Artikelbeschreibung || fallbackLabel,
    subCategory,
    boxId: row.BoxID || null,
    assessed: row.QualityId !== null,
    scoreMin: num(row.QualityScoreMin),
    scoreMax: num(row.QualityScoreMax),
    quality: num(row.Quality),
    assembly: null,
  };
  if (!contract || depth >= MAX_DEPTH) return node;

  const answers = parseAnswers(row.responses);
  const links = await query<{ ChildItemUUID: string; SlotKey: string | null }>(
    `SELECT "ChildItemUUID", "SlotKey" FROM item_relations
      WHERE "ParentItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus' ORDER BY "CreatedAt"`,
    [itemUUID]
  );
  const slots: PartsTreeSlot[] = [];
  for (const part of contract.parts) {
    const items: PartsTreeNode[] = [];
    for (const link of links.filter((l) => l.SlotKey === part.key)) {
      const child = await buildNode(link.ChildItemUUID, part.label, depth + 1);
      if (child) items.push(child);
    }
    slots.push({
      part,
      answer: part.question ? answers[part.question.id] ?? null : null,
      specAnswer: part.specQuestion ? answers[part.specQuestion.id] ?? null : null,
      items,
    });
  }
  node.assembly = { steps: contract.steps ?? [], slots };
  return node;
}

export async function buildPartsTree(itemUUID: string): Promise<PartsTreeNode | null> {
  return buildNode(itemUUID, itemUUID, 0);
}
