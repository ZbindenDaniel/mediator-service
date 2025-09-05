import React, { useState } from 'react';
import { getUser } from '../lib/user';

interface Props {
  itemId: string;
}

export default function RelocateItemCard({ itemId }: Props) {
  const [boxId, setBoxId] = useState('');
  const [status, setStatus] = useState('');

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
          <input value={boxId} onChange={e => setBoxId(e.target.value)} required />
        </label>
        <button type="submit">Verschieben</button>
        {status && <div>{status}</div>}
      </form>
    </div>
  );
}
