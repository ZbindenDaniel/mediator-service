import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GoContainer, GoSearch } from 'react-icons/go';
import type { Item } from '../../../models';
import BulkItemActionBar from './BulkItemActionBar';
import ItemList from './ItemList';
import LoadingPage from './LoadingPage';

// TODO(agentic): Extend item list page sorting and filtering controls for enriched inventory views.

type SortKey = 'artikelbeschreibung' | 'artikelnummer' | 'box' | 'uuid' | 'stock' | 'subcategory';

export default function ItemListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [showUnplaced, setShowUnplaced] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('artikelbeschreibung');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subcategoryFilter, setSubcategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'any' | 'instock' | 'outofstock'>('any');
  const [boxFilter, setBoxFilter] = useState('');

  const loadItems = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      setError(null);
      const response = await fetch('/api/items');
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
    loadItems();
  }, [loadItems]);

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

  const filtered = useMemo(() => {
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

      return matchesSearch && matchesSubcategory && matchesBox && matchesStock;
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
  }, [
    items,
    normalizedBoxFilter,
    normalizedSearch,
    normalizedSubcategoryFilter,
    showUnplaced,
    sortDirection,
    sortKey,
    stockFilter
  ]);

  const visibleIds = useMemo(() => filtered.map((item) => item.ItemUUID), [filtered]);
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
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                value={sortKey}
              >
                <option value="artikelbeschreibung">Artikel</option>
                <option value="artikelnummer">Artikelnummer</option>
                <option value="box">Behälter</option>
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
            <label className="filter-control filter-control--box">
              <span>Behälter</span>
              <div className="filter-control__input">
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
