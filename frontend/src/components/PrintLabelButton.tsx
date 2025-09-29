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
      // TODO: Include actor metadata in the print request body once the backend accepts it.
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (!data.template || !data.payload) {
        throw new Error('Antwort unvollständig.');
      }

      const result = openPrintLabel(data.template, data.payload);
      setStatus(result.status);
      if (!result.success) {
        console.warn('Print window could not be opened for payload', {
          template: data.template,
          boxId,
          itemId,
        });
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
