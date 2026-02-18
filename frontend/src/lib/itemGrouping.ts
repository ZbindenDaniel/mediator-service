import type { AgenticRunStatus, GroupedItemSummary, Item } from '../../../models';
import {
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_STATUSES,
  ItemEinheit,
  normalizeItemEinheit
} from '../../../models';
import { logError, logger } from '../utils/logger';

export interface GroupedItemDisplay {
  key: string;
  summary: GroupedItemSummary;
  items: Item[];
  representative: Item | null;
  totalStock: number;
  displayCount: number;
  isBulk: boolean;
  agenticStatusSummary: AgenticRunStatus;
}

type GroupItemsOptions = {
  logContext?: string;
};

// TODO(grouping-audit): Confirm null-quality grouping fallback rates after production import telemetry review.
// TODO(instance-1-grouping): Revisit ItemUUID parsing once prefix rules are finalized.
// TODO(agent): Revisit grouped quantity semantics if mixed Einheit payloads appear in a single grouping bucket.
// TODO(bulk-grouping): Validate bulk ItemUUID-based grouping once backend grouped payloads are aligned.
// TODO(bulk-quantity-display): Confirm bulk grouping keys and displayCount stay aligned with backend payload updates.
// TODO(non-canonical-representatives): Review aggregated representative logging once production volume increases.
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
    try {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch (error) {
      logError('[item-grouping] Failed to parse quality value', error, {
        value
      });
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
    try {
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        return String(parsed).padStart(4, '0');
      }
    } catch (error) {
      logError('[item-grouping] Failed to parse category segment', error, {
        value: trimmed
      });
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

// TODO(agent): Revisit shelf label normalization when shelf labels are editable via UI flows.
function resolveShelfLabel(item: Item): string | null {
  return normalizeString(item.ShelfLabel);
}

function resolveStock(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    try {
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      logger.warn?.('[item-grouping] Unable to parse stock quantity', {
        value: trimmed
      });
    } catch (error) {
      logError('[item-grouping] Failed to parse stock value', error, {
        value: trimmed
      });
    }
    return 0;
  }
  if (value !== null && value !== undefined) {
    logger.warn?.('[item-grouping] Unexpected stock value type', { value });
  }
  return 0;
}

function resolveEinheit(value: unknown, logContext: string, itemId: string | null): ItemEinheit | null {
  try {
    const normalized = normalizeItemEinheit(value);
    if (!normalized && value !== null && value !== undefined && value !== '') {
      logger.warn?.(`[${logContext}] Unable to normalize Einheit value`, {
        itemId,
        value
      });
    }
    return normalized;
  } catch (error) {
    logError(`[${logContext}] Failed to normalize Einheit`, error, {
      itemId,
      value
    });
    return null;
  }
}

function resolveInstanceSequence(itemUUID: string | null | undefined): number | null {
  if (typeof itemUUID !== 'string') {
    return null;
  }
  const match = itemUUID.match(/-(\d{4})$/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function isCanonicalInstance(itemUUID: string | null | undefined): boolean {
  return resolveInstanceSequence(itemUUID) === 1;
}

// TODO(agentic-status-grouping): Revisit aggregation ordering once agentic reviewer workflows expand.
const AGENTIC_STATUS_PRIORITY: AgenticRunStatus[] = [
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_NOT_STARTED
];

const AGENTIC_STATUS_PRIORITY_ORDER = new Map<AgenticRunStatus, number>(
  AGENTIC_STATUS_PRIORITY.map((status, index) => [status, index])
);

function resolveAgenticStatus(value: unknown): AgenticRunStatus {
  if (typeof value === 'string' && AGENTIC_RUN_STATUSES.includes(value as AgenticRunStatus)) {
    return value as AgenticRunStatus;
  }
  return AGENTIC_RUN_STATUS_NOT_STARTED;
}

function mergeAgenticStatusSummary(current: AgenticRunStatus, next: AgenticRunStatus): AgenticRunStatus {
  const currentRank = AGENTIC_STATUS_PRIORITY_ORDER.get(current) ?? Number.MAX_SAFE_INTEGER;
  const nextRank = AGENTIC_STATUS_PRIORITY_ORDER.get(next) ?? Number.MAX_SAFE_INTEGER;
  return nextRank < currentRank ? next : current;
}

function resolveItemQuantity(
  item: Item,
  logContext: string
): { quantity: number; isBulk: boolean; parsedAufLager: number } {
  const einheit = resolveEinheit(item.Einheit, logContext, item.ItemUUID ?? null);
  const isBulk = einheit === ItemEinheit.Menge;
  const parsedAufLager = resolveStock(item.Auf_Lager);
  if (!isBulk && parsedAufLager > 1) {
    logger.warn?.(`[${logContext}] Instance item has Auf_Lager > 1`, {
      itemId: item.ItemUUID ?? null,
      artikelNumber: item.Artikel_Nummer ?? null,
      einheit: einheit ?? null,
      aufLager: parsedAufLager
    });
  }
  return { quantity: isBulk ? parsedAufLager : 1, isBulk, parsedAufLager };
}

function resolveBulkGroupingToken(item: Item, logContext: string, index: number): string {
  try {
    const itemUUID = normalizeString(item.ItemUUID);
    if (itemUUID) {
      return itemUUID;
    }
    logger.warn?.(`[${logContext}] Bulk item missing ItemUUID for grouping`, {
      index,
      artikelNumber: item.Artikel_Nummer ?? null,
      boxId: item.BoxID ?? null,
      location: item.Location ?? null
    });
  } catch (error) {
    logError(`[${logContext}] Failed to normalize bulk grouping token`, error, {
      index,
      itemId: item.ItemUUID ?? null
    });
  }
  return `bulk-missing-${index}`;
}

export function groupItemsForDisplay(items: Item[], options: GroupItemsOptions = {}): GroupedItemDisplay[] {
  const grouped = new Map<string, GroupedItemDisplay>();
  const safeItems = Array.isArray(items) ? items : [];
  const logContext = options.logContext ?? 'item-grouping';
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

  try {
    for (const [index, item] of safeItems.entries()) {
      try {
        const artikelNumber = normalizeString(item.Artikel_Nummer);
        const quality = normalizeQuality(item.Quality);
        const { boxId, location } = resolveLocation(item);
        const shelfLabel = resolveShelfLabel(item);
        const category = resolveCategory(item);
        const quantityData = resolveItemQuantity(item, logContext);
        const bulkGroupingToken = quantityData.isBulk ? resolveBulkGroupingToken(item, logContext, index) : null;
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
        if (quantityData.isBulk) {
          if (!item.ItemUUID) {
            logger.warn?.(`[${logContext}] Bulk item missing ItemUUID; isolating grouping key`, {
              artikelNumber,
              boxId,
              location
            });
          }
          if (bulkGroupingToken) {
            keySegments.push(bulkGroupingToken);
          }
        }
        let key = keySegments.join('|');
        if (missingKeys && item.ItemUUID && !bulkGroupingToken) {
          key = `${key}|${item.ItemUUID}`;
        }

        const existing = grouped.get(key);
        const itemAgenticStatus = resolveAgenticStatus(item.AgenticStatus);
        const canonicalInstance = isCanonicalInstance(item.ItemUUID ?? null);
        if (existing) {
          existing.summary.count += 1;
          existing.items.push(item);
          existing.totalStock += quantityData.quantity;
          if (existing.isBulk !== quantityData.isBulk) {
            logger.warn?.(`[${logContext}] Mixed Einheit grouping detected`, {
              groupKey: key,
              itemId: item.ItemUUID ?? null,
              artikelNumber,
              existingIsBulk: existing.isBulk,
              nextIsBulk: quantityData.isBulk
            });
          }
          existing.displayCount = existing.isBulk ? existing.totalStock : existing.summary.count;
          existing.agenticStatusSummary = mergeAgenticStatusSummary(existing.agenticStatusSummary, itemAgenticStatus);
          if (item.ItemUUID && (canonicalInstance || !existing.summary.representativeItemId)) {
            existing.summary.representativeItemId = item.ItemUUID;
          }
          if (!existing.summary.ShelfLabel && shelfLabel) {
            existing.summary.ShelfLabel = shelfLabel;
          }
          if (canonicalInstance || !existing.representative) {
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
            ShelfLabel: shelfLabel ?? undefined,
            Category: category ?? undefined,
            count: 1,
            representativeItemId: item.ItemUUID ?? null
          },
          items: [item],
          representative: item,
          totalStock: quantityData.quantity,
          displayCount: quantityData.isBulk ? quantityData.quantity : 1,
          isBulk: quantityData.isBulk,
          agenticStatusSummary: itemAgenticStatus
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

  // TODO(item-grouping): Revisit batch warning thresholds if grouping input volumes grow.
  // if (missingKeyCount > 0) {
  //   logger.warn?.(`[${logContext}] Missing grouping keys detected in batch`, {
  //     missingKeyCount,
  //     missingArtikelCount,
  //     missingQualityCount,
  //     sampleItems: missingKeySamples
  //   });
  // }
  if (qualityFallbackCount > 0) {
    logger.info?.(`[${logContext}] Applied null-quality grouping fallback`, {
      qualityFallbackCount,
      sampleItems: qualityFallbackSamples
    });
  }
  if (unplacedCount > 0) {
    logger.info?.(`[${logContext}] Grouped unplaced items in batch`, {
      unplacedCount
    });
  }

  let nonCanonicalRepresentativeCount = 0;
  const nonCanonicalRepresentativeSamples: Array<{
    representativeItemId: string | null;
    artikelNumber: string | null;
    quality: number | null;
    boxId: string | null;
    location: string | null;
  }> = [];

  try {
    for (const group of grouped.values()) {
      if (group.summary.representativeItemId && !isCanonicalInstance(group.summary.representativeItemId)) {
        nonCanonicalRepresentativeCount += 1;
        if (nonCanonicalRepresentativeSamples.length < 5) {
          nonCanonicalRepresentativeSamples.push({
            representativeItemId: group.summary.representativeItemId,
            artikelNumber: group.summary.Artikel_Nummer ?? null,
            quality: group.summary.Quality ?? null,
            boxId: group.summary.BoxID ?? null,
            location: group.summary.Location ?? null
          });
        }
      }
    }
  } catch (error) {
    logError(`[${logContext}] Failed to aggregate non-canonical representatives`, error, {
      groupCount: grouped.size
    });
  }

  if (nonCanonicalRepresentativeCount > 0) {
    logger.info?.(`[${logContext}] Non-canonical representatives detected`, {
      nonCanonicalRepresentativeCount,
      sampleItems: nonCanonicalRepresentativeSamples
    });
  }

  return Array.from(grouped.values());
}
