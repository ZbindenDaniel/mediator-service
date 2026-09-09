import type { AgenticRunStatus } from 'models';
import { AGENTIC_RUN_DEFAULT_VISIBLE_STATUSES, AGENTIC_RUN_STATUSES, AGENTIC_STATUS_FILTER_NONE } from 'models';
import { normalizeQuality, QUALITY_LABELS, QUALITY_MIN } from 'models/quality';
import { describeAgenticStatus } from './agenticStatusLabels';

// TODO(ki-labels): Centralize KI terminology once a shared i18n layer is available.
import { logger as defaultLogger, logError } from '../utils/logger';

// TODO(item-entity-filter): Consider centralizing filter type constants for cross-view reuse once repository navigation shares state.
// TODO(entrydate-sort): Confirm localized labels for entry date sorting in active filter descriptions.
// TODO(filter-normalization): Extract shared filter parsing helpers so list pages stay aligned when new fields arrive.
// TODO(subcategory-filter): Confirm whether Unterkategorien_B should be matched alongside Unterkategorien_A.
export type ItemListSortKey =
  | 'artikelbeschreibung'
  | 'artikelnummer'
  | 'box'
  | 'entryDate'
  | 'lastSynced'
  | 'agenticLastRun'
  | 'uuid'
  | 'stock'
  | 'subcategory'
  | 'agenticStatus'
  | 'quality';

export type ItemListFilters = {
  searchTerm: string;
  subcategoryFilter: string;
  boxFilter: string;
  // Multi-select: the set of Ki-Status values to show. Empty = show none; all statuses = no filter.
  agenticStatusFilter: AgenticRunStatus[];
  shopPublicationFilter: 'all' | 'inShop' | 'notPublished' | 'noShopArticle';
  placementFilter: 'all' | 'unplaced' | 'placed';
  imageFilter: 'all' | 'noImages' | 'hasImages';
  sortKey: ItemListSortKey;
  sortDirection: 'asc' | 'desc';
  entityFilter: 'all' | 'instances' | 'references';
  qualityThreshold: number;
  qualityFilter: 'all' | 'rated' | 'missing';
  myMarksOnly: boolean;
};

export type ItemListFilterChangeDetail = {
  activeFilters: string[];
  hasOverrides: boolean;
  isDeepLinkFilterSession?: boolean;
};

export const ITEM_LIST_FILTERS_STORAGE_KEY = 'mediator-item-list-filters';
export const ITEM_LIST_FILTERS_CHANGED_EVENT = 'mediator:item-list-filters-changed';
export const ITEM_LIST_FILTERS_RESET_REQUESTED_EVENT = 'mediator:item-list-filters-reset';

const SORT_KEYS: ItemListSortKey[] = [
  'artikelbeschreibung',
  'artikelnummer',
  'box',
  'entryDate',
  'lastSynced',
  'agenticLastRun',
  'uuid',
  'stock',
  'subcategory',
  'agenticStatus',
  'quality'
];

const DEFAULT_FILTERS: ItemListFilters = {
  searchTerm: '',
  subcategoryFilter: '',
  boxFilter: '',
  agenticStatusFilter: [...AGENTIC_RUN_DEFAULT_VISIBLE_STATUSES],
  // TODO(shop-publication-filter): Revisit labels/states if ERP introduces additional publication combinations.
  shopPublicationFilter: 'all',
  // TODO(placement-filter): Revisit placement filter states if shelf-level placement state is introduced.
  placementFilter: 'all',
  imageFilter: 'all',
  sortKey: 'artikelbeschreibung',
  sortDirection: 'asc',
  entityFilter: 'instances',
  qualityThreshold: QUALITY_MIN,
  qualityFilter: 'all',
  myMarksOnly: false
};

export function getDefaultItemListFilters(): ItemListFilters {
  // Clone the array so callers can't mutate the shared default selection.
  return { ...DEFAULT_FILTERS, agenticStatusFilter: [...DEFAULT_FILTERS.agenticStatusFilter] };
}

