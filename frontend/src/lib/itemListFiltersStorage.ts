import type { AgenticRunStatus } from 'models';
import { AGENTIC_RUN_STATUSES } from 'models';
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
  | 'uuid'
  | 'stock'
  | 'subcategory'
  | 'agenticStatus'
  | 'quality';

export type ItemListFilters = {
  searchTerm: string;
  subcategoryFilter: string;
  boxFilter: string;
  agenticStatusFilter: AgenticRunStatus | 'any';
  shopPublicationFilter: 'all' | 'inShop' | 'notPublished' | 'noShopArticle';
  placementFilter: 'all' | 'unplaced' | 'placed';
  sortKey: ItemListSortKey;
  sortDirection: 'asc' | 'desc';
  entityFilter: 'all' | 'instances' | 'references';
  qualityThreshold: number;
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
  agenticStatusFilter: 'any',
  // TODO(shop-publication-filter): Revisit labels/states if ERP introduces additional publication combinations.
  shopPublicationFilter: 'all',
  // TODO(placement-filter): Revisit placement filter states if shelf-level placement state is introduced.
  placementFilter: 'all',
  sortKey: 'artikelbeschreibung',
  sortDirection: 'asc',
  entityFilter: 'instances',
  qualityThreshold: QUALITY_MIN
};

export function getDefaultItemListFilters(): ItemListFilters {
  return { ...DEFAULT_FILTERS };
}

export function hasNonDefaultFilters(
  filters: ItemListFilters,
  defaults: ItemListFilters = DEFAULT_FILTERS
): boolean {
  return (
    filters.searchTerm !== defaults.searchTerm
    || filters.subcategoryFilter !== defaults.subcategoryFilter
    || filters.boxFilter !== defaults.boxFilter
    || filters.agenticStatusFilter !== defaults.agenticStatusFilter
    || filters.shopPublicationFilter !== defaults.shopPublicationFilter
    || filters.placementFilter !== defaults.placementFilter
    || filters.sortKey !== defaults.sortKey
    || filters.sortDirection !== defaults.sortDirection
    || filters.entityFilter !== defaults.entityFilter
    || filters.qualityThreshold !== defaults.qualityThreshold
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
  if (filters.agenticStatusFilter !== defaults.agenticStatusFilter) {
    const statusLabel = filters.agenticStatusFilter === 'any'
      ? 'Alle Ki-Status'
      : describeAgenticStatus(filters.agenticStatusFilter);
    active.push(`Ki: ${statusLabel}`);
  }
  if (filters.shopPublicationFilter !== defaults.shopPublicationFilter) {
    const filterLabels: Record<ItemListFilters['shopPublicationFilter'], string> = {
      all: 'Alle Shop-/Publikationsstatus',
      inShop: 'Im Shop (1/1)',
      notPublished: 'Nicht veröffentlicht (1/0)',
      noShopArticle: 'Kein Shopartikel (0/X)'
    };
    active.push(`Shopstatus: ${filterLabels[filters.shopPublicationFilter]}`);
  }
  if (filters.qualityThreshold > defaults.qualityThreshold) {
    const label = QUALITY_LABELS[filters.qualityThreshold] ?? `mind. ${filters.qualityThreshold}`;
    active.push(`Qualität: ${label} oder besser`);
  }
  if (filters.placementFilter !== defaults.placementFilter) {
    const placementLabels: Record<ItemListFilters['placementFilter'], string> = {
      all: 'Alle',
      unplaced: 'Unplatziert',
      placed: 'Platziert'
    };
    active.push(`Platzierung: ${placementLabels[filters.placementFilter]}`);
  }
  if (filters.entityFilter !== defaults.entityFilter) {
    const filterLabels: Record<ItemListFilters['entityFilter'], string> = {
      all: 'Alle Einträge',
      instances: 'Nur Instanzen',
      references: 'Nur Referenzen'
    };
    active.push(`Typ: ${filterLabels[filters.entityFilter]}`);
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
    if (filters.agenticStatusFilter !== 'any') {
      query.set('agenticStatus', filters.agenticStatusFilter);
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

    if (parsed.agenticStatusFilter === 'any' || AGENTIC_RUN_STATUSES.includes(parsed.agenticStatusFilter as AgenticRunStatus)) {
      merged.agenticStatusFilter = parsed.agenticStatusFilter as ItemListFilters['agenticStatusFilter'];
    } else if (parsed.agenticStatusFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored agentic status filter', parsed.agenticStatusFilter);
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
