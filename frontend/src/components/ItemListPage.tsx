import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoContainer, GoSearch } from 'react-icons/go';
import type { AgenticRunStatus, Item } from '../../../models';
import {
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUSES
} from '../../../models';
import { describeQuality, normalizeQuality, QUALITY_DEFAULT, QUALITY_LABELS, QUALITY_MIN } from '../../../models/quality';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';
import {
  clearItemListFilters,
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
import BulkItemActionBar from './BulkItemActionBar';
import ItemList from './ItemList';
import LoadingPage from './LoadingPage';

// TODO(agentic): Extend item list page sorting and filtering controls for enriched inventory views.
// TODO(agentic-status-ui): Replace single-select status filtering with quick filters once reviewer workflows expand.
// TODO(storage-sync): Persist list filters to localStorage so returning users keep their preferences across sessions.
// TODO(item-entity-filter): Confirm UX for reference-only rows when enriching the item repository view.

const ITEM_LIST_DEFAULT_FILTERS = getDefaultItemListFilters();
const resolveItemQuality = (value: unknown) => normalizeQuality(value ?? QUALITY_DEFAULT, console);

export interface ItemListComputationOptions {
  items: Item[];
  showUnplaced: boolean;
  normalizedSearch: string;
  normalizedSubcategoryFilter: string;
  normalizedBoxFilter: string;
  stockFilter: 'any' | 'instock' | 'outofstock';
  normalizedAgenticFilter: AgenticRunStatus | null;
  sortKey: ItemListSortKey;
  sortDirection: 'asc' | 'desc';
  qualityThreshold: number;
}

export function filterAndSortItems(options: ItemListComputationOptions): Item[] {
  const {
    items,
    showUnplaced,
    normalizedSearch,
    normalizedSubcategoryFilter,
    normalizedBoxFilter,
    stockFilter,
    normalizedAgenticFilter,
    sortKey,
    sortDirection,
    qualityThreshold
  } = options;

  const baseItems = showUnplaced ? items.filter((it) => !it.BoxID) : items;
  const searched = baseItems.filter((item) => {
    const description = item.Artikelbeschreibung?.toLowerCase() ?? '';
    const number = item.Artikel_Nummer?.toLowerCase() ?? '';
    const uuid = item.ItemUUID.toLowerCase();
    const matchesSearch = normalizedSearch
      ? description.includes(normalizedSearch)
      || number.includes(normalizedSearch)
      || uuid.includes(normalizedSearch)
      : true;
    const matchesSubcategory = normalizedSubcategoryFilter
      ? (item.Unterkategorien_A?.toString().toLowerCase() ?? '').includes(normalizedSubcategoryFilter)
      : true;
    const matchesBox = normalizedBoxFilter
      ? (item.BoxID?.toLowerCase() ?? '').includes(normalizedBoxFilter)
      : true;
    const stockValue = typeof item.Auf_Lager === 'number' ? item.Auf_Lager : 0;
    const matchesStock =
      stockFilter === 'instock'
        ? stockValue > 0
        : stockFilter === 'outofstock'
          ? stockValue <= 0
          : true;
    const agenticStatus = (item.AgenticStatus ?? AGENTIC_RUN_STATUS_NOT_STARTED) as AgenticRunStatus;
    const matchesAgenticStatus = normalizedAgenticFilter
      ? agenticStatus === normalizedAgenticFilter
      : true;
    const matchesQuality = resolveItemQuality(item.Quality) >= qualityThreshold;

    return matchesSearch && matchesSubcategory && matchesBox && matchesStock && matchesAgenticStatus && matchesQuality;
  });

  const sorted = [...searched].sort((a, b) => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    if (sortKey === 'stock') {
      const aStock = typeof a.Auf_Lager === 'number' ? a.Auf_Lager : -Infinity;
      const bStock = typeof b.Auf_Lager === 'number' ? b.Auf_Lager : -Infinity;
      if (aStock === bStock) {
        return a.ItemUUID.localeCompare(b.ItemUUID) * direction;
      }
      return (aStock - bStock) * direction;
    }

    if (sortKey === 'agenticStatus') {
      const statusOrder = (status: AgenticRunStatus | null | undefined) => {
        const resolved = status ?? AGENTIC_RUN_STATUS_NOT_STARTED;
        const idx = AGENTIC_RUN_STATUSES.indexOf(resolved);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      };
      const aStatusOrder = statusOrder(a.AgenticStatus as AgenticRunStatus | null | undefined);
      const bStatusOrder = statusOrder(b.AgenticStatus as AgenticRunStatus | null | undefined);
      if (aStatusOrder === bStatusOrder) {
        return a.ItemUUID.localeCompare(b.ItemUUID) * direction;
      }
      return (aStatusOrder - bStatusOrder) * direction;
    }

    if (sortKey === 'quality') {
      const aQuality = resolveItemQuality(a.Quality);
      const bQuality = resolveItemQuality(b.Quality);
      if (aQuality === bQuality) {
        return a.ItemUUID.localeCompare(b.ItemUUID) * direction;
      }
      return (aQuality - bQuality) * direction;
    }

    const valueFor = (item: Item) => {
      switch (sortKey) {
        case 'artikelnummer':
          return item.Artikel_Nummer?.trim().toLowerCase() ?? '';
        case 'box':
          return item.BoxID?.trim().toLowerCase() ?? '';
        case 'uuid':
          return item.ItemUUID?.trim().toLowerCase() ?? '';
        case 'subcategory':
          return item.Unterkategorien_A?.toString().toLowerCase() ?? '';
        case 'artikelbeschreibung':
        default:
          return item.Artikelbeschreibung?.trim().toLowerCase() ?? '';
      }
    };
    const aVal = valueFor(a);
    const bVal = valueFor(b);
    if (aVal === bVal) {
      return a.ItemUUID.localeCompare(b.ItemUUID) * direction;
    }
    return aVal.localeCompare(bVal) * direction;
  });

  return sorted;
}

