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

  async function handleCreateBox() {
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Box erstellt. Bitte platzieren!');
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      console.log('create box', res.status);
    } catch (err) {
      console.error('Create box failed', err);
      setStatus('Box anlegen fehlgeschlagen');
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Artikel umlagern</h3>
      <form onSubmit={handle}>
        <div className='container'>
          <div className='row'>
            <label>
              Ziel BoxID
            </label>
          </div>

          <div className='row'>
            <input list="box-suggest" value={boxId} onChange={e => setBoxId(e.target.value)} required />
          </div>

          <div className='row'>
            <datalist id="box-suggest">
              {suggestions.map(b => (
                <option key={b.BoxID} value={b.BoxID}>{b.Location}</option>
              ))}
            </datalist>
          </div>

          <div className='row'>
            <button type="submit">Verschieben</button>
            <button type="button" onClick={handleCreateBox}>Box anlegen</button>
          </div>
          
          <div className='row'>
            {status && <div>{status}</div>}
          </div>
        </div>
      </form>
    </div>
  );
}
