import React, { useState } from 'react';
import type { Item } from '../../../models';
import { Link } from 'react-router-dom';
import BoxTag from './BoxTag';

// TODO(agent): Double-check that the simplified BoxTag output matches the search results layout expectations.
// TODO(navigation): Review header navigation labels before adding new search shortcuts here.
// TODO(deep-search): Add an explicit deep-search toggle to this card when UX copy is ready.

type SearchResult =
  | { type: 'box'; id: string; locationId?: string | null; label?: string | null }
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
      (data.boxes || []).forEach((b: any) => next.push({ type: 'box', id: b.BoxID, locationId: b.LocationId, label: b.Label }));
      console.log('Search returned', (data.items || []).length, 'items', (data.boxes || []).length, 'behälter');
      setResults(next);
    } catch (err) {
      console.error('Search failed', err);
    }
  }

  return (
    <div className="card" id="find">
      <div className="card-header">
        <h2>Finden</h2>
      </div>
      <div className="row">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="z.B. Lenovo x230, B-151025, Brother, 07045"
          onKeyDown={e => { if (e.key === 'Enter') runFind(); }}
          autoFocus
        />
        <button className="btn" onClick={runFind}>Suchen</button>
      </div>
      <div className="list search-results" style={{ marginTop: '10px' }}>
        {results.map((res, idx) =>
          res.type === 'box' ? (
            <div className="search-results-row" key={`b-${idx}`}>
              <div className="mono">
                <Link to={`/boxes/${encodeURIComponent(res.id)}`}>Behälter: {res.id}</Link>
              </div>
              <div className="muted">
                <BoxTag locationKey={res.locationId} labelOverride={res.label} />
              </div>
              <div />
            </div>
          ) : (
            <div className="search-results-row" key={res.item.ItemUUID}>
              <div>
                <Link to={`/items/${encodeURIComponent(res.item.ItemUUID)}`}>
                  <span className="pill mono">
                    {(res.item.ItemUUID || '').slice(-6).toUpperCase()}
                  </span>
                </Link>
              </div>
              <div className="muted">{res.item.Artikelbeschreibung || ''}</div>
              <div>
                {res.item.BoxID && (
                  <>
                    Behälter:{' '}
                    <a href={`/boxes/${encodeURIComponent(res.item.BoxID)}`}>
                      {res.item.BoxID}
                    </a>
                  </>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
