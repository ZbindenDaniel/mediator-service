import React from 'react';
import type { SimilarItem } from './useSimilarItems';
import { highlightMatches } from './highlightMatches';

interface SimilarItemsPanelProps {
  items: SimilarItem[];
  loading: boolean;
  error: string | null;
  onSelect: (item: SimilarItem) => void;
  // The user's input, used to highlight matching words in each result.
  highlightTerm?: string;
}

export function SimilarItemsPanel({ items, loading, error, onSelect, highlightTerm }: SimilarItemsPanelProps) {
  if (!loading && !error && items.length === 0) {
    return null;
  }

  return (
    <div className="row suggestion-panel">
      <div className="suggestion-content">
        <strong>Ähnliche Artikel</strong>
        {loading && <div className="suggestion-status">Suche läuft...</div>}
        {error && <div className="suggestion-error">{error}</div>}
        {!loading && !error && items.length > 0 && (
          <ul>
            {items.map((item, index) => {
              const listKey = item.Artikel_Nummer || item.exemplarItemUUID || `ref-${index}`;
              const detailUrl = item.exemplarItemUUID
                ? `/items/${encodeURIComponent(item.exemplarItemUUID)}`
                : item.exemplarBoxID
                ? `/boxes/${encodeURIComponent(item.exemplarBoxID)}`
                : null;
              return (
                <li key={listKey} className="suggestion-item">
                  <div className="suggestion-item__details">
                    <div>
                      <span className="suggestion-item__number">
                        {item.Artikel_Nummer
                          ? highlightMatches(item.Artikel_Nummer, highlightTerm)
                          : '—'}
                      </span>
                    </div>
                    <div>
                      {item.Artikelbeschreibung
                        ? highlightMatches(item.Artikelbeschreibung, highlightTerm)
                        : 'Keine Beschreibung'}
                    </div>
                    <div className="suggestion-item__box">
                      Behälter: {item.exemplarBoxID || 'unbekannt'}
                      {item.exemplarLocation ? ` – ${item.exemplarLocation}` : ''}
                    </div>
                  </div>
                  <div className="suggestion-item__actions">
                    {detailUrl && (
                      <a href={detailUrl} target="_blank" rel="noreferrer">
                        ansehen
                      </a>
                    )}
                    <button type="button" onClick={() => onSelect(item)}>
                      übernehmen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
