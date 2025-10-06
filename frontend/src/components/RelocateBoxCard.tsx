import React, { useMemo, useState } from 'react';
import { ensureUser } from '../lib/user';
import { BOX_COLORS } from '../data/boxColors';
import { dialogService } from './dialog';

interface Props {
  boxId: string;
  onMoved?: () => void;
}

export default function RelocateBoxCard({ boxId, onMoved }: Props) {
  const [selectedColor, setSelectedColor] = useState('');
  const [status, setStatus] = useState('');
  const colorLookup = useMemo(() => new Map(BOX_COLORS.map(color => [color.key, color])), []);

  function normalizeSegment(value: string) {
    return value.replace(/[^0-9]/g, '').slice(0, 2);
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const colorKey = selectedColor.trim().toUpperCase();
    const colorOption = colorLookup.get(colorKey);

    if (!colorOption) {
      console.warn('Invalid color selection for relocation', { boxId, colorKey });
      setStatus('Bitte eine Farbe wählen');
      return;
    }

    const location = `${colorKey}`;

    const actor = await ensureUser();
    if (!actor) {
      console.info('Relocate box aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for box relocation', error);
      }
      return;
    }

    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, actor })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Behälter verschoben');
        onMoved?.();
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      console.log('relocate box', { status: res.status, location });
    } catch (err) {
      console.error('Relocate box failed', err);
      setStatus('Verschieben fehlgeschlagen');
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Behälter umlagern</h3>
      <form onSubmit={handle}>
        <div className=''>
          <div className='row'>
            <label>
              Neuer Ort
            </label>
          </div>
          <div className='row' style={{ gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={selectedColor}
              onChange={e => setSelectedColor(e.target.value)}
              required
            >
              <option value="" disabled>
                Farbe wählen
              </option>
              {BOX_COLORS.map(color => (
                <option
                  key={color.key}
                  value={color.key}
                  style={{ backgroundColor: color.hex, color: '#fff' }}
                >
                  {color.label}
                </option>
              ))}
            </select>
           </div>

          <div className='row'>
            <button type="submit">Verschieben</button>
          </div>

          <div className='row'>
            {status && <div>{status}</div>}
          </div>
        </div>
      </form>
    </div>
  );
}
