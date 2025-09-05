import React, { useState } from 'react';

interface Props {
  boxId: string;
}

const LOC_RE = /^[A-Z]-\d{2}-\d{2}$/;

export default function RelocateBoxCard({ boxId }: Props) {
  const [location, setLocation] = useState('');
  const [actor, setActor] = useState('');
  const [status, setStatus] = useState('');

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!LOC_RE.test(location.trim().toUpperCase())) {
      setStatus('Format z.B. A-01-01');
      return;
    }
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: location.trim().toUpperCase(), actor })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Box verschoben');
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      console.log('relocate box', res.status);
    } catch (err) {
      console.error('Relocate box failed', err);
      setStatus('Verschieben fehlgeschlagen');
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Box umlagern</h3>
      <form onSubmit={handle}>
        <label>
          Neuer Ort
          <input value={location} onChange={e => setLocation(e.target.value)} required />
        </label>
        <label>
          Nutzer
          <input value={actor} onChange={e => setActor(e.target.value)} required />
        </label>
        <button type="submit">Verschieben</button>
        {status && <div>{status}</div>}
      </form>
    </div>
  );
}
