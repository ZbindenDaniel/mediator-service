import React, { useState } from 'react';
import type { Item } from '../../../models';

type SearchResult =
  | { type: 'box'; id: string; location: string }
  | { type: 'item'; item: Item };

export default function SearchCard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  async function runFind() {
    const v = query.trim();
    setResults([]);
    if (!v) return;
    try {
      const r = await fetch('/api/search?term=' + encodeURIComponent(v));
      if (!r.ok) {
        console.error('Search HTTP error', r.status);
        return;
      }
      const data = await r.json();
      const next: SearchResult[] = [];
      (data.items || []).forEach((it: Item) => next.push({ type: 'item', item: it }));
      (data.boxes || []).forEach((b: any) => next.push({ type: 'box', id: b.BoxID, location: b.Location }));
      console.log('Search returned', (data.items || []).length, 'items', (data.boxes || []).length, 'behälter');
      setResults(next);
    } catch (err) {
      console.error('Search failed', err);
    }
  }

  return (
    <div className="card" id="find">
      <h2>Artikel finden</h2>
      <div className="row">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Material, B-…, oder UUID"
          onKeyDown={e => { if (e.key === 'Enter') runFind(); }}
          autoFocus
        />
        <button className="btn" onClick={runFind}>Suchen</button>
        <button className='btn'><a href="/items">Alle Artikel</a></button>
      </div>
      <div className="list" style={{ marginTop: '10px' }}>
        {results.map((res, idx) =>
          res.type === 'box' ? (
            <div className="card" key={`b-${idx}`}>
              <div>
                Behälter: <a href={`/boxes/${encodeURIComponent(res.id)}`}>{res.location || 'Behälter'}</a>
              </div>
            </div>
          ) : (
            <div className="card" key={res.item.ItemUUID}>
              <div>
                <b>
                  <a href={`/items/${encodeURIComponent(res.item.ItemUUID)}`}>
                    {res.item.Artikel_Nummer || '(kein Artikel)'}
                  </a>
                </b>
                <br />
                <span className="pill mono">
                  {(res.item.ItemUUID || '').slice(-6).toUpperCase()}
                </span>
              </div>
              <div className="muted">{res.item.Artikelbeschreibung || ''}</div>
              {res.item.BoxID && (
                <div>
                  Behälter: <a href={`/boxes/${encodeURIComponent(res.item.BoxID)}`}>{res.item.Location}</a>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
