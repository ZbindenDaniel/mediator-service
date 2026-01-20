import React, { useCallback, useEffect, useState } from 'react';
import { SimilarItemsPanel } from './forms/SimilarItemsPanel';
import type { SimilarItem } from './forms/useSimilarItems';
// TODO(deep-search): Coordinate deep search toggle copy for duplicate checking workflows.

interface ItemMatchSelectionProps {
  searchTerm: string;
  onSelect: (item: SimilarItem) => void | Promise<void>;
  onSkip: () => void;
}

export function ItemMatchSelection({ searchTerm, onSelect, onSkip }: ItemMatchSelectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SimilarItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const trimmedTerm = searchTerm.trim();

    if (!trimmedTerm) {
      setItems([]);
      setError(null);
      setLoading(false);
      return () => {
        controller.abort();
      };
    }

    async function fetchMatches() {
      try {
        setLoading(true);
        setError(null);
        console.log('Fetching duplicate candidates', trimmedTerm);
        const params = new URLSearchParams({ term: trimmedTerm, scope: 'refs' });
        const response = await fetch(`/api/search?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal
        });
        if (!isMounted) {
          return;
        }
        if (!response.ok) {
          console.error('Duplicate candidate search failed', response.status);
          setError(`Suche fehlgeschlagen (Status ${response.status})`);
          setItems([]);
          setLoading(false);
          return;
        }
        const payload = await response.json();
        const results = Array.isArray(payload?.items) ? (payload.items as SimilarItem[]) : [];
        setItems(results);
        setLoading(false);
      } catch (err) {
        if (!isMounted || controller.signal.aborted) {
          console.log('Duplicate candidate search aborted');
          return;
        }
        console.error('Duplicate candidate search failed', err);
        setError('Ähnliche Artikel konnten nicht geladen werden.');
        setItems([]);
        setLoading(false);
      }
    }

    void fetchMatches();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [searchTerm]);

  const handleSelect = useCallback(
    async (item: SimilarItem) => {
      try {
        console.log('Duplicate candidate chosen', {
          artikelNummer: item.Artikel_Nummer,
          exemplarItemUUID: item.exemplarItemUUID
        });
        await onSelect(item);
      } catch (err) {
        console.error('Failed to handle duplicate candidate selection', err);
      }
    },
    [onSelect]
  );

  return (
    <div className='container item'>
      <div className="card">
        <div className="item-form__header">
          <h2>Ähnliche Artikel prüfen</h2>
          <p>Wir haben nach bestehenden Artikeln mit der Beschreibung „{searchTerm || '—'}“ gesucht.</p>
        </div>
        <div className="item-form">
          <SimilarItemsPanel items={items} loading={loading} error={error} onSelect={handleSelect} />
          {!loading && !error && items.length === 0 && (
            <div className="row">
              <span>Keine ähnlichen Artikel gefunden.</span>
            </div>
          )}
          {error && (
            <div className="row error">
              <span>{error}</span>
            </div>
          )}
          <div className="row">
            <button type="button" onClick={onSkip}>
              Kein Duplikat – weiter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
