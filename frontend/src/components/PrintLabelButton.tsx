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
      console.warn('Print aborted: missing id for print label button');
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

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor })
        });
      } catch (networkErr) {
        console.error('Print request failed to reach server', networkErr);
        setStatus('Server nicht erreichbar. Bitte erneut versuchen.');
        return;
      }

      let data: any = null;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.error('Failed to parse print response JSON', parseErr);
        setStatus('Antwort des Servers ungültig.');
        return;
      }

      if (!response.ok) {
        const message = typeof data?.error === 'string' && data.error.trim()
          ? data.error.trim()
          : `HTTP ${response.status}`;
        setStatus(`Fehler: ${message}`);
        console.error('Print request rejected', { boxId, itemId, status: response.status, message });
        return;
      }

      const template = typeof data?.template === 'string' ? data.template : '';
      if (!template) {
        console.error('Print response missing template', { boxId, itemId, data });
        setStatus('Vorlage fehlt in der Antwort.');
        return;
      }

      const payload = data?.payload;
      if (!payload || typeof payload !== 'object') {
        console.error('Print response missing payload', { boxId, itemId, data });
        setStatus('Payload fehlt in der Antwort.');
        return;
      }

      try {
        const result = openPrintLabel(template, payload);
        setStatus(result.status);
        if (result.success) {
          console.info('Print template opened successfully', { boxId, itemId, template });
        } else {
          console.warn('Print helper reported a warning', { boxId, itemId, template, status: result.status });
        }
      } catch (openErr) {
        console.error('Failed to open print template', openErr);
        setStatus('Druckfenster konnte nicht geöffnet werden.');
      }
    } catch (err) {
      console.error('Unexpected print failure', err);
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
