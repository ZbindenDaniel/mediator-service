import type { AgenticRunStatus } from 'models';
import { AGENTIC_RUN_STATUSES } from 'models';
import { normalizeQuality, QUALITY_LABELS, QUALITY_MIN } from 'models/quality';
import { describeAgenticStatus } from './agenticStatusLabels';
import { logger as defaultLogger, logError } from '../utils/logger';

// TODO(item-entity-filter): Consider centralizing filter type constants for cross-view reuse once repository navigation shares state.
// TODO(filter-normalization): Extract shared filter parsing helpers so list pages stay aligned when new fields arrive.
// TODO(subcategory-filter): Confirm whether Unterkategorien_B should be matched alongside Unterkategorien_A.
export type ItemListSortKey =
  | 'artikelbeschreibung'
  | 'artikelnummer'
  | 'box'
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
  showUnplaced: boolean;
  sortKey: ItemListSortKey;
  sortDirection: 'asc' | 'desc';
  entityFilter: 'all' | 'instances' | 'references';
  qualityThreshold: number;
};

export type ItemListFilterChangeDetail = {
  activeFilters: string[];
  hasOverrides: boolean;
};

export const ITEM_LIST_FILTERS_STORAGE_KEY = 'mediator-item-list-filters';
export const ITEM_LIST_FILTERS_CHANGED_EVENT = 'mediator:item-list-filters-changed';
export const ITEM_LIST_FILTERS_RESET_REQUESTED_EVENT = 'mediator:item-list-filters-reset';

const SORT_KEYS: ItemListSortKey[] = [
  'artikelbeschreibung',
  'artikelnummer',
  'box',
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
  showUnplaced: false,
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
    || filters.showUnplaced !== defaults.showUnplaced
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
      ? 'Alle Agentic-Status'
      : describeAgenticStatus(filters.agenticStatusFilter);
    active.push(`Ki: ${statusLabel}`);
  }
  if (filters.qualityThreshold > defaults.qualityThreshold) {
    const label = QUALITY_LABELS[filters.qualityThreshold] ?? `mind. ${filters.qualityThreshold}`;
    active.push(`Qualität: ${label} oder besser`);
  }
  if (filters.showUnplaced !== defaults.showUnplaced) {
    active.push('Nur unplatzierte Artikel');
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
    if (filters.showUnplaced) {
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
  logger: Pick<Console, 'warn' | 'error'> = defaultLogger
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
      merged.qualityThreshold = normalizeQuality(parsed.qualityThreshold, logger);
    }

    if (parsed.agenticStatusFilter === 'any' || AGENTIC_RUN_STATUSES.includes(parsed.agenticStatusFilter as AgenticRunStatus)) {
      merged.agenticStatusFilter = parsed.agenticStatusFilter as ItemListFilters['agenticStatusFilter'];
    } else if (parsed.agenticStatusFilter !== undefined) {
      logger.warn?.('Ignoring invalid stored agentic status filter', parsed.agenticStatusFilter);
    }

    if (typeof parsed.showUnplaced === 'boolean') {
      merged.showUnplaced = parsed.showUnplaced;
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
