import { effectiveAnswer, groupSlotsBySteps, slotState } from '../frontend/src/lib/partsTree';
import type { PartsTreeNode, PartsTreeSlot } from '../models/parts-tree';

const PRESENCE = ['Vorhanden', 'Nicht vorhanden', 'Nicht vorgesehen', 'Fest verbaut'];
const part = (key: string, extra: Record<string, unknown> = {}) => ({
  key, label: key, targetSubcategory: 1, weight: 1,
  question: { id: `part_${key}`, type: 'select' as const, question: `${key}?`, values: PRESENCE },
  ...extra,
});
const node = (itemUUID: string, slots: PartsTreeSlot[] | null, extra: Partial<PartsTreeNode> = {}): PartsTreeNode => ({
  itemUUID, artikelNummer: null, label: itemUUID, subCategory: 1, boxId: null, assessed: false,
  scoreMin: null, scoreMax: null, quality: null,
  assembly: slots ? { steps: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], slots } : null,
  ...extra,
});
const slot = (p: ReturnType<typeof part>, answer: string | null = null, items: PartsTreeNode[] = []): PartsTreeSlot =>
  ({ part: p as any, answer, specAnswer: null, items });

describe('parts tree helpers', () => {
  it('derives the slot state from items first, then answer, then the contract default', () => {
    expect(slotState(slot(part('x')))).toBe('unknown');
    expect(slotState(slot(part('x', { default: 'Nicht vorgesehen' })))).toBe('notApplicable');
    expect(effectiveAnswer(slot(part('x', { default: 'Nicht vorgesehen' }))).isDefault).toBe(true);
    expect(slotState(slot(part('x', { default: 'Nicht vorgesehen' }), 'Vorhanden'))).toBe('present');
    expect(slotState(slot(part('x'), 'Nicht vorhanden'))).toBe('missing');
    expect(slotState(slot(part('x'), null, [node('C-1', null)]))).toBe('open');
    expect(slotState(slot(part('x'), null, [node('C-1', null, { assessed: true })]))).toBe('assessed');
    expect(slotState(slot(part('x'), null, [node('C-1', null, { boxId: 'B1' })]))).toBe('removed');
  });

  it('groups slots in step order with the unstepped ones last', () => {
    const tree = node('L', [slot(part('late', { step: 'b' })), slot(part('loose')), slot(part('early', { step: 'a' }))]);
    expect(groupSlotsBySteps(tree).map((g) => [g.label, g.slots.map((s) => s.part.key)])).toEqual([
      ['A', ['early']], ['B', ['late']], ['Weitere Teile', ['loose']],
    ]);
  });
});