export default function ItemListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [showUnplaced, setShowUnplaced] = useState(ITEM_LIST_DEFAULT_FILTERS.showUnplaced);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(ITEM_LIST_DEFAULT_FILTERS.searchTerm);
  const [sortKey, setSortKey] = useState<ItemListSortKey>(ITEM_LIST_DEFAULT_FILTERS.sortKey);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(ITEM_LIST_DEFAULT_FILTERS.sortDirection);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subcategoryFilter, setSubcategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'any' | 'instock' | 'outofstock'>('any');
  const [boxFilter, setBoxFilter] = useState(ITEM_LIST_DEFAULT_FILTERS.boxFilter);
  const [agenticStatusFilter, setAgenticStatusFilter] = useState<'any' | AgenticRunStatus>(ITEM_LIST_DEFAULT_FILTERS.agenticStatusFilter);
  const [entityFilter, setEntityFilter] = useState<ItemListFilters['entityFilter']>(ITEM_LIST_DEFAULT_FILTERS.entityFilter);
  const [qualityThreshold, setQualityThreshold] = useState(ITEM_LIST_DEFAULT_FILTERS.qualityThreshold);
  const [filtersReady, setFiltersReady] = useState(false);
  const latestFiltersRef = useRef<ItemListFilters>(ITEM_LIST_DEFAULT_FILTERS);
  const persistTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const storedFilters = loadItemListFilters(ITEM_LIST_DEFAULT_FILTERS);
    if (storedFilters) {
      setSearchTerm(storedFilters.searchTerm);
      setBoxFilter(storedFilters.boxFilter);
      setAgenticStatusFilter(storedFilters.agenticStatusFilter);
      setShowUnplaced(storedFilters.showUnplaced);
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
      setBoxFilter(ITEM_LIST_DEFAULT_FILTERS.boxFilter);
      setAgenticStatusFilter(ITEM_LIST_DEFAULT_FILTERS.agenticStatusFilter);
      setShowUnplaced(ITEM_LIST_DEFAULT_FILTERS.showUnplaced);
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
    boxFilter,
    agenticStatusFilter,
    showUnplaced,
    entityFilter,
    sortKey,
    sortDirection,
    qualityThreshold
  }), [searchTerm, boxFilter, agenticStatusFilter, showUnplaced, entityFilter, sortKey, sortDirection, qualityThreshold]);

  useEffect(() => {
    latestFiltersRef.current = currentFilters;
  }, [currentFilters]);

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
      const query = new URLSearchParams();
      if (effectiveFilters.searchTerm.trim()) {
        query.set('search', effectiveFilters.searchTerm.trim());
      }
      if (effectiveFilters.boxFilter.trim()) {
        query.set('box', effectiveFilters.boxFilter.trim());
      }
      if (effectiveFilters.agenticStatusFilter !== 'any') {
        query.set('agenticStatus', effectiveFilters.agenticStatusFilter);
      }
      if (effectiveFilters.showUnplaced) {
        query.set('showUnplaced', 'true');
      }
      if (effectiveFilters.entityFilter !== 'all') {
        query.set('entityFilter', effectiveFilters.entityFilter);
      }
      query.set('sortKey', effectiveFilters.sortKey);
      query.set('sortDirection', effectiveFilters.sortDirection);
      if (effectiveFilters.qualityThreshold > QUALITY_MIN) {
        query.set('qualityAtLeast', effectiveFilters.qualityThreshold.toString());
      }
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
        showUnplaced,
        normalizedSearch,
        normalizedSubcategoryFilter,
        normalizedBoxFilter,
        stockFilter,
        normalizedAgenticFilter,
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
      showUnplaced,
      sortDirection,
      sortKey,
      stockFilter,
      qualityThreshold
    ]
  );

  const visibleIds = useMemo(() => filtered.map((item) => item.ItemUUID), [filtered]);
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

  const handleToggleItem = useCallback((itemId: string, nextValue: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (nextValue) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
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
      <div className="filter-bar">
        <div className='filter-bar-row filter-bar-row--search'>
          <div className='row'>
            <label className="search-control">
              <GoSearch />
            </label>
            <input
              aria-label="Artikel suchen"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Beschreibung, Nummer oder UUID"
              type="search"
              value={searchTerm}
            />
          </div>
          <div className='row'>

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
                <option value="agenticStatus">Agentic-Status</option>
                <option value="quality">Qualität</option>
                <option value="uuid">UUID</option>
                <option value="stock">Bestand</option>
                <option value="subcategory">Unterkategorie</option>
              </select>
            </label>
          </div>

          <div className='row'>

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
          
          <div className='row'>

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
          </div>
        </div>

        <div className='filter-bar-row filter-bar-row--filters'>
          {/* <div className='row'>
            <label className="filter-control">
              <span>Unterkategorie</span>
              <input
                aria-label="Unterkategorie filtern"
                onChange={(event) => setSubcategoryFilter(event.target.value)}
                placeholder="Z.B. 101"
                type="search"
                value={subcategoryFilter}
              />
            </label>
          </div>
          <div className='row'>
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
          <div className='row'>
            <label className="filter-control">
              <span>Agentic-Status</span>
              <select
                aria-label="Agentic-Status filtern"
                onChange={(event) => handleAgenticStatusFilterChange(event.target.value)}
                value={agenticStatusFilter}
              >
                {agenticStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className='row'>
            <label className="filter-control">
              <span>Qualität ab</span>
              <input
                type="range"
                min={QUALITY_MIN}
                max={5}
                step={1}
                value={qualityThreshold}
                onChange={(event) => setQualityThreshold(normalizeQuality(event.target.value, console))}
                aria-valuetext={`${describeQuality(qualityThreshold).label} (${qualityThreshold})`}
              />
              <div className="quality-slider__labels">
                {[1, 2, 3, 4, 5].map((level) => (
                  <span key={`filter-quality-${level}`}>{QUALITY_LABELS[level] ?? level}</span>
                ))}
              </div>
            </label>
          </div>
          <div className='row'>
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
          <div className='row'>
            <label className="unplaced-filter" htmlFor="unplaced">
              <span>unplatziert</span>
              <input
                checked={showUnplaced}
                id="unplaced"
                name='unplaced'
                onChange={(event) => setShowUnplaced(event.target.checked)}
                type="checkbox"
              />
            </label>
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
