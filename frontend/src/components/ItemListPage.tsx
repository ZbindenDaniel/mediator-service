import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GoContainer } from 'react-icons/go';
import type { Item } from '../../../models';
import BulkItemActionBar from './BulkItemActionBar';
import ItemList from './ItemList';
import LoadingPage from './LoadingPage';

type SortKey = 'artikelbeschreibung' | 'artikelnummer' | 'box';

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
  const filtered = useMemo(() => {
    const baseItems = showUnplaced ? items.filter((it) => !it.BoxID) : items;
    const searched = normalizedSearch
      ? baseItems.filter((item) => {
        const description = item.Artikelbeschreibung?.toLowerCase() ?? '';
        const number = item.Artikel_Nummer?.toLowerCase() ?? '';
        return description.includes(normalizedSearch) || number.includes(normalizedSearch);
      })
      : baseItems;

    const sorted = [...searched].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const valueFor = (item: Item) => {
        switch (sortKey) {
          case 'artikelnummer':
            return item.Artikel_Nummer?.trim().toLowerCase() ?? '';
          case 'box':
            return item.BoxID?.trim().toLowerCase() ?? '';
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
  }, [items, normalizedSearch, showUnplaced, sortDirection, sortKey]);

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
        <label className="search-control">
          <span>Suche</span>
          <input
            aria-label="Artikel suchen"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Beschreibung oder Artikelnummer"
            type="search"
            value={searchTerm}
          />
        </label>
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
          </select>
        </label>
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
        <label className="unplaced-filter">
          <input
            checked={showUnplaced}
            id="unplaced"
            onChange={(event) => setShowUnplaced(event.target.checked)}
            type="checkbox"
          />
          <span>Nur unplatzierte Artikel</span>
          <GoContainer />
        </label>
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
          selectedIds={Array.from(selectedIds)}
        />
      ) : null}
      {/* TODO: Replace manual confirm dialogs in bulk actions with shared dialog service when available. */}
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
