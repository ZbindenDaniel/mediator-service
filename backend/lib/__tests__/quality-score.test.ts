import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveEffectiveSubCategory, recomputeQualityScoreUpward, computeItemQualityScore, recomputeAllQualityScores } from '../quality-score';
import type { QualityScoreDb } from '../quality-score';
import { clearContractCaches } from '../../contracts/registry';

// In-memory stand-in for the three tables the score reads; SQL is matched by its distinctive text.
interface ItemRow { ItemUUID: string; Artikel_Nummer: string | null; BoxID: string | null; QualityId: number | null; TenantId: string | null; QualityScoreMin: number | null; QualityScoreMax: number | null; Quality?: number | null; QualityManual?: boolean }
function makeDb(items: ItemRow[], relations: Array<{ ParentItemUUID: string; ChildItemUUID: string; SlotKey: string }>, refs: Record<string, number>, assessments: Record<number, Record<string, string>>) {
  const byId = new Map(items.map((i) => [i.ItemUUID, i]));
  const db: QualityScoreDb = {
    queryOne: (async (sql: string, params: unknown[] = []) => {
      const id = params[0] as string;
      if (sql.includes('r."Unterkategorien_A"')) {
        const item = byId.get(id);
        if (!item) return null;
        return { Unterkategorien_A: item.Artikel_Nummer ? refs[item.Artikel_Nummer] ?? null : null };
      }
      if (sql.includes('FROM item_relations') && sql.includes('"ChildItemUUID" = $1')) {
        return relations.find((r) => r.ChildItemUUID === id) ?? null;
      }
      if (sql.includes('FROM quality_assessments')) {
        const a = assessments[params[0] as number];
        return a ? { responses: JSON.stringify(a) } : null;
      }
      if (sql.includes('FROM items')) return byId.get(id) ?? null;
      throw new Error(`unexpected queryOne: ${sql}`);
    }) as QualityScoreDb['queryOne'],
    query: (async (sql: string, params: unknown[] = []) => {
      if (sql.includes('FROM item_relations WHERE "RelationType"')) return relations.map((r) => ({ ParentItemUUID: r.ParentItemUUID, ChildItemUUID: r.ChildItemUUID }));
      if (sql.includes('"QualityId" IS NOT NULL')) return items.filter((i) => i.QualityId !== null || i.QualityScoreMin !== null).map((i) => ({ ItemUUID: i.ItemUUID }));
      if (sql.includes('ir."ParentItemUUID" = $1')) {
        return relations.filter((r) => r.ParentItemUUID === params[0]).map((r) => {
          const c = byId.get(r.ChildItemUUID)!;
          return { SlotKey: r.SlotKey, BoxID: c.BoxID, QualityScoreMin: c.QualityScoreMin, QualityScoreMax: c.QualityScoreMax };
        });
      }
      throw new Error(`unexpected query: ${sql}`);
    }) as QualityScoreDb['query'],
    execute: (async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('UPDATE items SET "QualityScoreMin"')) {
        const row = byId.get(params[0] as string)!;
        row.QualityScoreMin = params[1] as number | null;
        row.QualityScoreMax = params[2] as number | null;
        if (params.length > 3) row.Quality = params[3] as number | null;
        return { rowCount: 1 };
      }
      throw new Error(`unexpected execute: ${sql}`);
    }) as unknown as QualityScoreDb['execute']
  };
  return { db, byId };
}

const presence = (id: string) => ({ id, type: 'select', question: '?', values: ['Vorhanden', 'Nicht vorhanden', 'Nicht vorgesehen', 'Fest verbaut'] });

