import React, { useState } from 'react';
import type { Item } from '../../../models';
import BoxColorTag from './BoxColorTag';
import { Link } from 'react-router-dom';

type SearchResult =
  | { type: 'box'; id: string; location?: string | null }
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
      console.log('Search data', data);
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
      <div className="card-header">
        <h2>Artikel finden</h2>
        <Link to="/items" id="all-items" aria-label="Alle Artikel anzeigen">
          Alle
        </Link>
      </div>
      <div className="row">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Material, B-…, oder UUID"
          onKeyDown={e => { if (e.key === 'Enter') runFind(); }}
        />
        <button className="btn" onClick={runFind}>Suchen</button>
      </div>
      <div className="list" style={{ marginTop: '10px' }}>
        {results.map((res, idx) =>
          res.type === 'box' ? (
            <div className="card linkcard" key={`b-${idx}`}>
             <Link className="linkcard" to={`/boxes/${encodeURIComponent(res.id)}`}>
              <div>
                Behälter: {res.id}
              </div>
             </Link>
            </div>
          ) : (
            <div className="card linkcard" key={res.item.ItemUUID}>
              <Link className="linkcard" to={`/items/${encodeURIComponent(res.item.ItemUUID)}`}>
              <div>
                <span className="pill mono">
                  {(res.item.ItemUUID || '').slice(-6).toUpperCase()}
                </span>
              </div>
              </Link>
              <div className="muted">{res.item.Artikelbeschreibung || ''}</div>
              {res.item.BoxID && (
                <div>
                  Behälter:{' '}
                  <a href={`/boxes/${encodeURIComponent(res.item.BoxID)}`}>
                    {res.item.BoxID}
                  </a>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
