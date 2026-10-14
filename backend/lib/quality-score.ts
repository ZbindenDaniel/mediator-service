import { query as defaultQuery, queryOne as defaultQueryOne, execute as defaultExecute } from '../db-client';
import { getAssemblyContract } from '../contracts/registry';
import { loadGeneralContract, loadSubCategoryContract, assemblyToQualityContract } from './quality-contracts';
import { computeQualityScore, scoreToRange, formatQualityScoreRange, gradeFromRange, gradingFrom } from '../../models/quality-score';
import type { QualityScoreChild, QualityScoreRange } from '../../models/quality-score';
import type { QualityGrading } from '../../models/quality-contract';
import type { QualityContract } from '../../models/quality-contract';

// Server side of the percentage quality score (models/quality-score.ts): resolves which contracts
// an item is scored with, computes its range from its latest assessment + its in-device parts, stores
// it on items."QualityScoreMin/Max" and walks up the Zerlegt_aus chain so parents follow their parts.

export interface QualityScoreDb {
  query: typeof defaultQuery;
  queryOne: typeof defaultQueryOne;
  execute: typeof defaultExecute;
}

const defaultDb: QualityScoreDb = { query: defaultQuery, queryOne: defaultQueryOne, execute: defaultExecute };

// Assembly trees are a handful of levels deep; the bound only guards against corrupt relation loops.
const MAX_DEPTH = 12;

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The subcategory an item is assessed with: its reference's Unterkategorien_A, else — for an
 * article-less in-device component — the targetSubcategory of the slot it sits in on its parent.
 * Without the fallback such components resolve no contract at all, which breaks nesting exactly
 * where parts have not been identified yet.
 */
