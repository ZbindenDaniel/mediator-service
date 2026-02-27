import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoContainer, GoSearch } from 'react-icons/go';
import type { AgenticRunStatus, Item } from '../../../models';
import {
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUSES
} from '../../../models';
import { describeQuality, normalizeQuality, QUALITY_LABELS, QUALITY_MIN } from '../../../models/quality';
import { itemCategories } from '../data/itemCategories';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';
import {
  clearItemListFilters,
  buildItemListQueryParams,
  getActiveFilterDescriptions,
  getDefaultItemListFilters,
  hasNonDefaultFilters,
  ITEM_LIST_FILTERS_CHANGED_EVENT,
  ITEM_LIST_FILTERS_RESET_REQUESTED_EVENT,
  ItemListFilterChangeDetail,
  ItemListFilters,
  ItemListSortKey,
  loadItemListFilters,
  persistItemListFilters
} from '../lib/itemListFiltersStorage';
import { groupItemsForDisplay, GroupedItemDisplay } from '../lib/itemGrouping';
import { logError, logger } from '../utils/logger';
import BulkItemActionBar from './BulkItemActionBar';
import ItemList from './ItemList';
import LoadingPage from './LoadingPage';

// TODO(agentic): Extend item list page sorting and filtering controls for enriched inventory views.
// TODO(agentic-status-ui): Replace single-select status filtering with quick filters once reviewer workflows expand.
// TODO(storage-sync): Persist list filters to localStorage so returning users keep their preferences across sessions.
// TODO(item-entity-filter): Confirm UX for reference-only rows when enriching the item repository view.
// TODO(subcategory-filter): Confirm whether Unterkategorien_B should be matched alongside Unterkategorien_A.
// TODO(subcategory-input): Validate the subcategory filter options against updated taxonomy definitions.
// TODO(subcategory-input-logging): Confirm datalist input logging after feedback from warehouse users.
// TODO(grouped-item-list): Confirm grouping keys and filter behavior once backend grouped payloads are live.
// TODO(entrydate-sort): Confirm entry date ordering expectations for the list view.
// TODO(placement-filter-ui): Validate whether placement filter should expose shelf-level placement states in future.
// TODO(filter-order-ui): Keep quality slider rendered after categorical filters unless UX feedback changes.

const ITEM_LIST_DEFAULT_FILTERS = getDefaultItemListFilters();
const resolveItemQuality = (value: unknown) => normalizeQuality(value, console) ?? QUALITY_MIN;
const resolveEntryTimestamp = (
  value: unknown,
  context: { field: string; itemId: string | null }
): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    const parsed = Date.parse(String(value));
    if (Number.isNaN(parsed)) {
      logger.warn?.('Invalid item date for entry sort', {
        field: context.field,
        value,
        itemId: context.itemId
      });
      return null;
    }
    return parsed;
  } catch (error) {
    logError('Failed to parse item entry date for sorting', error, {
      field: context.field,
      value,
      itemId: context.itemId
    });
    return null;
  }
};

export interface ItemListComputationOptions {
  items: Item[];
  placementFilter: ItemListFilters['placementFilter'];
  normalizedSearch: string;
  normalizedSubcategoryFilter: string;
  normalizedBoxFilter: string;
  stockFilter: 'any' | 'instock' | 'outofstock';
  normalizedAgenticFilter: AgenticRunStatus | null;
  shopPublicationFilter: ItemListFilters['shopPublicationFilter'];
  sortKey: ItemListSortKey;
  sortDirection: 'asc' | 'desc';
  qualityThreshold: number;
}

function resolveBinaryFlag(value: unknown, context: { field: 'Shopartikel' | 'Veröffentlicht_Status'; itemId: string | null }): 0 | 1 | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  try {
    if (typeof value === 'number') {
      return value === 1 ? 1 : value === 0 ? 0 : null;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
        return 1;
      }
      if (normalized === '0' || normalized === 'false' || normalized === 'no') {
        return 0;
      }
    }
    logger.warn?.('Item list filter received unexpected binary flag value', {
      field: context.field,
      value,
      itemId: context.itemId
    });
    return null;
  } catch (error) {
    logError('Failed to normalize shop/publication flag for item list filtering', error, {
      field: context.field,
      value,
      itemId: context.itemId
    });
    return null;
  }
}

