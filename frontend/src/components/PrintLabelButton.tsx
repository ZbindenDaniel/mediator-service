import React, { useState } from 'react';
import type { PrintLabelType } from '../../../models';
import { ensureUser } from '../lib/user';
import { requestPrintLabel } from '../utils/printLabelRequest';

interface Props {
  boxId?: string;
  itemId?: string;
  onPrintStart?: (context: { boxId?: string; itemId?: string }) => void;
}

export default function PrintLabelButton({ boxId, itemId, onPrintStart }: Props) {
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState('');

  // TODO(ui): Reconfirm status spacing once the grid layout for print cards is finalized.
  // TODO(agent): Review spacing and status copy when embedding this button in success dialogs.
  // TODO(agent): Align print label payloads with backend actor + labelType expectations.
  // TODO(agent): Surface label type and entity metadata in status output for troubleshooting.
  // TODO(agent): Reconfirm gross/klein copy with warehouse to align with label roll naming.
  function resolveItemLabelType(): PrintLabelType | null {
    const choice = window.prompt('Label drucken: "Gross" oder "Klein"?', 'Gross');
    if (choice === null) {
      setStatus('Druck abgebrochen.');
      return null;
    }
    const normalized = choice.trim().toLowerCase();
    if (!normalized) {
      setStatus('Bitte "Gross" oder "Klein" auswählen.');
      return null;
    }
    if (normalized === 'klein' || normalized === 'k') {
      return 'smallitem';
    }
    if (normalized === 'gross' || normalized === 'groß' || normalized === 'g') {
      return 'item';
    }
    console.warn('Unknown item label choice', { choice });
    setStatus('Ungültige Auswahl. Bitte "Gross" oder "Klein" eingeben.');
    return null;
  }

  async function handleClick(event?: React.MouseEvent<HTMLElement>) {
    try {
      event?.preventDefault();
      setStatus('drucken...');
      const actor = (await ensureUser()).trim();
      if (!actor) {
        console.warn('Print request blocked: no actor resolved for label print');
        setStatus('Kein Benutzername gesetzt.');
        return;
      }

      const labelTypeOverride = itemId && !boxId ? resolveItemLabelType() : undefined;
      if (itemId && !boxId && !labelTypeOverride) {
        return;
      }

      onPrintStart?.({ boxId, itemId });
      const result = await requestPrintLabel({ boxId, itemId, actor, labelTypeOverride });
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
        console.error('Print request returned non-OK status', {
          status: result.status,
          labelType: result.labelType,
          entityId: result.entityId,
          error: result.data?.error || result.data?.reason
        });
        setStatus('Error: ' + (result.data.error || result.data.reason || result.status));
      }
    } catch (err) {
      console.error('Print failed', err);
      setStatus('Print failed');
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{ width: '70%', margin: 'auto', marginTop: '8px'}}>
        <button id='printlabelbutton' type="button" className="btn" onClick={handleClick}>
          Label drucken
        </button>
        </h3>
      </div>
      {status && (
        <div>
          {status}
          {preview && (
            <> – <a className="mono" href={preview} target="_blank" rel="noopener">PDF</a></>
          )}
        </div>
      )}
    </div>
  );
}
