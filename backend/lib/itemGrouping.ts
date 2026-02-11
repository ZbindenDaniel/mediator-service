import { parseSequentialItemUUID } from './itemIds';

export type GroupedItemSummary = {
  Artikel_Nummer: string | null;
  Quality: number | null;
  BoxID: string | null;
  Location: string | null;
  Category?: string | null;
  count: number;
  representativeItemId: string | null;
};

type GroupableItem = {
  ItemUUID?: string | null;
  Artikel_Nummer?: string | null;
  Quality?: number | null;
  BoxID?: string | null;
  Location?: string | null;
  Unterkategorien_A?: number | string | null;
  Unterkategorien_B?: number | string | null;
};

// TODO(grouping-audit): Confirm null-quality grouping fallback rates after production import telemetry review.
// TODO(instance-1-grouping): Revisit ItemUUID parsing rules if the prefix format changes again.
type GroupItemsOptions = {
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
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

function resolveCategory(item: GroupableItem): string | null {
  return normalizeCategorySegment(item.Unterkategorien_A) ?? normalizeCategorySegment(item.Unterkategorien_B);
}

function resolveLocation(item: GroupableItem): { boxId: string | null; location: string | null } {
  const boxId = normalizeString(item.BoxID);
  if (boxId) {
    return { boxId, location: null };
  }
  return { boxId: null, location: normalizeString(item.Location) };
}

function isCanonicalInstance(itemUUID: string | null | undefined): boolean {
  if (!itemUUID) {
    return false;
  }
  const parsed = parseSequentialItemUUID(itemUUID, null);
  return parsed?.sequence === 1;
}

export function groupItemsForResponse(
  items: GroupableItem[],
  options: GroupItemsOptions = {}
): GroupedItemSummary[] {
  const logger = options.logger ?? console;
  const grouped = new Map<string, GroupedItemSummary>();
  let missingKeyCount = 0;
  let missingArtikelCount = 0;
  let missingQualityCount = 0;
  let unplacedCount = 0;
  let qualityFallbackCount = 0;
  const missingKeySamples: Array<{
    itemId: string | null;
    artikelNumber: string | null;
    quality: number | null;
  }> = [];
  const qualityFallbackSamples: Array<{
    itemId: string | null;
    artikelNumber: string | null;
    boxId: string | null;
    location: string | null;
  }> = [];

  for (const item of items) {
    try {
      const artikelNumber = normalizeString(item.Artikel_Nummer);
      const quality = normalizeQuality(item.Quality);
      const { boxId, location } = resolveLocation(item);
      const category = resolveCategory(item);
      const isUnplaced = !boxId && !location;
      const missingArtikel = !artikelNumber;
      const missingQuality = quality === null;
      const missingCoreKeys = missingArtikel || missingQuality;
      const shouldFallbackQualityGrouping = !missingArtikel && missingQuality;
      const missingKeys = missingArtikel;
      if (isUnplaced) {
        unplacedCount += 1;
      }
      if (missingCoreKeys) {
        missingKeyCount += 1;
        if (missingKeySamples.length < 5) {
          missingKeySamples.push({
            itemId: item.ItemUUID ?? null,
            artikelNumber,
            quality
          });
        }
      }
      if (missingArtikel) {
        missingArtikelCount += 1;
      }
      if (missingQuality) {
        missingQualityCount += 1;
      }
      if (shouldFallbackQualityGrouping) {
        qualityFallbackCount += 1;
        if (qualityFallbackSamples.length < 5) {
          qualityFallbackSamples.push({
            itemId: item.ItemUUID ?? null,
            artikelNumber,
            boxId,
            location
          });
        }
      }

      const keySegments = [artikelNumber ?? 'unknown-artikel'];
      if (quality !== null) {
        keySegments.push(String(quality));
      } else if (missingArtikel) {
        keySegments.push('unknown-quality');
      }
      keySegments.push(boxId ?? location ?? 'unplaced');
      if (category) {
        keySegments.push(category);
      }
      let key = keySegments.join('|');
      if (missingKeys && item.ItemUUID) {
        key = `${key}|${item.ItemUUID}`;
      }

      const existing = grouped.get(key);
      const isCanonical = isCanonicalInstance(item.ItemUUID ?? null);
      if (existing) {
        existing.count += 1;
        if (item.ItemUUID && (isCanonical || !existing.representativeItemId)) {
          existing.representativeItemId = item.ItemUUID;
        }
        continue;
      }

      grouped.set(key, {
        Artikel_Nummer: artikelNumber,
        Quality: quality,
        BoxID: boxId,
        Location: location,
        Category: category ?? undefined,
        count: 1,
        representativeItemId: item.ItemUUID ?? null
      });
    } catch (error) {
      logger.warn?.('[item-grouping] Failed to group item', {
        itemId: item.ItemUUID ?? null,
        error
      });
    }
  }

  // TODO(item-grouping): Revisit batch warning thresholds if grouping input volumes grow.
  if (missingKeyCount > 0) {
    logger.warn?.('[item-grouping] Missing grouping keys detected in batch', {
      missingKeyCount,
      missingArtikelCount,
      missingQualityCount,
      sampleItems: missingKeySamples
    });
  }
  if (qualityFallbackCount > 0) {
    logger.info?.('[item-grouping] Applied null-quality grouping fallback', {
      qualityFallbackCount,
      sampleItems: qualityFallbackSamples
    });
  }
  if (unplacedCount > 0) {
    logger.info?.('[item-grouping] Grouped unplaced items in batch', {
      unplacedCount
    });
  }

  return Array.from(grouped.values());
}
