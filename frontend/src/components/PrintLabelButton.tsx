import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { openPrintLabel } from '../lib/printLabel';

interface Props {
  boxId?: string;
  itemId?: string;
}

export default function PrintLabelButton({ boxId, itemId }: Props) {
  const [status, setStatus] = useState('');

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (!boxId && !itemId) {
      setStatus('Keine ID angegeben.');
      return;
    }
    try {
      setStatus('Lade Etikett…');
      const url = boxId
        ? `/api/print/box/${encodeURIComponent(boxId)}`
        : `/api/print/item/${encodeURIComponent(itemId || '')}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (data.format && data.format !== 'inline-html') {
        throw new Error(`Unbekanntes Druckformat: ${data.format}`);
      }
      if (!data.payload) {
        throw new Error('Antwort unvollständig.');
      }

      const result = openPrintLabel(data.payload);
      setStatus(result.status);
      if (!result.success) {
        return;
      }
    } catch (err) {
      console.error('Print failed', err);
      const message = err instanceof Error ? err.message : 'unbekannter Fehler';
      setStatus(`Fehler: ${message}`);
    }
  }

  return (
    <div>
      <div className="card linkcard">
        <Link className="linkcard" onClick={handleClick} to="">
          <h3>Label drucken</h3>
        </Link>
        {status && <div>{status}</div>}
      </div>
    </div>
  );
}
