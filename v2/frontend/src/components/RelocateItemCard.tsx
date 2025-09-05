import React, { useEffect, useState } from 'react';
import { getUser } from '../lib/user';

interface Props {
  itemId: string;
}

export default function RelocateItemCard({ itemId }: Props) {
  const [boxId, setBoxId] = useState('');
  const [suggestions, setSuggestions] = useState<{ BoxID: string; Location: string }[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const v = boxId.trim();
    if (v.length < 2) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    async function search() {
      try {
        const r = await fetch('/api/search?term=' + encodeURIComponent(v), { signal: ctrl.signal });
        const data = await r.json().catch(() => ({}));
        setSuggestions(data.boxes || []);
      } catch (err) {
        if ((err as any).name !== 'AbortError') console.error('box search failed', err);
      }
    }
    search();
    return () => ctrl.abort();
  }, [boxId]);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    try {
      const check = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
      if (!check.ok) {
        setStatus('Box existiert nicht');
        return;
      }
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: boxId, actor: getUser() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Item verschoben');
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      console.log('relocate item', res.status);
    } catch (err) {
      console.error('Relocate item failed', err);
      setStatus('Verschieben fehlgeschlagen');
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Item umlagern</h3>
      <form onSubmit={handle}>
        <label>
          Ziel BoxID
          <input list="box-suggest" value={boxId} onChange={e => setBoxId(e.target.value)} required />
          <datalist id="box-suggest">
            {suggestions.map(b => (
              <option key={b.BoxID} value={b.BoxID}>{b.Location}</option>
            ))}
          </datalist>
        </label>
        <button type="submit">Verschieben</button>
        {status && <div>{status}</div>}
      </form>
    </div>
  );
}
