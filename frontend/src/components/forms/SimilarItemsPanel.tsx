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
              const artikelNummer =
                typeof item.reference?.Artikel_Nummer === 'string'
                  ? item.reference.Artikel_Nummer
                  : item.Artikel_Nummer || '—';
              const beschreibung =
                typeof item.reference?.Artikelbeschreibung === 'string'
                  ? item.reference.Artikelbeschreibung
                  : item.Artikelbeschreibung || 'Keine Beschreibung';
              const boxId = item.quantity?.BoxID ?? item.BoxID ?? 'unbekannt';
              const itemId = item.quantity?.ItemUUID ?? item.ItemUUID;
              const quantity =
                typeof item.quantity?.Quantity === 'number'
                  ? item.quantity.Quantity
                  : item.Auf_Lager ?? 0;
              return (
                <li key={itemId} className="suggestion-item">
                  <div className="suggestion-item__details">
                    <div>
                      <span className="suggestion-item__number">{artikelNummer || '—'}</span>
                    </div>
                    <div>{beschreibung || 'Keine Beschreibung'}</div>
                    <div className="suggestion-item__box">Behälter: {boxId || 'unbekannt'}</div>
                    <div className="suggestion-item__box">Bestand: {quantity}</div>
                  </div>
                  <div className="suggestion-item__actions">
                    <a href={`/items/${encodeURIComponent(itemId)}`} target="_blank" rel="noreferrer">
                      ansehen
                    </a>
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
