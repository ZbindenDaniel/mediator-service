import React, { useState } from 'react';
import type { ItemWithRelations } from '../../../models';
import { getUser } from '../lib/user';

interface Props {
  boxId: string;
  onAdded: () => void;
  onClose: () => void;
}

export default function AddItemToBoxDialog({ boxId, onAdded, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemWithRelations[]>([]);

  async function runSearch() {
    const term = query.trim();
    setResults([]);
    if (!term) return;
    try {
      console.log('Searching items for', term);
      const r = await fetch('/api/search?term=' + encodeURIComponent(term));
      if (!r.ok) {
        console.error('search failed', r.status);
        return;
      }
      const data = await r.json();
      setResults((data.items || []) as ItemWithRelations[]);
    } catch (err) {
      console.error('search failed', err);
    }
  }

  async function addToBox(item: ItemWithRelations) {
    try {
      const currentBoxId = item.quantity?.BoxID ?? item.BoxID;
      if (currentBoxId && currentBoxId !== boxId) {
        const ok = window.confirm(`Artikel ist bereits in Behälter ${currentBoxId}. Verschieben?`);
        if (!ok) return;
      }
      const targetItemUUID = item.quantity?.ItemUUID ?? item.ItemUUID;
      const res = await fetch(`/api/items/${encodeURIComponent(targetItemUUID)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: boxId, actor: getUser() })
      });
      if (res.ok) {
        console.log('Added item to box', targetItemUUID, boxId);
        onAdded();
        onClose();
      } else {
        console.error('add to box failed', res.status);
      }
    } catch (err) {
      console.error('add to box error', err);
    }
  }

  return (
    <div className="overlay">
      <div className="card modal">
        <h3>Artikel suchen</h3>
        <div className="row">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
            autoFocus
          />
          <button className="btn" onClick={runSearch}>Suchen</button>
        </div>
        <div className="results">
          {results.map((it) => {
            const artikelNummer =
              typeof it.reference?.Artikel_Nummer === 'string' ? it.reference.Artikel_Nummer : it.Artikel_Nummer;
            const beschreibung =
              typeof it.reference?.Artikelbeschreibung === 'string'
                ? it.reference.Artikelbeschreibung
                : it.Artikelbeschreibung;
            const currentBoxId = it.quantity?.BoxID ?? it.BoxID;
            const itemId = it.quantity?.ItemUUID ?? it.ItemUUID;
            const quantity =
              typeof it.quantity?.Quantity === 'number' ? it.quantity.Quantity : it.Auf_Lager ?? 0;
            return (
              <div key={itemId} className="card result">
                <div><b>{artikelNummer || itemId}</b></div>
                <div>{beschreibung || 'Keine Beschreibung'}</div>
                <div className="muted">Aktueller Behälter: {currentBoxId || 'unbekannt'}</div>
                <div className="muted">Bestand: {quantity}</div>
                <button className="btn" onClick={() => addToBox(it)}>Auswählen</button>
              </div>
            );
          })}
        </div>
        <div className="row mt-10">
          <button className="btn" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
