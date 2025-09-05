import React, { useState } from 'react';
import type { Item } from '../../../models';

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function looksLikeBox(s: string) {
  return /^BOX[-\s_]\d{4}[-\s_]\d{3,}$/i.test(s);
}

type SearchResult = { type: 'box'; id: string } | { type: 'item'; item: Item };

export default function SearchCard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  async function runFind() {
    const v = query.trim();
    setResults([]);
    if (!v) return;
    const next: SearchResult[] = [];
    if (looksLikeUuid(v)) {
      try {
        const r = await fetch(`/api/items/${encodeURIComponent(v)}`);
        if (!r.ok) {
          console.error('UUID search HTTP error', r.status);
        } else {
          const data = await r.json();
          next.push({ type: 'item', item: data.item || data });
          console.log('UUID search found item');
        }
      } catch (err) {
        console.error('UUID search failed', err);
      }
    } else if (looksLikeBox(v)) {
      const norm = v.toUpperCase().replace(/\s|_/g, '-');
      next.push({ type: 'box', id: norm });
      console.log('Box search detected', norm);
    } else {
      try {
        const r = await fetch('/api/search?term=' + encodeURIComponent(v));
        if (!r.ok) {
          console.error('Search HTTP error', r.status);
        } else {
          const data = await r.json();
          (data.items || []).forEach((it: Item) => next.push({ type: 'item', item: it }));
          console.log('Search returned', (data.items || []).length, 'items');
        }
      } catch (err) {
        console.error('Search failed', err);
      }
    }
    setResults(next);
  }

  return (
    <div className="card" id="find">
      <h2>Artikel finden</h2>
      <div className="row">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Material, BOX-…, oder UUID"
          onKeyDown={e => { if (e.key === 'Enter') runFind(); }}
          autoFocus
        />
        <button className="btn" onClick={runFind}>Suchen</button>
      </div>
      <div className="list" style={{ marginTop: '10px' }}>
        {results.map((res, idx) => res.type === 'box' ? (
          <div className="card" key={`b-${idx}`}>
            <div>Box: <a className="mono" href={`/boxes/${encodeURIComponent(res.id)}`}>{res.id}</a></div>
          </div>
        ) : (
          <div className="card" key={res.item.ItemUUID}>
            <div>
              <b><a href={`/items/${encodeURIComponent(res.item.ItemUUID)}`}>{res.item.Artikel_Nummer || '(kein Artikel)'}</a></b><br />
              <span className="pill mono">{(res.item.ItemUUID || '').slice(-6).toUpperCase()}</span>
            </div>
            <div className="muted">{res.item.Artikelbeschreibung || ''}</div>
            <div>Box: <a className="mono" href={`/boxes/${encodeURIComponent(res.item.BoxID)}`}>{res.item.BoxID}</a></div>
          </div>
        ))}
      </div>
    </div>
  );
}
