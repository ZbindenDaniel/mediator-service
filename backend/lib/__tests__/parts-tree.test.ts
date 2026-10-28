const items: Record<string, any> = {
  L: { ItemUUID: 'L', Artikel_Nummer: '104523', BoxID: 'B1', QualityId: 1, QualityScoreMin: 0.7, QualityScoreMax: 0.8, Quality: 4, Artikelbeschreibung: 'ThinkPad T480', Kurzbeschreibung: null, responses: JSON.stringify({ part_display: 'Vorhanden', part_fan: 'Nicht vorhanden' }) },
  D: { ItemUUID: 'D', Artikel_Nummer: null, BoxID: null, QualityId: null, QualityScoreMin: null, QualityScoreMax: null, Quality: null, Artikelbeschreibung: null, Kurzbeschreibung: null, responses: null },
};
const links: Record<string, Array<{ ChildItemUUID: string; SlotKey: string }>> = { L: [{ ChildItemUUID: 'D', SlotKey: 'display' }], D: [] };

jest.mock('../../db-client', () => ({
  queryOne: jest.fn(async (_sql: string, params: any[]) => items[params[0]] ?? null),
  query: jest.fn(async (_sql: string, params: any[]) => links[params[0]] ?? []),
}));
jest.mock('../quality-score', () => ({ resolveEffectiveSubCategory: jest.fn(async (id: string) => (id === 'L' ? 201 : 2101)) }));
jest.mock('../../contracts/registry', () => ({
  getAssemblyContract: jest.fn((code: number) => (code === 201
    ? { version: 1, subCategory: 201, steps: [{ key: 's', label: 'S' }], parts: [
      { key: 'display', label: 'Displayassembly', targetSubcategory: 2101, weight: 10, step: 's', question: { id: 'part_display', type: 'select', question: '?', values: ['Vorhanden'] } },
      { key: 'fan', label: 'Lüfter', targetSubcategory: 2118, weight: 2, question: { id: 'part_fan', type: 'select', question: '?', values: ['Nicht vorhanden'] } },
    ] }
    : code === 2101
      ? { version: 1, subCategory: 2101, parts: [{ key: 'webcam', label: 'Webcam', targetSubcategory: 2109 }] }
      : null)),
}));

import { buildPartsTree } from '../parts-tree';

describe('buildPartsTree', () => {
  it('lists every slot with its stored answer and nests linked parts with their own slots', async () => {
    const tree = (await buildPartsTree('L'))!;
    expect(tree).toMatchObject({ itemUUID: 'L', label: 'ThinkPad T480', assessed: true, scoreMin: 0.7, quality: 4 });
    expect(tree.assembly!.steps).toEqual([{ key: 's', label: 'S' }]);
    const [display, fan] = tree.assembly!.slots;
    expect(display.answer).toBe('Vorhanden');
    expect(fan).toMatchObject({ answer: 'Nicht vorhanden', items: [] });
    // An article-less part is labelled after its slot and carries its own (nested) assembly.
    expect(display.items[0]).toMatchObject({ itemUUID: 'D', label: 'Displayassembly', assessed: false, subCategory: 2101 });
    expect(display.items[0].assembly!.slots.map((s) => s.part.key)).toEqual(['webcam']);
    expect(display.items[0].assembly!.steps).toEqual([]);
  });

  it('returns null for an unknown item', async () => {
    expect(await buildPartsTree('nope')).toBeNull();
  });
});
