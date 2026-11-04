import type { GroupedItemDisplay } from '../../lib/itemGrouping';
import { resolveRangeItemIds } from '../ItemList';

const group = (key: string, ...ids: string[]) =>
  ({ key, items: ids.map((ItemUUID) => ({ ItemUUID })) } as unknown as GroupedItemDisplay);

const groups = [group('a', 'a1'), group('b', 'b1', 'b2'), group('c', 'c1'), group('d', 'd1')];

describe('resolveRangeItemIds', () => {
  it('spans every item of every group between anchor and target in display order', () => {
    expect(resolveRangeItemIds(groups, 'a', 'c')).toEqual(['a1', 'b1', 'b2', 'c1']);
  });

  it('works upwards (target above anchor)', () => {
    expect(resolveRangeItemIds(groups, 'd', 'b')).toEqual(['b1', 'b2', 'c1', 'd1']);
  });

  it('returns null without a visible anchor so only the clicked row toggles', () => {
    expect(resolveRangeItemIds(groups, null, 'b')).toBeNull();
    expect(resolveRangeItemIds(groups, 'gone', 'b')).toBeNull();
  });
});
