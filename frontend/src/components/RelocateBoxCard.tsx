import React, { useMemo, useState } from 'react';
import { getUser } from '../lib/user';
import { BOX_COLORS } from '../data/boxColors';

interface Props {
  boxId: string;
  onMoved?: () => void;
}

export default function RelocateBoxCard({ boxId, onMoved }: Props) {
  const [selectedColor, setSelectedColor] = useState('');
  const [status, setStatus] = useState('');
  const colorLookup = useMemo(() => new Map(BOX_COLORS.map(color => [color.value, color])), []);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const colorKey = selectedColor.trim();
    const colorOption = colorLookup.get(colorKey);
    if (!colorOption) {
      console.warn('Invalid color selection for relocation', { boxId, colorKey });
      setStatus('Bitte eine Farbe wählen');
      return;
    }
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: colorOption.value, actor: getUser() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('Behälter verschoben');
        onMoved?.();
      } else {
        setStatus('Fehler: ' + (data.error || res.status));
      }
      console.log('relocate box', { status: res.status, color: colorOption.value });
    } catch (err) {
      console.error('Relocate box failed', err);
      setStatus('Verschieben fehlgeschlagen');
    }
  }

  return (
    <div className="card relocate-card">
      <h3>Behälter umlagern</h3>
      <form onSubmit={handle}>
        <div className='container'>
          <div className='row'>
            <label>
              Neuer Ort
            </label>
            <select value={selectedColor} onChange={e => setSelectedColor(e.target.value)} required>
              <option value="" disabled>
                Farbe wählen
              </option>
              {BOX_COLORS.map(color => (
                <option
                  key={color.value}
                  value={color.value}
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
