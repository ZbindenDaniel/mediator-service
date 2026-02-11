import type { Box } from '../../../../models';
import { prepareBoxesForDisplay } from '../boxListUtils';

function makeBox(overrides: Partial<Box>): Box {
  return {
    BoxID: 'B-DEFAULT',
    LocationId: null,
    UpdatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('prepareBoxesForDisplay', () => {
  it('filters by box id and location fields', () => {
    const boxes: Box[] = [
      makeBox({ BoxID: 'B-001', LocationId: 'S-AAA', Label: 'Nord Regal' }),
      makeBox({ BoxID: 'B-002', LocationId: 'S-BBB', Label: 'Sued Regal' }),
    ];

    expect(prepareBoxesForDisplay(boxes, { searchText: 'b-001', sortKey: 'boxId' })).toHaveLength(1);
    expect(prepareBoxesForDisplay(boxes, { searchText: 's-bbb', sortKey: 'boxId' })).toHaveLength(1);
    expect(prepareBoxesForDisplay(boxes, { searchText: 'sued', sortKey: 'boxId' })).toHaveLength(1);
  });

  it('sorts by updated date descending', () => {
    const boxes: Box[] = [
      makeBox({ BoxID: 'B-OLD', UpdatedAt: '2024-01-01T00:00:00.000Z' }),
      makeBox({ BoxID: 'B-NEW', UpdatedAt: '2024-05-01T00:00:00.000Z' }),
    ];

    const result = prepareBoxesForDisplay(boxes, { searchText: '', sortKey: 'updatedAt' });
    expect(result.map((box) => box.BoxID)).toEqual(['B-NEW', 'B-OLD']);
  });
});
