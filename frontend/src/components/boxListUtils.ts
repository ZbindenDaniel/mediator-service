import type { Box } from '../../../models';
import { logError, logger } from '../utils/logger';
import type { BoxSortKey } from './BoxList';

// TODO(agent): Revisit whether box list sorting should expose ascending/descending controls alongside the selected date field.
export interface PrepareBoxesOptions {
  searchText: string;
  sortKey: BoxSortKey;
}

function compareBoxId(a: Box, b: Box): number {
  return (a.BoxID || '').localeCompare(b.BoxID || '');
}

function parseTimestamp(value: unknown, context: { boxId: string; field: string }): number {
  if (typeof value !== 'string' || !value.trim()) {
    return Number.NEGATIVE_INFINITY;
  }

  try {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      logger.warn?.('Invalid date value for box sorting; using fallback', { ...context, value });
      return Number.NEGATIVE_INFINITY;
    }
    return parsed;
  } catch (error) {
    logError('Failed to parse date for box sorting; using fallback', error, { ...context, value });
    return Number.NEGATIVE_INFINITY;
  }
}

function buildSearchCandidates(box: Box): string[] {
  try {
    return [box.BoxID, box.LocationId, box.Label, box.ShelfLabel]
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .map((value) => value.toLowerCase());
  } catch (error) {
    logError('Failed to build box search candidates; returning empty candidates', error, {
      boxId: box?.BoxID ?? null
    });
    return [];
  }
}

export function prepareBoxesForDisplay(boxes: Box[], options: PrepareBoxesOptions): Box[] {
  const { searchText, sortKey } = options;
  const normalizedQuery = searchText.trim().toLowerCase();

  const filtered = normalizedQuery
    ? boxes.filter((box) => {
        const candidates = buildSearchCandidates(box);
        return candidates.some((candidate) => candidate.includes(normalizedQuery));
      })
    : boxes;

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'location': {
        const locationA = (a.ShelfLabel || a.Label || a.LocationId || '').toLowerCase();
        const locationB = (b.ShelfLabel || b.Label || b.LocationId || '').toLowerCase();
        return locationA.localeCompare(locationB) || compareBoxId(a, b);
      }
      case 'updatedAt': {
        const dateA = parseTimestamp(a.UpdatedAt, { boxId: a.BoxID, field: 'UpdatedAt' });
        const dateB = parseTimestamp(b.UpdatedAt, { boxId: b.BoxID, field: 'UpdatedAt' });
        if (dateA === dateB) {
          return compareBoxId(a, b);
        }
        return dateB - dateA;
      }
      case 'createdAt': {
        const dateA = parseTimestamp(a.CreatedAt, { boxId: a.BoxID, field: 'CreatedAt' });
        const dateB = parseTimestamp(b.CreatedAt, { boxId: b.BoxID, field: 'CreatedAt' });
        if (dateA === dateB) {
          return compareBoxId(a, b);
        }
        return dateB - dateA;
      }
      case 'boxId':
      default:
        return compareBoxId(a, b);
    }
  });

  return sorted;
}