export async function resolveEffectiveSubCategory(itemUUID: string, db: QualityScoreDb = defaultDb, depth = 0): Promise<number | null> {
  if (depth > MAX_DEPTH) return null;
  const row = await db.queryOne<{ Unterkategorien_A: unknown }>(
    `SELECT r."Unterkategorien_A"
       FROM items i
       LEFT JOIN item_refs r ON r."Artikel_Nummer" = NULLIF(i."Artikel_Nummer", '')
      WHERE i."ItemUUID" = $1`,
    [itemUUID]
  );
  if (!row) return null;
  const own = toNumberOrNull(row.Unterkategorien_A);
  if (own !== null) return Math.round(own);

  const rel = await db.queryOne<{ ParentItemUUID: string; SlotKey: string | null }>(
    `SELECT "ParentItemUUID", "SlotKey" FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
    [itemUUID]
  );
  if (!rel?.SlotKey) return null;
  const parentSub = await resolveEffectiveSubCategory(rel.ParentItemUUID, db, depth + 1);
  if (parentSub === null) return null;
  const part = getAssemblyContract(parentSub)?.parts.find((p) => p.key === rel.SlotKey);
  return part ? part.targetSubcategory : null;
}

async function loadAnswers(qualityId: unknown, db: QualityScoreDb): Promise<Record<string, string>> {
  const id = toNumberOrNull(qualityId);
  if (id === null) return {};
  const row = await db.queryOne<{ responses: unknown }>(`SELECT responses FROM quality_assessments WHERE id = $1`, [id]);
  if (!row || typeof row.responses !== 'string') return {};
  try {
    const parsed = JSON.parse(row.responses) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Computes (does not store) an item's range from its latest assessment and its parts' stored ranges. */
export async function computeItemQualityScore(itemUUID: string, db: QualityScoreDb = defaultDb): Promise<QualityScoreRange | null> {
  return (await evaluateItem(itemUUID, db))?.range ?? null;
}

async function evaluateItem(itemUUID: string, db: QualityScoreDb): Promise<{ range: QualityScoreRange | null; grading: QualityGrading } | null> {
  const item = await db.queryOne<{ QualityId: unknown }>(`SELECT "QualityId" FROM items WHERE "ItemUUID" = $1`, [itemUUID]);
  if (!item) return null;
  const subCategory = await resolveEffectiveSubCategory(itemUUID, db);
  const assembly = subCategory !== null ? getAssemblyContract(subCategory) : null;
  const contracts: QualityContract[] = [];
  try {
    contracts.push(loadGeneralContract());
  } catch {
    // no general contract shipped — score with what exists rather than failing the write path
  }
  if (assembly) contracts.push(assemblyToQualityContract(assembly));
  const sub = subCategory !== null ? loadSubCategoryContract(subCategory) : null;
  if (sub) contracts.push(sub);

  const answers = await loadAnswers(item.QualityId, db);
  const childRows = assembly
    ? await db.query<{ SlotKey: string | null; BoxID: string | null; QualityScoreMin: unknown; QualityScoreMax: unknown }>(
        `SELECT ir."SlotKey", c."BoxID", c."QualityScoreMin", c."QualityScoreMax"
           FROM item_relations ir
           JOIN items c ON c."ItemUUID" = ir."ChildItemUUID"
          WHERE ir."ParentItemUUID" = $1 AND ir."RelationType" = 'Zerlegt_aus'`,
        [itemUUID]
      )
    : [];
  const children: QualityScoreChild[] = childRows.map((c) => {
    const min = toNumberOrNull(c.QualityScoreMin);
    const max = toNumberOrNull(c.QualityScoreMax);
    return {
      slotKey: c.SlotKey,
      inDevice: c.BoxID === null || c.BoxID === undefined || c.BoxID === '',
      score: min !== null && max !== null ? { min, max } : null
    };
  });
  return { range: scoreToRange(computeQualityScore({ contracts, answers, assembly, children })), grading: gradingFrom(contracts) };
}

export interface RecomputeOptions {
  actor?: string | null;
  logEvent?: (payload: { Actor: string | null; EntityType: string; EntityId: string; Event: string; Meta: string }) => Promise<void> | void;
  /** Called when an item's 1–5 grade changed (e.g. to enqueue a shop sync). */
  onGradeChange?: (itemUUID: string, grade: number | null) => Promise<void> | void;
}

interface StoredQuality {
  QualityId: unknown;
  Quality: unknown;
  QualityManual: unknown;
  QualityScoreMin: unknown;
  QualityScoreMax: unknown;
}

/**
 * Writes range + grade when they changed. The 1–5 grade follows the range only for items that have
 * an assessment (an imported grade stays the truth until the first one) and no manual override.
 */
async function storeEvaluation(
  itemUUID: string,
  row: StoredQuality,
  evaluation: { range: QualityScoreRange | null; grading: QualityGrading },
  db: QualityScoreDb
): Promise<{ rangeChanged: boolean; gradeChanged: boolean; grade: number | null }> {
  const { range, grading } = evaluation;
  const rangeChanged = !sameRange(range, row.QualityScoreMin, row.QualityScoreMax);
  const currentGrade = toNumberOrNull(row.Quality);
  const derivesGrade = toNumberOrNull(row.QualityId) !== null && row.QualityManual !== true && range !== null;
  const grade = derivesGrade ? gradeFromRange(range, grading) : currentGrade;
  const gradeChanged = derivesGrade && grade !== currentGrade;
  if (rangeChanged || gradeChanged) {
    const params: unknown[] = [itemUUID, range ? range.min : null, range ? range.max : null];
    // Unassessed / manual items: never touch "Quality" (imported or hand-set grade stays as is).
    if (derivesGrade) params.push(grade);
    await db.execute(
      `UPDATE items SET "QualityScoreMin" = $2, "QualityScoreMax" = $3${derivesGrade ? ', "Quality" = $4' : ''} WHERE "ItemUUID" = $1`,
      params
    );
  }
  return { rangeChanged, gradeChanged, grade };
}

function sameRange(a: QualityScoreRange | null, minRaw: unknown, maxRaw: unknown): boolean {
  const min = toNumberOrNull(minRaw);
  const max = toNumberOrNull(maxRaw);
  if (!a) return min === null && max === null;
  if (min === null || max === null) return false;
  // REAL storage rounds; compare at display precision so float noise does not log fake changes
  return Math.abs(a.min - min) < 1e-4 && Math.abs(a.max - max) < 1e-4;
}

/**
 * Recomputes the item and then each Zerlegt_aus ancestor up to the root. Always re-reads current
 * state, so it is idempotent and order-independent. Stops at a tenant boundary: a derived write
 * must never land in another organisation's row (owner-only edits).
 */
export async function recomputeQualityScoreUpward(itemUUID: string, opts: RecomputeOptions = {}, db: QualityScoreDb = defaultDb): Promise<void> {
  let current: string | null = itemUUID;
  const visited = new Set<string>();
  let previousTenant: string | null | undefined;
  for (let depth = 0; current && depth <= MAX_DEPTH && !visited.has(current); depth++) {
    visited.add(current);
    const row: (StoredQuality & { TenantId: string | null }) | null = await db.queryOne(
      `SELECT "TenantId", "QualityId", "Quality", "QualityManual", "QualityScoreMin", "QualityScoreMax" FROM items WHERE "ItemUUID" = $1`,
      [current]
    );
    if (!row) return;
    if (previousTenant !== undefined && previousTenant && row.TenantId && previousTenant !== row.TenantId) {
      console.warn('[quality-score] Stopping roll-up at tenant boundary', { itemUUID: current });
      return;
    }
    previousTenant = row.TenantId;

    const evaluation = await evaluateItem(current, db);
    if (!evaluation) return;
    const { rangeChanged, gradeChanged, grade } = await storeEvaluation(current, row, evaluation, db);
    if (rangeChanged || gradeChanged) {
      const prevMin = toNumberOrNull(row.QualityScoreMin);
      const before = prevMin !== null ? formatQualityScoreRange({ min: prevMin, max: toNumberOrNull(row.QualityScoreMax) ?? 1 }) : '–';
      try {
        await opts.logEvent?.({
          Actor: opts.actor ?? null,
          EntityType: 'Item',
          EntityId: current,
          Event: 'QualityScoreChanged',
          Meta: JSON.stringify({
            from: before,
            to: formatQualityScoreRange(evaluation.range),
            ...(gradeChanged ? { gradeFrom: toNumberOrNull(row.Quality), gradeTo: grade } : {}),
            cause: current === itemUUID ? 'self' : itemUUID
          })
        });
      } catch (err) {
        console.error('[quality-score] Failed to log QualityScoreChanged', { itemUUID: current, error: err });
      }
      if (gradeChanged) {
        try {
          await opts.onGradeChange?.(current, grade);
        } catch (err) {
          console.error('[quality-score] onGradeChange failed', { itemUUID: current, error: err });
        }
      }
    }

    const parent: { ParentItemUUID: string } | null = await db.queryOne(
      `SELECT "ParentItemUUID" FROM item_relations WHERE "ChildItemUUID" = $1 AND "RelationType" = 'Zerlegt_aus'`,
      [current]
    );
    current = parent?.ParentItemUUID ?? null;
  }
}

/** Recompute that never fails the caller's write — the score is derived data and can be rebuilt. */
export async function recomputeQualityScoreSafely(itemUUID: string, opts: RecomputeOptions = {}, db: QualityScoreDb = defaultDb): Promise<void> {
  try {
    await recomputeQualityScoreUpward(itemUUID, opts, db);
  } catch (err) {
    console.error('[quality-score] Recompute failed', { itemUUID, error: err });
  }
}

/**
 * Rebuilds every stored range — needed after contract weights change, since those are config and no
 * per-item write triggers a recompute. Children before parents (deepest first) so each parent reads
 * fresh child values; one pass, no upward walk per item.
 */
export async function recomputeAllQualityScores(db: QualityScoreDb = defaultDb): Promise<{ items: number; changed: number }> {
  const relations = await db.query<{ ParentItemUUID: string; ChildItemUUID: string }>(
    `SELECT "ParentItemUUID", "ChildItemUUID" FROM item_relations WHERE "RelationType" = 'Zerlegt_aus'`
  );
  const assessed = await db.query<{ ItemUUID: string }>(`SELECT "ItemUUID" FROM items WHERE "QualityId" IS NOT NULL OR "QualityScoreMin" IS NOT NULL`);
  const parentOf = new Map(relations.map((r) => [r.ChildItemUUID, r.ParentItemUUID]));
  const ids = new Set<string>([...assessed.map((r) => r.ItemUUID), ...relations.flatMap((r) => [r.ParentItemUUID, r.ChildItemUUID])]);
  const depthOf = (id: string): number => {
    let depth = 0;
    for (let cur = parentOf.get(id); cur && depth <= MAX_DEPTH; cur = parentOf.get(cur)) depth++;
    return depth;
  };
  const ordered = Array.from(ids).sort((a, b) => depthOf(b) - depthOf(a));
  let changed = 0;
  for (const id of ordered) {
    const row = await db.queryOne<StoredQuality>(
      `SELECT "QualityId", "Quality", "QualityManual", "QualityScoreMin", "QualityScoreMax" FROM items WHERE "ItemUUID" = $1`,
      [id]
    );
    if (!row) continue;
    const evaluation = await evaluateItem(id, db);
    if (!evaluation) continue;
    const { rangeChanged, gradeChanged } = await storeEvaluation(id, row, evaluation, db);
    if (rangeChanged || gradeChanged) changed++;
  }
  return { items: ordered.length, changed };
}
