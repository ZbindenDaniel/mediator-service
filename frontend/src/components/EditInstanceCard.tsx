import React, { useState } from 'react';
import { ItemEinheit } from '../../../models';
import { ensureUser } from '../lib/user';

interface Props {
  itemId: string;
  einheit: ItemEinheit | string | null | undefined;
  currentSerialNumber: string | null | undefined;
  currentMacAddress: string | null | undefined;
  onSaved: () => void;
  onCancel: () => void;
}

export default function EditInstanceCard({
  itemId,
  einheit,
  currentSerialNumber,
  currentMacAddress,
  onSaved,
  onCancel
}: Props) {
  const isMenge = einheit === ItemEinheit.Menge;

  const [serialNumber, setSerialNumber] = useState(currentSerialNumber ?? '');
  const [macAddress, setMacAddress] = useState(currentMacAddress ?? '');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const actor = await ensureUser();
    if (!actor) return;

    const body: Record<string, unknown> = { actor };
    if (!isMenge) {
      body.SerialNumber = serialNumber.trim() || null;
      body.MacAddress = macAddress.trim() || null;
    }

    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/instance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onSaved();
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
    } catch (err) {
      console.error('[EditInstanceCard] Save failed', err);
      setStatus('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>Instanz bearbeiten</h3>
      <form onSubmit={(e) => void handleSubmit(e)}>
        {!isMenge && (
          <div className="row">
            <label>Seriennummer</label>
            <input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="Seriennummer"
              disabled={saving}
            />
          </div>
        )}

        {!isMenge && (
          <div className="row">
            <label>MAC-Adresse</label>
            <input
              value={macAddress}
              onChange={(e) => setMacAddress(e.target.value)}
              placeholder="MAC-Adresse"
              disabled={saving}
            />
          </div>
        )}

        <div className="row">
          <div className="button-group">
            <button type="submit" disabled={saving}>Speichern</button>
            <button type="button" onClick={onCancel} disabled={saving}>Abbrechen</button>
          </div>
        </div>

        {status && <div className="row"><span className="muted">{status}</span></div>}
      </form>
    </div>
  );
}
