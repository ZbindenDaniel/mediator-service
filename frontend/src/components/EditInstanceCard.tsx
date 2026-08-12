import React, { useState } from 'react';
import { ItemEinheit, type Item } from '../../../models';
import { ensureUser } from '../lib/user';
import { parseLangtext } from '../lib/langtext';

interface SpecRow {
  key: string;
  value: string;
}

interface Props {
  itemId: string;
  einheit: ItemEinheit | string | null | undefined;
  currentSerialNumber: string | null | undefined;
  currentMacAddress: string | null | undefined;
  currentInstanceSpecs: Item['InstanceSpecs'];
  onSaved: () => void;
  onCancel: () => void;
}

function initialSpecRows(specs: Item['InstanceSpecs']): SpecRow[] {
  const parsed = parseLangtext(specs ?? '');
  if (parsed.kind === 'json') {
    return parsed.entries.map((e) => ({ key: e.key, value: e.value }));
  }
  return [];
}

export default function EditInstanceCard({
  itemId,
  einheit,
  currentSerialNumber,
  currentMacAddress,
  currentInstanceSpecs,
  onSaved,
  onCancel
}: Props) {
  const isMenge = einheit === ItemEinheit.Menge;

  const [serialNumber, setSerialNumber] = useState(currentSerialNumber ?? '');
  const [macAddress, setMacAddress] = useState(currentMacAddress ?? '');
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => initialSpecRows(currentInstanceSpecs));
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  function updateSpecRow(index: number, patch: Partial<SpecRow>) {
    setSpecRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeSpecRow(index: number) {
    setSpecRows((rows) => rows.filter((_, i) => i !== index));
  }

  function addSpecRow() {
    setSpecRows((rows) => [...rows, { key: '', value: '' }]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const actor = await ensureUser();
    if (!actor) return;

    const body: Record<string, unknown> = { actor };
    if (!isMenge) {
      body.SerialNumber = serialNumber.trim() || null;
      body.MacAddress = macAddress.trim() || null;
    }

    // Full-replace: send the whole desired spec map so removed rows are actually deleted server-side.
    const specs: Record<string, string> = {};
    for (const row of specRows) {
      const key = row.key.trim();
      const value = row.value.trim();
      if (key && value) specs[key] = value;
    }
    body.InstanceSpecs = specs;

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
          <label>Spezifikationen</label>
          {specRows.length === 0 && (
            <p className="muted">Keine Spezifikationen. Mit „+ Feld hinzufügen“ ergänzen.</p>
          )}
          {specRows.map((row, index) => (
            <div className="edit-instance-spec-row" key={index}>
              <input
                value={row.key}
                onChange={(e) => updateSpecRow(index, { key: e.target.value })}
                placeholder="Feld (z. B. RAM)"
                aria-label="Spezifikation Feld"
                disabled={saving}
              />
              <input
                value={row.value}
                onChange={(e) => updateSpecRow(index, { value: e.target.value })}
                placeholder="Wert (z. B. 16 GB)"
                aria-label="Spezifikation Wert"
                disabled={saving}
              />
              <button
                type="button"
                className="btn btn--small"
                onClick={() => removeSpecRow(index)}
                aria-label="Spezifikation entfernen"
                disabled={saving}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--small" onClick={addSpecRow} disabled={saving}>
            + Feld hinzufügen
          </button>
        </div>

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
