import { prepareBoxesForDisplay } from '../frontend/src/components/boxListUtils';
import type { Box } from '../models';

describe('prepareBoxesForDisplay', () => {
  const baseBoxes: Box[] = [
    {
      BoxID: 'BX-002',
      StandortLabel: 'Küche',
      Location: 'LOC-2',
      UpdatedAt: '2024-05-01T10:00:00.000Z',
    },
    {
      BoxID: 'BX-001',
      StandortLabel: 'Lager',
      Location: 'LOC-1',
      UpdatedAt: '2024-05-02T09:00:00.000Z',
    },
    {
      BoxID: 'BX-010',
      StandortLabel: 'Außenbereich',
      Location: 'LOC-3',
      UpdatedAt: '2024-04-29T12:00:00.000Z',
    },
  ];

  test('sorts boxes deterministically by BoxID when no other sort is selected', () => {
    const result = prepareBoxesForDisplay(baseBoxes, { searchText: '', sortKey: 'BoxID' });
    expect(result.map((box) => box.BoxID)).toEqual(['BX-001', 'BX-002', 'BX-010']);
  });

  test('filters by search text across relevant properties before sorting', () => {
    const result = prepareBoxesForDisplay(baseBoxes, { searchText: 'kü', sortKey: 'BoxID' });
    expect(result.map((box) => box.BoxID)).toEqual(['BX-002']);
  });

  test('sorts by UpdatedAt descending with stable fallback', () => {
    const input: Box[] = [
      {
        BoxID: 'BX-003',
        StandortLabel: 'Archiv',
        Location: 'LOC-4',
        UpdatedAt: '2024-05-02T09:00:00.000Z',
      },
      {
        BoxID: 'BX-004',
        StandortLabel: 'Archiv',
        Location: 'LOC-5',
        UpdatedAt: '2024-05-02T09:00:00.000Z',
      },
      {
        BoxID: 'BX-005',
        StandortLabel: 'Archiv',
        Location: 'LOC-6',
        UpdatedAt: '2024-05-03T09:00:00.000Z',
      },
    ];

    const result = prepareBoxesForDisplay(input, { searchText: '', sortKey: 'UpdatedAt' });
    expect(result.map((box) => box.BoxID)).toEqual(['BX-005', 'BX-003', 'BX-004']);
  });

  test('sorts alphabetically by StandortLabel with BoxID tie breaker', () => {
    const input: Box[] = [
      {
        BoxID: 'BX-020',
        StandortLabel: 'Zimmer',
        UpdatedAt: '2024-05-01T08:00:00.000Z',
      },
      {
        BoxID: 'BX-019',
        StandortLabel: 'Zimmer',
        UpdatedAt: '2024-05-02T08:00:00.000Z',
      },
      {
        BoxID: 'BX-018',
        StandortLabel: 'Büro',
        UpdatedAt: '2024-05-03T08:00:00.000Z',
      },
    ];

    const result = prepareBoxesForDisplay(input, { searchText: '', sortKey: 'StandortLabel' });
    expect(result.map((box) => box.BoxID)).toEqual(['BX-018', 'BX-019', 'BX-020']);
  });
});
