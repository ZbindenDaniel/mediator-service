import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureUser } from '../lib/user';
import { logError } from '../utils/logger';

interface Props {
  boxId?: string;
  itemId?: string;
}

export default function PrintLabelButton({ boxId, itemId }: Props) {
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');

  // TODO(agent): Review spacing and status copy when embedding this button in success dialogs.
  // TODO(agent): Align print label payloads with backend actor + labelType expectations.
  async function handleClick() {
    try {
      setStatus('drucken...');
      const actor = (await ensureUser()).trim();
      const labelType = boxId ? (boxId.startsWith('S-') ? 'shelf' : 'box') : itemId ? 'item' : '';
      const entityId = boxId || itemId || '';
      if (!actor) {
        console.warn('Print request blocked: no actor resolved for label print');
        setStatus('Kein Benutzername gesetzt.');
        return;
      }
      if (!labelType || !entityId) {
        logError('Print request blocked: invalid label metadata', undefined, { labelType, entityId, boxId, itemId });
        setStatus('Fehler: Ungültige ID.');
        return;
      }
      const url = boxId
        ? `/api/print/box/${encodeURIComponent(boxId)}`
        : `/api/print/item/${encodeURIComponent(itemId || '')}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor, labelType })
        });
      } catch (err) {
        logError('Print request failed', err, { labelType, entityId });
        setStatus('Print failed');
        return;
      }
      let data: { previewUrl?: string; sent?: boolean; reason?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch (err) {
        logError('Failed to parse print response', err, { labelType, entityId });
      }
      if (res.ok) {
        setPreview(data.previewUrl || '');
        if (data.sent) {
          setStatus('Gesendet an Drucker');
        } else if (data.reason) {
          setStatus(`Druckfehler: ${data.reason}`);
        } else {
          setStatus('Vorschau bereit');
        }
      } else {
        setStatus('Error: ' + (data.error || res.status));
      }
    } catch (err) {
      console.error('Print failed', err);
      setStatus('Print failed');
    }
  }

  return (
    <div>
      <div className="card linkcard">
        <Link className="linkcard" onClick={handleClick} to={''}>
          <h3>Label drucken</h3>
        </Link>
        {status && <div>{status}{preview && (
          <> – <a className="mono" href={preview} target="_blank" rel="noopener">PDF</a></>
        )}</div>}
      </div>
    </div>
  );
}
