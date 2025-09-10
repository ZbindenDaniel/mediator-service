import React, { useState } from 'react';
import type { Item } from '../../../models';
import { getUser } from '../lib/user';

interface Props {
  boxId: string;
  onAdded: () => void;
  onClose: () => void;
}

export default function AddItemToBoxDialog({ boxId, onAdded, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);

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
      setResults((data.items || []) as Item[]);
    } catch (err) {
      console.error('search failed', err);
    }
  }

  async function addToBox(item: Item) {
    try {
      if (item.BoxID && item.BoxID !== boxId) {
        const ok = window.confirm(`Item ist bereits in Box ${item.BoxID}. Verschieben?`);
        if (!ok) return;
      }
      const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: boxId, actor: getUser() })
      });
      if (res.ok) {
        console.log('Added item to box', item.ItemUUID, boxId);
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
          {results.map(it => (
            <div key={it.ItemUUID} className="card result">
              <div><b>{it.Artikel_Nummer || it.ItemUUID}</b></div>
              <div className="muted">{it.Artikelbeschreibung}</div>
              <button className="btn" onClick={() => addToBox(it)}>Auswählen</button>
            </div>
          ))}
        </div>
        <div className="row mt-10">
          <button className="btn" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