function matchesShopPublicationFilter(
  group: GroupedItemDisplay,
  filter: ItemListFilters['shopPublicationFilter']
): boolean {
  if (filter === 'all') {
    return true;
  }
  const representative = group.representative;
  const itemId = group.summary.representativeItemId ?? representative?.ItemUUID ?? null;
  const shopartikelFlag = resolveBinaryFlag(representative?.Shopartikel, {
    field: 'Shopartikel',
    itemId
  });
  const publicationFlag = resolveBinaryFlag(representative?.Veröffentlicht_Status, {
    field: 'Veröffentlicht_Status',
    itemId
  });

  if (filter === 'inShop') {
    return shopartikelFlag === 1 && publicationFlag === 1;
  }
  if (filter === 'notPublished') {
    return shopartikelFlag === 1 && publicationFlag === 0;
  }
  return shopartikelFlag === 0;
}

interface SubcategoryOption {
  value: string;
  label: string;
  categoryLabel: string;
}

export function filterAndSortItems(options: ItemListComputationOptions): GroupedItemDisplay[] {
  const {
    items,
    placementFilter,
    normalizedSearch,
    normalizedSubcategoryFilter,
    normalizedBoxFilter,
    stockFilter,
    normalizedAgenticFilter,
    shopPublicationFilter,
    sortKey,
    sortDirection,
    qualityThreshold
  } = options;

  const baseItems = placementFilter === 'unplaced'
    ? items.filter((it) => !it.BoxID)
    : placementFilter === 'placed'
      ? items.filter((it) => Boolean(it.BoxID))
      : items;
  const groupedItems = groupItemsForDisplay(baseItems, { logContext: 'item-list-grouping' });
  const searched = groupedItems.filter((group) => {
    const representative = group.representative;
    const description = representative?.Artikelbeschreibung?.toLowerCase() ?? '';
    const number = group.summary.Artikel_Nummer?.toLowerCase()
      ?? representative?.Artikel_Nummer?.toLowerCase()
      ?? '';
    const matchesSearch = normalizedSearch
      ? description.includes(normalizedSearch) || number.includes(normalizedSearch)
      : true;
    const groupCategory = group.summary.Category
      ?? (typeof representative?.Unterkategorien_A === 'number'
        ? String(representative.Unterkategorien_A).padStart(4, '0')
        : typeof representative?.Unterkategorien_A === 'string'
          ? representative.Unterkategorien_A
          : null)
      ?? '';
    const matchesSubcategory = normalizedSubcategoryFilter
      ? groupCategory.toLowerCase().includes(normalizedSubcategoryFilter)
      : true;
    const boxCandidate = group.summary.BoxID ?? group.summary.Location ?? representative?.BoxID ?? representative?.Location ?? '';
    const matchesBox = normalizedBoxFilter
      ? boxCandidate.toLowerCase().includes(normalizedBoxFilter)
      : true;
    const stockValue = group.totalStock;
    const matchesStock =
      stockFilter === 'instock'
        ? stockValue > 0
        : stockFilter === 'outofstock'
          ? stockValue <= 0
          : true;
    const agenticStatus = group.agenticStatusSummary ?? AGENTIC_RUN_STATUS_NOT_STARTED;
    const matchesAgenticStatus = normalizedAgenticFilter
      ? agenticStatus === normalizedAgenticFilter
      : true;
    const matchesShopPublication = matchesShopPublicationFilter(group, shopPublicationFilter);
    const groupQuality = group.summary.Quality ?? representative?.Quality;
    const matchesQuality = resolveItemQuality(groupQuality) >= qualityThreshold;

    return matchesSearch
      && matchesSubcategory
      && matchesBox
      && matchesStock
      && matchesAgenticStatus
      && matchesShopPublication
      && matchesQuality;
  });

  const sorted = [...searched].sort((a, b) => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    if (sortKey === 'stock') {
      const aStock = Number.isFinite(a.totalStock) ? a.totalStock : -Infinity;
      const bStock = Number.isFinite(b.totalStock) ? b.totalStock : -Infinity;
      if (aStock === bStock) {
        return (a.summary.representativeItemId ?? '').localeCompare(b.summary.representativeItemId ?? '') * direction;
      }
      return (aStock - bStock) * direction;
    }

    if (sortKey === 'agenticStatus') {
      const statusOrder = (status: AgenticRunStatus | null | undefined) => {
        const resolved = status ?? AGENTIC_RUN_STATUS_NOT_STARTED;
        const idx = AGENTIC_RUN_STATUSES.indexOf(resolved);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      };
      const aStatusOrder = statusOrder(a.agenticStatusSummary);
      const bStatusOrder = statusOrder(b.agenticStatusSummary);
      if (aStatusOrder === bStatusOrder) {
        return (a.summary.representativeItemId ?? '').localeCompare(b.summary.representativeItemId ?? '') * direction;
      }
      return (aStatusOrder - bStatusOrder) * direction;
    }

    if (sortKey === 'quality') {
      const aQuality = resolveItemQuality(a.summary.Quality ?? a.representative?.Quality);
      const bQuality = resolveItemQuality(b.summary.Quality ?? b.representative?.Quality);
      if (aQuality === bQuality) {
        return (a.summary.representativeItemId ?? '').localeCompare(b.summary.representativeItemId ?? '') * direction;
      }
      return (aQuality - bQuality) * direction;
    }

    if (sortKey === 'entryDate') {
      const entryTimestampFor = (group: GroupedItemDisplay) => {
        const representative = group.representative;
        const itemId = group.summary.representativeItemId ?? representative?.ItemUUID ?? null;
        const primary = resolveEntryTimestamp(representative?.Datum_erfasst, {
          field: 'Datum_erfasst',
          itemId
        });
        if (primary !== null) {
          return primary;
        }
        return resolveEntryTimestamp(representative?.UpdatedAt ?? '', {
          field: 'UpdatedAt',
          itemId
        });
      };
      const aEntry = entryTimestampFor(a);
      const bEntry = entryTimestampFor(b);
      if (aEntry === bEntry) {
        return (a.summary.representativeItemId ?? '').localeCompare(b.summary.representativeItemId ?? '') * direction;
      }
      const aValue = aEntry ?? Number.NEGATIVE_INFINITY;
      const bValue = bEntry ?? Number.NEGATIVE_INFINITY;
      return (aValue - bValue) * direction;
    }

    const valueFor = (group: GroupedItemDisplay) => {
      switch (sortKey) {
        case 'artikelnummer':
          return group.summary.Artikel_Nummer?.trim().toLowerCase()
            ?? group.representative?.Artikel_Nummer?.trim().toLowerCase()
            ?? '';
        case 'box':
          return group.summary.BoxID?.trim().toLowerCase()
            ?? group.summary.Location?.trim().toLowerCase()
            ?? group.representative?.BoxID?.trim().toLowerCase()
            ?? group.representative?.Location?.trim().toLowerCase()
            ?? '';
        case 'uuid':
          return group.summary.representativeItemId?.trim().toLowerCase() ?? '';
        case 'subcategory':
          return group.summary.Category?.toLowerCase()
            ?? group.representative?.Unterkategorien_A?.toString().toLowerCase()
            ?? '';
        case 'artikelbeschreibung':
        default:
          return group.representative?.Artikelbeschreibung?.trim().toLowerCase() ?? '';
      }
    };
    const aVal = valueFor(a);
    const bVal = valueFor(b);
    if (aVal === bVal) {
      return (a.summary.representativeItemId ?? '').localeCompare(b.summary.representativeItemId ?? '') * direction;
    }
    return aVal.localeCompare(bVal) * direction;
  });

  return sorted;
}

