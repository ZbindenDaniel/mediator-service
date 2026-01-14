import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureUser } from '../lib/user';
import { requestPrintLabel } from '../utils/printLabelRequest';

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
      if (!actor) {
        console.warn('Print request blocked: no actor resolved for label print');
        setStatus('Kein Benutzername gesetzt.');
        return;
      }

      const result = await requestPrintLabel({ boxId, itemId, actor });
      if (!result.labelType || !result.entityId) {
        setStatus('Fehler: Ungültige ID.');
        return;
      }
      if (result.ok) {
        const data = result.data ?? {};
        setPreview(data.previewUrl || '');
        if (data.sent) {
          setStatus('Gesendet an Drucker');
        } else if (data.reason) {
          setStatus(`Druckfehler: ${data.reason}`);
        } else {
          setStatus('Vorschau bereit');
        }
      } else {
        setStatus('Error: ' + (result.data.error || result.data.reason || result.status));
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
