import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { openPrintLabel } from '../lib/printLabel';
import { getUser } from '../lib/user';

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
      const actor = getUser().trim();
      if (!actor) {
        console.warn('Print aborted: no actor available for request', { boxId, itemId });
        setStatus('Kein Benutzername hinterlegt. Bitte im Kopfbereich doppelklicken, um ihn zu setzen.');
        return;
      }
      const url = boxId
        ? `/api/print/box/${encodeURIComponent(boxId)}`
        : `/api/print/item/${encodeURIComponent(itemId || '')}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (typeof data.template !== 'string' || !data.template.trim()) {
        throw new Error('Ungültige Druckvorlage.');
      }
      if (data.payload === undefined) {
        throw new Error('Antwort ohne Payload erhalten.');
      }

      const template = data.template.trim();
      const payload = data.payload;
      const result = openPrintLabel(template, payload);
      setStatus(result.status);
      if (!result.success) {
        console.warn('Print window could not be opened for payload', {
          template,
          boxId,
          itemId,
        });
      } else {
        console.info('Label print flow initiated', {
          template,
          hasPayload: Boolean(payload),
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