// Compare two agentic-status selections as unordered sets.
export function sameAgenticStatusSelection(
  a: readonly AgenticRunStatus[],
  b: readonly AgenticRunStatus[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const other = new Set(b);
  return a.every((status) => other.has(status));
}

export function hasNonDefaultFilters(
  filters: ItemListFilters,
  defaults: ItemListFilters = DEFAULT_FILTERS
): boolean {
  return (
    filters.searchTerm !== defaults.searchTerm
    || filters.subcategoryFilter !== defaults.subcategoryFilter
    || filters.boxFilter !== defaults.boxFilter
    || !sameAgenticStatusSelection(filters.agenticStatusFilter, defaults.agenticStatusFilter)
    || filters.shopPublicationFilter !== defaults.shopPublicationFilter
    || filters.placementFilter !== defaults.placementFilter
    || filters.imageFilter !== defaults.imageFilter
    || filters.sortKey !== defaults.sortKey
    || filters.sortDirection !== defaults.sortDirection
    || filters.entityFilter !== defaults.entityFilter
    || filters.qualityThreshold !== defaults.qualityThreshold
    || filters.qualityFilter !== defaults.qualityFilter
    || filters.myMarksOnly !== defaults.myMarksOnly
  );
}

export function getActiveFilterDescriptions(
  filters: ItemListFilters,
  defaults: ItemListFilters = DEFAULT_FILTERS
): string[] {
  const active: string[] = [];
  if (filters.searchTerm.trim()) {
    active.push(`Suche: ${filters.searchTerm.trim()}`);
  }
  if (filters.subcategoryFilter.trim()) {
    active.push(`Unterkategorie: ${filters.subcategoryFilter.trim()}`);
  }
  if (filters.boxFilter.trim()) {
    active.push(`Behälter: ${filters.boxFilter.trim()}`);
  }
  if (!sameAgenticStatusSelection(filters.agenticStatusFilter, defaults.agenticStatusFilter)) {
    const statusLabel = filters.agenticStatusFilter.length === 0
      ? 'Keine'
      : filters.agenticStatusFilter.length === AGENTIC_RUN_STATUSES.length
        ? 'Alle'
        : filters.agenticStatusFilter.map(describeAgenticStatus).join(', ');
    active.push(`Ki: ${statusLabel}`);
  }
  if (filters.shopPublicationFilter !== defaults.shopPublicationFilter) {
    const filterLabels: Record<ItemListFilters['shopPublicationFilter'], string> = {
      all: 'Alle Shop-/Publikationsstatus',
      inShop: 'Im Shop',
      notPublished: 'Nicht veröffentlicht',
      noShopArticle: 'Kein Shopartikel'
    };
    active.push(`Shopstatus: ${filterLabels[filters.shopPublicationFilter]}`);
  }
  if (filters.qualityThreshold > defaults.qualityThreshold) {
    const label = QUALITY_LABELS[filters.qualityThreshold] ?? `mind. ${filters.qualityThreshold}`;
    active.push(`Qualität: ${label} oder besser`);
  }
  if (filters.qualityFilter !== defaults.qualityFilter) {
    const qualityFilterLabels: Record<ItemListFilters['qualityFilter'], string> = {
      all: 'Alle',
      rated: 'Mit Bewertung',
      missing: 'Ohne Bewertung',
    };
    active.push(`Qualität: ${qualityFilterLabels[filters.qualityFilter]}`);
  }
  if (filters.placementFilter !== defaults.placementFilter) {
    const placementLabels: Record<ItemListFilters['placementFilter'], string> = {
      all: 'Alle',
      unplaced: 'Unplatziert',
      placed: 'Platziert'
    };
    active.push(`Platzierung: ${placementLabels[filters.placementFilter]}`);
  }
  if (filters.imageFilter !== defaults.imageFilter) {
    const imageFilterLabels: Record<ItemListFilters['imageFilter'], string> = {
      all: 'Alle',
      noImages: 'Ohne Bilder',
      hasImages: 'Mit Bildern'
    };
    active.push(`Bilder: ${imageFilterLabels[filters.imageFilter]}`);
  }
  if (filters.entityFilter !== defaults.entityFilter) {
    const filterLabels: Record<ItemListFilters['entityFilter'], string> = {
      all: 'Alle Einträge',
      instances: 'Nur Instanzen',
      references: 'Nur Referenzen'
    };
    active.push(`Typ: ${filterLabels[filters.entityFilter]}`);
  }
  if (filters.myMarksOnly) {
    active.push('Meine Markierungen');
  }
  if (filters.sortKey !== defaults.sortKey || filters.sortDirection !== defaults.sortDirection) {
    active.push(
      `Sortierung: ${filters.sortKey} (${filters.sortDirection === 'asc' ? 'aufsteigend' : 'absteigend'})`
    );
  }
  return active;
}

export function buildItemListQueryParams(filters: ItemListFilters): URLSearchParams {
  const query = new URLSearchParams();
  try {
    if (filters.searchTerm.trim()) {
      query.set('search', filters.searchTerm.trim());
    }
    if (filters.subcategoryFilter.trim()) {
      query.set('subcategory', filters.subcategoryFilter.trim());
    }
    if (filters.boxFilter.trim()) {
      query.set('box', filters.boxFilter.trim());
    }
    // All statuses selected = no filter (omit param). Empty selection = match nothing
    // (explicit sentinel). Otherwise send one param per selected status.
    if (filters.agenticStatusFilter.length !== AGENTIC_RUN_STATUSES.length) {
      if (filters.agenticStatusFilter.length === 0) {
        query.set('agenticStatus', AGENTIC_STATUS_FILTER_NONE);
      } else {
        for (const status of filters.agenticStatusFilter) {
          query.append('agenticStatus', status);
        }
      }
    }
    if (filters.shopPublicationFilter !== 'all') {
      query.set('shopPublicationFilter', filters.shopPublicationFilter);
    }
    if (filters.placementFilter === 'unplaced') {
      query.set('showUnplaced', 'true');
    }
    if (filters.entityFilter !== 'all') {
      query.set('entityFilter', filters.entityFilter);
    }
    query.set('sortKey', filters.sortKey);
    query.set('sortDirection', filters.sortDirection);
    if (filters.qualityThreshold > QUALITY_MIN) {
      query.set('qualityAtLeast', filters.qualityThreshold.toString());
    }
    if (filters.qualityFilter !== 'all') {
      query.set('qualityFilter', filters.qualityFilter);
    }
  } catch (error) {
    logError('Failed to build item list query params', error, { filters });
  }
  return query;
}

export function loadItemListFilters(
  defaults: ItemListFilters = DEFAULT_FILTERS,
  logger: Pick<Console, 'info' | 'warn' | 'error'> = defaultLogger
): ItemListFilters | null {
  try {
    const raw = localStorage.getItem(ITEM_LIST_FILTERS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ItemListFilters>;
    if (!parsed || typeof parsed !== 'object') {
      logger.warn?.('Ignoring malformed stored item list filters: not an object');
      return null;
    }
    const merged: ItemListFilters = { ...defaults };

    if (typeof parsed.searchTerm === 'string') {
      merged.searchTerm = parsed.searchTerm;
    }

    if (typeof parsed.subcategoryFilter === 'string') {
      merged.subcategoryFilter = parsed.subcategoryFilter;
    } else if (parsed.subcategoryFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored subcategory filter', parsed.subcategoryFilter);
    }

    if (typeof parsed.boxFilter === 'string') {
      merged.boxFilter = parsed.boxFilter;
    }

    if (typeof parsed.qualityThreshold === 'number') {
      merged.qualityThreshold = normalizeQuality(parsed.qualityThreshold, logger) ?? QUALITY_MIN;
    }

    if (parsed.qualityFilter === 'all' || parsed.qualityFilter === 'rated' || parsed.qualityFilter === 'missing') {
      merged.qualityFilter = parsed.qualityFilter;
    } else if ((parsed as Record<string, unknown>).qualityFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored quality filter', (parsed as Record<string, unknown>).qualityFilter);
    }

    const rawAgenticStatus = (parsed as Record<string, unknown>).agenticStatusFilter;
    if (Array.isArray(rawAgenticStatus)) {
      const valid = rawAgenticStatus.filter(
        (status): status is AgenticRunStatus =>
          typeof status === 'string' && AGENTIC_RUN_STATUSES.includes(status as AgenticRunStatus)
      );
      merged.agenticStatusFilter = Array.from(new Set(valid));
    } else if (rawAgenticStatus === 'any') {
      // Migrate legacy single-value 'any' → all statuses selected (no filter).
      merged.agenticStatusFilter = [...AGENTIC_RUN_STATUSES];
    } else if (typeof rawAgenticStatus === 'string' && AGENTIC_RUN_STATUSES.includes(rawAgenticStatus as AgenticRunStatus)) {
      // Migrate legacy single-status string → single-item selection.
      merged.agenticStatusFilter = [rawAgenticStatus as AgenticRunStatus];
    } else if (rawAgenticStatus !== undefined) {
      logger.warn?.('Ignoring invalid stored agentic status filter', rawAgenticStatus);
    }

    if (
      parsed.shopPublicationFilter === 'all'
      || parsed.shopPublicationFilter === 'inShop'
      || parsed.shopPublicationFilter === 'notPublished'
      || parsed.shopPublicationFilter === 'noShopArticle'
    ) {
      merged.shopPublicationFilter = parsed.shopPublicationFilter;
    } else if (parsed.shopPublicationFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored shop publication filter', parsed.shopPublicationFilter);
    }

    if (parsed.placementFilter === 'all' || parsed.placementFilter === 'unplaced' || parsed.placementFilter === 'placed') {
      merged.placementFilter = parsed.placementFilter;
    } else if (typeof (parsed as { showUnplaced?: unknown }).showUnplaced === 'boolean') {
      merged.placementFilter = (parsed as { showUnplaced?: boolean }).showUnplaced ? 'unplaced' : 'all';
      logger.info?.('Migrated legacy showUnplaced boolean filter to placementFilter', {
        showUnplaced: (parsed as { showUnplaced?: boolean }).showUnplaced
      });
    } else if (parsed.placementFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored placement filter', parsed.placementFilter);
    }

    if (parsed.imageFilter === 'all' || parsed.imageFilter === 'noImages' || parsed.imageFilter === 'hasImages') {
      merged.imageFilter = parsed.imageFilter;
    } else if (parsed.imageFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored image filter', parsed.imageFilter);
    }

    if (typeof parsed.sortKey === 'string' && SORT_KEYS.includes(parsed.sortKey as ItemListSortKey)) {
      merged.sortKey = parsed.sortKey as ItemListSortKey;
    } else if (parsed.sortKey !== undefined) {
      logger.warn?.('Ignoring invalid stored sort key', parsed.sortKey);
    }

    if (parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc') {
      merged.sortDirection = parsed.sortDirection;
    } else if (parsed.sortDirection !== undefined) {
      logger.warn?.('Ignoring invalid stored sort direction', parsed.sortDirection);
    }

    if (
      parsed.entityFilter === 'all'
      || parsed.entityFilter === 'instances'
      || parsed.entityFilter === 'references'
    ) {
      merged.entityFilter = parsed.entityFilter;
    } else if (parsed.entityFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored entity filter', parsed.entityFilter);
    }

    if (typeof parsed.myMarksOnly === 'boolean') {
      merged.myMarksOnly = parsed.myMarksOnly;
    }

    return merged;
  } catch (err) {
    logError('Failed to load stored item list filters', err);
    return null;
  }
}

export function persistItemListFilters(
  filters: ItemListFilters,
  logger: Pick<Console, 'warn' | 'error'> = defaultLogger
): void {
  try {
    localStorage.setItem(ITEM_LIST_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch (err) {
    try {
      logger.error?.('Failed to persist item list filters', err);
    } catch (logFailure) {
      logError('Failed to persist item list filters', err, { logFailure });
    }
  }
}

export function clearItemListFilters(logger: Pick<Console, 'warn' | 'error'> = defaultLogger): void {
  try {
    localStorage.removeItem(ITEM_LIST_FILTERS_STORAGE_KEY);
  } catch (err) {
    try {
      logger.error?.('Failed to clear stored item list filters', err);
    } catch (logFailure) {
      logError('Failed to clear stored item list filters', err, { logFailure });
    }
  }
}
