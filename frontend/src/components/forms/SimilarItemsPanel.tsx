import React from 'react';
import type { SimilarItem } from './useSimilarItems';

interface SimilarItemsPanelProps {
  items: SimilarItem[];
  loading: boolean;
  error: string | null;
  onSelect: (item: SimilarItem) => void;
}

export function SimilarItemsPanel({ items, loading, error, onSelect }: SimilarItemsPanelProps) {
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
            {items.map((item) => {
              const key = item.ItemUUID || item.Artikel_Nummer;
              return (
                <li key={key} className="suggestion-item">
                  <div className="suggestion-item__details">
                    <div>
                      <span className="suggestion-item__number">{item.Artikel_Nummer || '—'}</span>
                    </div>
                    <div>{item.Artikelbeschreibung || 'Keine Beschreibung'}</div>
                    {item.BoxID && (
                      <div className="suggestion-item__box">Behälter: {item.BoxID}</div>
                    )}
                    {item.Hersteller && (
                      <div className="suggestion-item__box">Hersteller: {item.Hersteller}</div>
                    )}
                    {item.Location && (
                      <div className="suggestion-item__box">Lagerort: {item.Location}</div>
                    )}
                  </div>
                  <div className="suggestion-item__actions">
                    {item.ItemUUID ? (
                      <a href={`/items/${encodeURIComponent(item.ItemUUID)}`} target="_blank" rel="noreferrer">
                        ansehen
                      </a>
                    ) : (
                      <span>kein Direktlink</span>
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
