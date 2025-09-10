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
    <div className="overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
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
        <div className="list" style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '10px' }}>
          {results.map(it => (
            <div key={it.ItemUUID} className="card" style={{ marginBottom: '6px' }}>
              <div><b>{it.Artikel_Nummer || it.ItemUUID}</b></div>
              <div className="muted">{it.Artikelbeschreibung}</div>
              <button className="btn" onClick={() => addToBox(it)}>Auswählen</button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: '10px' }}>
          <button className="btn" onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
