import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Item } from '../../../models';

function looksLikeUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function looksLikeBox(s: string) {
  return /^BOX[-\s_]\d{4}[-\s_]\d{3,}$/i.test(s);
}

export default function SearchCard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const navigate = useNavigate();

  async function runFind() {
    const v = query.trim();
    setResults([]);
    if (!v) return;
    if (looksLikeUuid(v)) { navigate(`/items/${encodeURIComponent(v)}`); return; }
    if (looksLikeBox(v)) {
      const norm = v.toUpperCase().replace(/\s|_/g, '-');
      navigate(`/boxes/${encodeURIComponent(norm)}`);
      return;
    }
    try {
      const r = await fetch('/api/search?material=' + encodeURIComponent(v));
      const data = await r.json();
      setResults(data.items || []);
      console.log('Material search returned', (data.items || []).length, 'items');
    } catch (err) {
      console.error('Material search failed', err);
    }
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
        {results.map(it => (
          <div className="card" key={it.ItemUUID}>
            <div>
              <b>{it.Artikel_Nummer || '(kein Artikel)'}</b><br />
              <span className="pill mono">{(it.ItemUUID || '').slice(-6).toUpperCase()}</span>
            </div>
            <div className="muted">{it.Artikelbeschreibung || ''}</div>
            <div>Box: <a className="mono" href={`/boxes/${encodeURIComponent(it.BoxID)}`}>{it.BoxID}</a></div>
          </div>
        ))}
      </div>
    </div>
  );
}