describe('backend quality score', () => {
  let overlay: string;
  beforeAll(() => {
    // Fake codes 9201 (laptop) → 9202 (display assembly) → 9203 (webcam), kept out of the shipped set.
    overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-score-'));
    fs.mkdirSync(path.join(overlay, 'assembly'));
    fs.mkdirSync(path.join(overlay, 'quality'));
    fs.writeFileSync(path.join(overlay, 'assembly', '9201.json'), JSON.stringify({
      version: 1, subCategory: 9201,
      parts: [
        { key: 'display', label: 'Display', targetSubcategory: 9202, weight: 8, question: presence('part_display') },
        { key: 'keyboard', label: 'Tastatur', targetSubcategory: 9204, weight: 2, question: presence('part_keyboard') }
      ]
    }));
    fs.writeFileSync(path.join(overlay, 'assembly', '9202.json'), JSON.stringify({
      version: 1, subCategory: 9202,
      parts: [{ key: 'webcam', label: 'Webcam', targetSubcategory: 9203, weight: 3, question: presence('part_webcam') }]
    }));
    // Shipped general.json now scores (scratches, …); an empty one keeps these trees self-contained.
    fs.writeFileSync(path.join(overlay, 'quality', 'general.json'), JSON.stringify({ version: 1, questions: [] }));
    fs.writeFileSync(path.join(overlay, 'quality', '9203.json'), JSON.stringify({
      version: 1, subCategory: 9203,
      questions: [{ id: 'part_condition', type: 'select', question: 'Zustand?', weight: 1, values: ['OK', 'Defekt', 'Ungetestet'], qualityImpact: { OK: 5, Defekt: 1 } }]
    }));
    process.env.CONTRACTS_OVERLAY_DIR = overlay;
    clearContractCaches();
  });
  afterAll(() => {
    delete process.env.CONTRACTS_OVERLAY_DIR;
    clearContractCaches();
    fs.rmSync(overlay, { recursive: true, force: true });
  });

  const tree = (webcamAnswer: string | null, webcamBox: string | null = null, webcamTenant: string | null = 'orgA') => makeDb(
    [
      { ItemUUID: 'L', Artikel_Nummer: '100', BoxID: 'B1', QualityId: 1, TenantId: 'orgA', QualityScoreMin: null, QualityScoreMax: null },
      { ItemUUID: 'C-display', Artikel_Nummer: null, BoxID: null, QualityId: null, TenantId: 'orgA', QualityScoreMin: null, QualityScoreMax: null },
      { ItemUUID: 'C-webcam', Artikel_Nummer: null, BoxID: webcamBox, QualityId: webcamAnswer ? 2 : null, TenantId: webcamTenant, QualityScoreMin: null, QualityScoreMax: null }
    ],
    [
      { ParentItemUUID: 'L', ChildItemUUID: 'C-display', SlotKey: 'display' },
      { ParentItemUUID: 'C-display', ChildItemUUID: 'C-webcam', SlotKey: 'webcam' }
    ],
    { '100': 9201 },
    { 1: { part_keyboard: 'Vorhanden' }, ...(webcamAnswer ? { 2: { part_condition: webcamAnswer } } : {}) }
  );

  it('resolves an article-less component through the slot chain', async () => {
    const { db } = tree(null);
    expect(await resolveEffectiveSubCategory('L', db)).toBe(9201);
    expect(await resolveEffectiveSubCategory('C-display', db)).toBe(9202);
    expect(await resolveEffectiveSubCategory('C-webcam', db)).toBe(9203);
  });

  it('propagates a broken webcam up two levels', async () => {
    const { db, byId } = tree('Defekt');
    const events: string[] = [];
    await recomputeQualityScoreUpward('C-webcam', { logEvent: (e) => { events.push(`${e.EntityId}:${e.Event}`); } }, db);
    expect(byId.get('C-webcam')).toMatchObject({ QualityScoreMin: 0, QualityScoreMax: 0 });
    // display assembly: webcam slot (3) worth 0 → 0 %
    expect(byId.get('C-display')).toMatchObject({ QualityScoreMin: 0, QualityScoreMax: 0 });
    // laptop: display 8 × 0 + keyboard 2 present-but-unassessed → 0–20 %
    expect(byId.get('L')!.QualityScoreMin).toBeCloseTo(0);
    expect(byId.get('L')!.QualityScoreMax).toBeCloseTo(0.2);
    expect(events).toEqual(['C-webcam:QualityScoreChanged', 'C-display:QualityScoreChanged', 'L:QualityScoreChanged']);
  });

  it('a good webcam makes the laptop 80–100 %; an unassessed one leaves it uncertain', async () => {
    const good = tree('OK');
    await recomputeQualityScoreUpward('C-webcam', {}, good.db);
    expect(good.byId.get('L')!.QualityScoreMin).toBeCloseTo(0.8);
    expect(good.byId.get('L')!.QualityScoreMax).toBeCloseTo(1);

    const open = tree(null);
    expect(await computeItemQualityScore('C-webcam', open.db)).toEqual({ min: 0, max: 1 });
  });

  it('counts a removed part as missing in its former parent', async () => {
    const { db, byId } = tree('OK', 'B7');
    await recomputeQualityScoreUpward('C-webcam', {}, db);
    expect(byId.get('C-webcam')).toMatchObject({ QualityScoreMin: 1, QualityScoreMax: 1 });
    expect(byId.get('C-display')).toMatchObject({ QualityScoreMin: 0, QualityScoreMax: 0 });
  });

  it('stops at a tenant boundary', async () => {
    const { db, byId } = tree('OK', null, 'orgB');
    await recomputeQualityScoreUpward('C-webcam', {}, db);
    expect(byId.get('C-webcam')!.QualityScoreMin).toBe(1);
    expect(byId.get('C-display')!.QualityScoreMin).toBeNull();
  });

  it('does not log when nothing changed', async () => {
    const { db } = tree('OK');
    await recomputeQualityScoreUpward('C-webcam', {}, db);
    const events: string[] = [];
    await recomputeQualityScoreUpward('C-webcam', { logEvent: (e) => { events.push(e.EntityId); } }, db);
    expect(events).toEqual([]);
  });

  it('recompute-all processes children before parents in one pass', async () => {
    const { db, byId } = tree('OK');
    expect(await recomputeAllQualityScores(db)).toEqual({ items: 3, changed: 3 });
    expect(byId.get('L')!.QualityScoreMin).toBeCloseTo(0.8);
    expect(await recomputeAllQualityScores(db)).toEqual({ items: 3, changed: 0 });
  });

  it('derives the 1–5 grade pessimistically for assessed items, null when too uncertain', async () => {
    const good = tree('OK');
    await recomputeQualityScoreUpward('C-webcam', {}, good.db);
    // laptop 80–100 %: 0.2 wide ≤ 0.25 → grade from lower bound 0.8 → 5
    expect(good.byId.get('L')!.Quality).toBe(5);
    // webcam has an assessment (QualityId 2) and is certain → 5; display has no assessment → grade untouched (U5)
    expect(good.byId.get('C-webcam')!.Quality).toBe(5);
    expect(good.byId.get('C-display')!.Quality).toBeUndefined();

    const open = tree(null);
    await recomputeQualityScoreUpward('C-webcam', {}, open.db);
    // laptop 0–100 %: too wide → no grade
    expect(open.byId.get('L')!.Quality).toBeNull();
  });

  it('leaves a manual grade alone and reports grade changes', async () => {
    const { db, byId } = tree('OK');
    byId.get('L')!.Quality = 2;
    byId.get('L')!.QualityManual = true;
    const changes: string[] = [];
    await recomputeQualityScoreUpward('C-webcam', { onGradeChange: (id, grade) => { changes.push(`${id}:${grade}`); } }, db);
    expect(byId.get('L')!.Quality).toBe(2);
    expect(changes).toEqual(['C-webcam:5']);
  });
});
