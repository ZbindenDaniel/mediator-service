import type { Box } from '../../../models';
import type { BoxSortKey } from './BoxList';

export interface PrepareBoxesOptions {
  searchText: string;
  sortKey: BoxSortKey;
}

function compareBoxId(a: Box, b: Box): number {
  return (a.BoxID || '').localeCompare(b.BoxID || '');
}

export function prepareBoxesForDisplay(boxes: Box[], options: PrepareBoxesOptions): Box[] {
  const { searchText, sortKey } = options;
  const normalizedQuery = searchText.trim().toLowerCase();

  const filtered = normalizedQuery
    ? boxes.filter((box) => {
        const candidates = [box.BoxID, box.StandortLabel, box.Location].filter(
          (value): value is string => typeof value === 'string' && value.trim() !== ''
        );
        return candidates.some((candidate) => candidate.toLowerCase().includes(normalizedQuery));
      })
    : boxes;

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'StandortLabel': {
        const labelA = (a.StandortLabel || '').toLowerCase();
        const labelB = (b.StandortLabel || '').toLowerCase();
        return labelA.localeCompare(labelB) || compareBoxId(a, b);
      }
      case 'UpdatedAt': {
        const dateA = a.UpdatedAt ? new Date(a.UpdatedAt).getTime() : 0;
        const dateB = b.UpdatedAt ? new Date(b.UpdatedAt).getTime() : 0;
        if (dateA === dateB) {
          return compareBoxId(a, b);
        }
        return dateB - dateA;
      }
      case 'BoxID':
      default:
        return compareBoxId(a, b);
    }
  });

  return sorted;
}
