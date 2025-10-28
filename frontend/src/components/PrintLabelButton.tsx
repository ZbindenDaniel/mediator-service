import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureUser } from '../lib/user';

interface Props {
  boxId?: string;
  itemId?: string;
}

export default function PrintLabelButton({ boxId, itemId }: Props) {
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');

  async function handleClick() {
    try {
      setStatus('drucken...');
      const actor = (await ensureUser()).trim();
      if (!actor) {
        console.warn('Print request blocked: no actor resolved for label print');
        setStatus('Kein Benutzername gesetzt.');
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