export default function ItemListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [placementFilter, setPlacementFilter] = useState<ItemListFilters['placementFilter']>(ITEM_LIST_DEFAULT_FILTERS.placementFilter);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // TODO(item-list-search): Stage search input until we explicitly commit the filter on Enter.
  const [searchTerm, setSearchTerm] = useState(ITEM_LIST_DEFAULT_FILTERS.searchTerm);
  const [searchInput, setSearchInput] = useState(ITEM_LIST_DEFAULT_FILTERS.searchTerm);
  const [sortKey, setSortKey] = useState<ItemListSortKey>(ITEM_LIST_DEFAULT_FILTERS.sortKey);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(ITEM_LIST_DEFAULT_FILTERS.sortDirection);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // TODO(subcategory-input-staging): Confirm whether we should surface an explicit apply button next to the input.
  const [subcategoryFilter, setSubcategoryFilter] = useState(ITEM_LIST_DEFAULT_FILTERS.subcategoryFilter);
  const [subcategoryInput, setSubcategoryInput] = useState(ITEM_LIST_DEFAULT_FILTERS.subcategoryFilter);
  const [stockFilter, setStockFilter] = useState<'any' | 'instock' | 'outofstock'>('any');
  const [boxFilter, setBoxFilter] = useState(ITEM_LIST_DEFAULT_FILTERS.boxFilter);
  const [agenticStatusFilter, setAgenticStatusFilter] = useState<'any' | AgenticRunStatus>(ITEM_LIST_DEFAULT_FILTERS.agenticStatusFilter);
  // TODO(shop-publication-filter-ui): Consider replacing dropdown with segmented quick filter if additional states are introduced.
  const [shopPublicationFilter, setShopPublicationFilter] = useState<ItemListFilters['shopPublicationFilter']>(ITEM_LIST_DEFAULT_FILTERS.shopPublicationFilter);
  const [entityFilter, setEntityFilter] = useState<ItemListFilters['entityFilter']>(ITEM_LIST_DEFAULT_FILTERS.entityFilter);
  const [qualityThreshold, setQualityThreshold] = useState(ITEM_LIST_DEFAULT_FILTERS.qualityThreshold);
  const [filtersReady, setFiltersReady] = useState(false);
  const latestFiltersRef = useRef<ItemListFilters>(ITEM_LIST_DEFAULT_FILTERS);
  const persistTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const storedFilters = loadItemListFilters(ITEM_LIST_DEFAULT_FILTERS);
    if (storedFilters) {
      setSearchTerm(storedFilters.searchTerm);
      setSearchInput(storedFilters.searchTerm);
      setSubcategoryFilter(storedFilters.subcategoryFilter);
      setSubcategoryInput(storedFilters.subcategoryFilter);
      setBoxFilter(storedFilters.boxFilter);
      setAgenticStatusFilter(storedFilters.agenticStatusFilter);
      setShopPublicationFilter(storedFilters.shopPublicationFilter);
      setPlacementFilter(storedFilters.placementFilter);
      setSortKey(storedFilters.sortKey);
      setSortDirection(storedFilters.sortDirection);
      setEntityFilter(storedFilters.entityFilter);
      setQualityThreshold(storedFilters.qualityThreshold);
      console.info('Restored item list filters from localStorage');
    }
    latestFiltersRef.current = storedFilters || ITEM_LIST_DEFAULT_FILTERS;
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    const handleFilterReset = () => {
      setSearchTerm(ITEM_LIST_DEFAULT_FILTERS.searchTerm);
      setSearchInput(ITEM_LIST_DEFAULT_FILTERS.searchTerm);
      setSubcategoryFilter(ITEM_LIST_DEFAULT_FILTERS.subcategoryFilter);
      setSubcategoryInput(ITEM_LIST_DEFAULT_FILTERS.subcategoryFilter);
      setBoxFilter(ITEM_LIST_DEFAULT_FILTERS.boxFilter);
      setAgenticStatusFilter(ITEM_LIST_DEFAULT_FILTERS.agenticStatusFilter);
      setShopPublicationFilter(ITEM_LIST_DEFAULT_FILTERS.shopPublicationFilter);
      setPlacementFilter(ITEM_LIST_DEFAULT_FILTERS.placementFilter);
      setSortKey(ITEM_LIST_DEFAULT_FILTERS.sortKey);
      setSortDirection(ITEM_LIST_DEFAULT_FILTERS.sortDirection);
      setEntityFilter(ITEM_LIST_DEFAULT_FILTERS.entityFilter);
      setQualityThreshold(ITEM_LIST_DEFAULT_FILTERS.qualityThreshold);
      clearItemListFilters();
      setSelectedIds(new Set());
      console.info('Item list filters reset to defaults via header');
    };

    window.addEventListener(ITEM_LIST_FILTERS_RESET_REQUESTED_EVENT, handleFilterReset);
    return () => window.removeEventListener(ITEM_LIST_FILTERS_RESET_REQUESTED_EVENT, handleFilterReset);
  }, []);

  const currentFilters: ItemListFilters = useMemo(() => ({
    searchTerm,
    subcategoryFilter,
    boxFilter,
    agenticStatusFilter,
    shopPublicationFilter,
    placementFilter,
    entityFilter,
    sortKey,
    sortDirection,
    qualityThreshold
  }), [
    searchTerm,
    subcategoryFilter,
    boxFilter,
    agenticStatusFilter,
    shopPublicationFilter,
    placementFilter,
    entityFilter,
    sortKey,
    sortDirection,
    qualityThreshold
  ]);

  useEffect(() => {
    latestFiltersRef.current = currentFilters;
  }, [currentFilters]);

  const handleSearchInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value);
  }, []);

  const handleSearchInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const nextValue = event.currentTarget.value;
    try {
      setSearchTerm(nextValue);
      logger.info?.('Applied item list search filter', {
        length: nextValue.trim().length
      });
    } catch (error) {
      logError('Failed to apply item list search filter', error, {
        value: nextValue
      });
    }
  }, []);

  const loadItems = useCallback(async ({ silent = false, filters }: { silent?: boolean; filters?: ItemListFilters } = {}) => {
    const effectiveFilters = filters || latestFiltersRef.current;
    latestFiltersRef.current = effectiveFilters;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      setError(null);
      const query = buildItemListQueryParams(effectiveFilters);
      const response = await fetch(`/api/items?${query.toString()}`);
      if (!response.ok) {
        console.error('load items failed', response.status);
        try {
          const problem = await response.json();
          setError(problem?.error || 'Fehler beim Laden der Artikel.');
        } catch (jsonErr) {
          console.error('Failed to parse error response for items', jsonErr);
          setError('Fehler beim Laden der Artikel.');
        }
        return;
      }
      const data = await response.json();
      const nextItems: Item[] = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);
      console.log('loaded items', nextItems.length);
    } catch (err) {
      console.error('fetch items failed', err);
      setError('Fehler beim Laden der Artikel.');
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!filtersReady) {
      return;
    }
    loadItems({ filters: currentFilters });
  }, [currentFilters, filtersReady, loadItems]);

  useEffect(() => {
    const validIds = new Set(items.map((item) => item.ItemUUID));
    setSelectedIds((prev) => {
      const stillValid = Array.from(prev).filter((id) => validIds.has(id));
      if (stillValid.length === prev.size) {
        return prev;
      }
      return new Set(stillValid);
    });
  }, [items]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const normalizedSubcategoryFilter = subcategoryFilter.trim().toLowerCase();
  const normalizedBoxFilter = boxFilter.trim().toLowerCase();
  const normalizedAgenticFilter = agenticStatusFilter === 'any' ? null : agenticStatusFilter;

  const subcategoryOptions = useMemo<SubcategoryOption[]>(() => {
    try {
      return itemCategories.flatMap((category) => (
        category.subcategories.map((subcategory) => ({
          value: subcategory.code.toString(),
          label: `${subcategory.code} · ${subcategory.label}`,
          categoryLabel: category.label
        }))
      ));
    } catch (error) {
      logError('Failed to build subcategory filter options', error, {
        itemCategoriesCount: Array.isArray(itemCategories) ? itemCategories.length : 0
      });
      return [];
    }
  }, []);

  const subcategoryLookup = useMemo(() => {
    try {
      return new Map(subcategoryOptions.map((option) => [option.value, option]));
    } catch (error) {
      logError('Failed to build subcategory filter lookup', error, {
        optionCount: subcategoryOptions.length
      });
      return new Map<string, SubcategoryOption>();
    }
  }, [subcategoryOptions]);

  const subcategorySelectOptions = useMemo(() => {
    try {
      const trimmedValue = subcategoryInput.trim();
      const options = [...subcategoryOptions];
      if (trimmedValue && !subcategoryLookup.has(trimmedValue)) {
        options.unshift({
          value: trimmedValue,
          label: `Unbekannte Unterkategorie (${trimmedValue})`,
          categoryLabel: 'unknown'
        });
      }
      return options;
    } catch (error) {
      logError('Failed to build subcategory select options', error, {
        selectedValue: subcategoryFilter
      });
      return [];
    }
  }, [subcategoryInput, subcategoryLookup, subcategoryOptions]);

  const handleSubcategoryInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSubcategoryInput(event.target.value);
  }, []);

  const commitSubcategoryFilter = useCallback((nextValue: string) => {
    try {
      setSubcategoryFilter(nextValue);
      logger.info?.('Applied item list subcategory filter', {
        value: nextValue.trim(),
        length: nextValue.trim().length
      });
    } catch (error) {
      logError('Failed to apply item list subcategory filter', error, {
        value: nextValue
      });
    }
  }, []);

  const handleSubcategoryInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    commitSubcategoryFilter(event.currentTarget.value);
  }, [commitSubcategoryFilter]);

  const handleSubcategoryInputBlur = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    const typedValue = event.currentTarget.value.trim();
    if (!typedValue) {
      return;
    }
    try {
      if (!subcategoryLookup.has(typedValue)) {
        logger.info?.('Subcategory filter typed value not in options', {
          value: typedValue,
          optionCount: subcategoryOptions.length
        });
      }
    } catch (error) {
      logError('Failed to log subcategory filter input mismatch', error, {
        value: typedValue
      });
    }
  }, [subcategoryLookup, subcategoryOptions.length]);

  useEffect(() => {
    if (!filtersReady) {
      return undefined;
    }

    const activeFilters = getActiveFilterDescriptions(currentFilters, ITEM_LIST_DEFAULT_FILTERS);
    const hasOverrides = hasNonDefaultFilters(currentFilters, ITEM_LIST_DEFAULT_FILTERS);
    const detail: ItemListFilterChangeDetail = {
      activeFilters,
      hasOverrides
    };
    window.dispatchEvent(new CustomEvent<ItemListFilterChangeDetail>(ITEM_LIST_FILTERS_CHANGED_EVENT, { detail }));

    if (persistTimeoutRef.current) {
      window.clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
    if (!hasOverrides) {
      clearItemListFilters();
      return undefined;
    }
    persistTimeoutRef.current = window.setTimeout(() => {
      persistItemListFilters(currentFilters);
    }, 250);

    return () => {
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [currentFilters, filtersReady]);

  const filtered = useMemo(
    () =>
      filterAndSortItems({
        items,
        placementFilter,
        normalizedSearch,
        normalizedSubcategoryFilter,
        normalizedBoxFilter,
        stockFilter,
        normalizedAgenticFilter,
        shopPublicationFilter,
        sortKey,
        sortDirection,
        qualityThreshold
      }),
    [
      items,
      normalizedBoxFilter,
      normalizedAgenticFilter,
      normalizedSearch,
      normalizedSubcategoryFilter,
      placementFilter,
      sortDirection,
      sortKey,
      stockFilter,
      shopPublicationFilter,
      qualityThreshold
    ]
  );

  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    filtered.forEach((group) => {
      group.items.forEach((item) => {
        if (item.ItemUUID) {
          ids.add(item.ItemUUID);
        }
      });
    });
    return Array.from(ids);
  }, [filtered]);
  const agenticStatusOptions = useMemo(() => [
    { value: 'any', label: 'Alle' as const } as const,
    ...AGENTIC_RUN_STATUSES.map((status) => ({
      value: status,
      label: describeAgenticStatus(status)
    }))
  ], [AGENTIC_RUN_STATUSES, describeAgenticStatus]);
  const allVisibleSelected = useMemo(() => (
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  ), [selectedIds, visibleIds]);
  const someVisibleSelected = useMemo(() => (
    visibleIds.some((id) => selectedIds.has(id))
  ), [selectedIds, visibleIds]);

  const handleToggleItem = useCallback((itemIds: string[], nextValue: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      itemIds.forEach((itemId) => {
        if (!itemId) {
          return;
        }
        if (nextValue) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }
      });
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((nextValue: boolean) => {
    setSelectedIds((prev) => {
      if (!nextValue) {
        if (!prev.size) {
          return prev;
        }
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedItems = useMemo(() => {
    const selectedLookup = new Set(selectedIds);
    return items.filter((item) => selectedLookup.has(item.ItemUUID));
  }, [items, selectedIds]);

  const handleAgenticStatusFilterChange = useCallback((value: string) => {
    const nextValue = value as AgenticRunStatus | 'any';
    if (nextValue === 'any' || AGENTIC_RUN_STATUSES.includes(nextValue as AgenticRunStatus)) {
      setAgenticStatusFilter(nextValue);
      return;
    }
    console.warn('Ignoring unknown agentic status filter value', value);
    setAgenticStatusFilter('any');
  }, []);

  if (isLoading) {
    return (
      <LoadingPage message="Lade Artikelübersicht…">
        <p className="muted">Die vollständige Artikelliste wird vorbereitet.</p>
      </LoadingPage>
    );
  }

  return (
    // <div className="container item">
    <div className="list-container item">
      <h2>Alle Artikel</h2>
      {/* TODO(filter-panel-layout): Confirm filter panel sizing in CSS after grid wrapper update. */}
      <div className="filter-bar">
        <div className="filter-grid row">
          <div className="filter-panel filter-panel--primary col-12 col-lg-6">
            <div className="filter-grid">
              <div className="filter-grid__item">
                <label className="sort-control sort-control--box">
                  <span>Artikelname</span>
                  <div className="sort-control__input">
                    <GoSearch aria-hidden="true" />
                    <input
                      aria-label="Artikel suchen"
                      id="item-list-search"
                      onChange={handleSearchInputChange}
                      onKeyDown={handleSearchInputKeyDown}
                      placeholder="Beschreibung oder Nummer"
                      type="search"
                      value={searchInput}
                      autoFocus
                    />
                  </div>
                </label>
              </div>

              <div className="filter-grid__item">
                <label className="sort-control">
                  <span>Sortieren nach</span>
                  <select
                    aria-label="Sortierkriterium wählen"
                    onChange={(event) => setSortKey(event.target.value as ItemListSortKey)}
                    value={sortKey}
                  >
                    <option value="artikelbeschreibung">Artikel</option>
                    <option value="artikelnummer">Artikelnummer</option>
                    <option value="box">Behälter</option>
                    <option value="entryDate">Erfasst am</option>
                    <option value="agenticStatus">Ki-Status</option>
                    <option value="quality">Qualität</option>
                    <option value="uuid">UUID</option>
                    <option value="stock">Bestand</option>
                    <option value="subcategory">Unterkategorie</option>
                  </select>
                </label>
              </div>

              <div className="filter-grid__item">
                <label className="sort-direction-control">
                  <span>Reihenfolge</span>
                  <select
                    aria-label="Sortierreihenfolge"
                    onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
                    value={sortDirection}
                  >
                    <option value="asc">Aufsteigend</option>
                    <option value="desc">Absteigend</option>
                  </select>
                </label>
              </div>

              {/* <div className="filter-grid__item">
                <label className="sort-control sort-control--box">
                  <span>Behälter</span>
                  <div className="sort-control__input">
                    <GoContainer aria-hidden="true" />
                    <input
                      aria-label="Behälter filtern"
                      onChange={(event) => setBoxFilter(event.target.value)}
                      placeholder="Box-ID oder Standort"
                      type="search"
                      value={boxFilter}
                    />
                  </div>
                </label>
              </div> */}
            </div>
          </div>

          <div className="filter-panel filter-panel--secondary col-12 col-lg-6">
            <div className="filter-grid">
              <div className="filter-grid__item">
                <label className="filter-control">
                  <span>Unterkategorie</span>
                  <input
                    aria-label="Unterkategorie filtern"
                    list="subcategory-filter-options"
                    onBlur={handleSubcategoryInputBlur}
                    onChange={handleSubcategoryInputChange}
                    onKeyDown={handleSubcategoryInputKeyDown}
                    placeholder="Alle"
                    type="search"
                    value={subcategoryInput}
                  />
                  <datalist id="subcategory-filter-options">
                    {subcategorySelectOptions.map((option) => (
                      <option
                        key={`${option.categoryLabel}-${option.value}`}
                        label={option.label}
                        value={option.value}
                      />
                    ))}
                  </datalist>
                </label>
              </div>
              {/* <div className='row'>
            <label className="filter-control">
              <span>Bestand</span>
              <select
                aria-label="Bestandsstatus filtern"
                onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}
                value={stockFilter}
              >
                <option value="any">Alle</option>
                <option value="instock">Auf Lager</option>
                <option value="outofstock">Nicht auf Lager</option>
              </select>
            </label>
          </div> */}
              <div className="filter-grid__item">
                <label className="filter-control">
                  <span>Ki-Status</span>
                  <select
                    aria-label="Ki-Status filtern"
                    onChange={(event) => handleAgenticStatusFilterChange(event.target.value)}
                    value={agenticStatusFilter}
                  >
                    {agenticStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="filter-grid__item">
                <label className="filter-control">
                  <span>Shopstatus</span>
                  <select
                    aria-label="Shopstatus filtern"
                    onChange={(event) => setShopPublicationFilter(event.target.value as ItemListFilters['shopPublicationFilter'])}
                    value={shopPublicationFilter}
                  >
                    <option value="all">Alle</option>
                    <option value="inShop">im Shop</option>
                    <option value="notPublished">nicht veröffentlicht</option>
                    <option value="noShopArticle">kein Shopartikel</option>
                  </select>
                </label>
              </div>

              <div className="filter-grid__item">
                <label className="filter-control">
                  <span>Typ</span>
                  <select
                    aria-label="Instanzen oder Referenzen anzeigen"
                    onChange={(event) => setEntityFilter(event.target.value as ItemListFilters['entityFilter'])}
                    value={entityFilter}
                  >
                    <option value="all">Alle</option>
                    <option value="instances">Instanzen</option>
                    <option value="references">Referenzen</option>
                  </select>
                </label>
              </div>

              <div className="filter-grid__item">
                <label className="filter-control">
                  <span>Platzierung</span>
                  <select
                    aria-label="Platzierung filtern"
                    onChange={(event) => setPlacementFilter(event.target.value as ItemListFilters['placementFilter'])}
                    value={placementFilter}
                  >
                    <option value="all">Alle</option>
                    <option value="unplaced">unplatziert</option>
                    <option value="placed">platziert</option>
                  </select>
                </label>
              </div>

              <div className="filter-grid__item">
                <label className="filter-control">
                  <span>Qualität ab {describeQuality(qualityThreshold).label}</span>
                  <input
                    type="range"
                    min={QUALITY_MIN}
                    max={5}
                    step={1}
                    value={qualityThreshold}
                    onChange={(event) => setQualityThreshold(normalizeQuality(event.target.value, console) ?? QUALITY_MIN)}
                    aria-valuetext={`${describeQuality(qualityThreshold).label} (${qualityThreshold})`}
                  />
                  {/* <div className="quality-slider__labels">
                {[1, 2, 3, 4, 5].map((level) => (
                  <span key={`filter-quality-${level}`}>{QUALITY_LABELS[level] ?? level}</span>
                ))}
              </div> */}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
      {error ? (
        <div aria-live="assertive" className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {isRefreshing ? (
        <p className="muted" data-testid="item-list-refresh-status">Aktualisiere Liste…</p>
      ) : null}
      {selectedIds.size ? (
        <BulkItemActionBar
          onActionComplete={() => loadItems({ silent: true })}
          onClearSelection={handleClearSelection}
          selectedItems={selectedItems}
          selectedIds={Array.from(selectedIds)}
        />
      ) : null}
      <ItemList
        allVisibleSelected={allVisibleSelected}
        items={filtered}
        onToggleAll={handleToggleAll}
        onToggleItem={handleToggleItem}
        selectedItemIds={selectedIds}
        someVisibleSelected={someVisibleSelected}
      />
    </div>
  );
}
