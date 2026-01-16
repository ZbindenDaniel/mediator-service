import type { GroupedItemSummary, Item } from '../../../models';
import { logError, logger } from '../utils/logger';

export interface GroupedItemDisplay {
  key: string;
  summary: GroupedItemSummary;
  items: Item[];
  representative: Item | null;
  totalStock: number;
}

type GroupItemsOptions = {
  logContext?: string;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeQuality(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeCategorySegment(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value)).padStart(4, '0');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(parsed)) {
      return String(parsed).padStart(4, '0');
    }
  }
  return null;
}

function resolveCategory(item: Item): string | null {
  return normalizeCategorySegment(item.Unterkategorien_A) ?? normalizeCategorySegment(item.Unterkategorien_B);
}

function resolveLocation(item: Item): { boxId: string | null; location: string | null } {
  const boxId = normalizeString(item.BoxID);
  if (boxId) {
    return { boxId, location: null };
  }
  return { boxId: null, location: normalizeString(item.Location) };
}

function resolveStock(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function groupItemsForDisplay(items: Item[], options: GroupItemsOptions = {}): GroupedItemDisplay[] {
  const grouped = new Map<string, GroupedItemDisplay>();
  const safeItems = Array.isArray(items) ? items : [];
  const logContext = options.logContext ?? 'item-grouping';

  try {
    for (const item of safeItems) {
      try {
        const artikelNumber = normalizeString(item.Artikel_Nummer);
        const quality = normalizeQuality(item.Quality);
        const { boxId, location } = resolveLocation(item);
        const category = resolveCategory(item);
        const missingKeys = !artikelNumber || quality === null || (!boxId && !location);

        if (missingKeys) {
          logger.warn?.(`[${logContext}] Missing grouping keys for item`, {
            itemId: item.ItemUUID ?? null,
            artikelNumber,
            quality,
            boxId,
            location,
            category
          });
        }

        const keySegments = [
          artikelNumber ?? 'unknown-artikel',
          quality !== null ? String(quality) : 'unknown-quality',
          boxId ?? location ?? 'unknown-location'
        ];
        if (category) {
          keySegments.push(category);
        }
        let key = keySegments.join('|');
        if (missingKeys && item.ItemUUID) {
          key = `${key}|${item.ItemUUID}`;
        }

        const existing = grouped.get(key);
        if (existing) {
          existing.summary.count += 1;
          existing.items.push(item);
          existing.totalStock += resolveStock(item.Auf_Lager);
          if (!existing.summary.representativeItemId && item.ItemUUID) {
            existing.summary.representativeItemId = item.ItemUUID;
          }
          if (!existing.representative) {
            existing.representative = item;
          }
          continue;
        }

        grouped.set(key, {
          key,
          summary: {
            Artikel_Nummer: artikelNumber,
            Quality: quality,
            BoxID: boxId,
            Location: location,
            Category: category ?? undefined,
            count: 1,
            representativeItemId: item.ItemUUID ?? null
          },
          items: [item],
          representative: item,
          totalStock: resolveStock(item.Auf_Lager)
        });
      } catch (error) {
        logError(`[${logContext}] Failed to group item`, error, {
          itemId: item?.ItemUUID ?? null
        });
      }
    }
  } catch (error) {
    logError(`[${logContext}] Failed to build grouped items`, error, {
      itemCount: safeItems.length
    });
    return [];
  }

  return Array.from(grouped.values());
}
