import React, { useMemo, useState } from 'react';
import { getUser } from '../lib/user';
import { BOX_COLORS } from '../data/boxColors';

interface Props {
  boxId: string;
  onMoved?: () => void;
}

export default function RelocateBoxCard({ boxId, onMoved }: Props) {
  const [selectedColor, setSelectedColor] = useState('');
  const [rowSegment, setRowSegment] = useState('');
  const [columnSegment, setColumnSegment] = useState('');
  const [status, setStatus] = useState('');
  const colorLookup = useMemo(() => new Map(BOX_COLORS.map(color => [color.key, color])), []);

  function normalizeSegment(value: string) {
    return value.replace(/[^0-9]/g, '').slice(0, 2);
  }

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const colorKey = selectedColor.trim().toUpperCase();
    const normalizedRow = normalizeSegment(rowSegment).padStart(2, '0');
    const normalizedColumn = normalizeSegment(columnSegment).padStart(2, '0');
    const colorOption = colorLookup.get(colorKey);

    if (!colorOption) {
      console.warn('Invalid color selection for relocation', { boxId, colorKey });
      setStatus('Bitte eine Farbe wählen');
      return;
    }

    if (!rowSegment || !columnSegment) {
      console.warn('Missing location segment(s) for relocation', {
        boxId,
        rowSegment,
        columnSegment
      });
      setStatus('Reihe und Spalte angeben');
      return;
    }

    const location = `${colorKey}-${normalizedRow}-${normalizedColumn}`;

    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, actor: getUser() })
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
        <div className='container'>
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
            <input
              type="text"
              inputMode="numeric"
              pattern="\\d{1,2}"
              placeholder="Reihe"
              value={rowSegment}
              onChange={e => setRowSegment(normalizeSegment(e.target.value))}
              required
              style={{ width: '4rem' }}
            />
            <input
              type="text"
              inputMode="numeric"
              pattern="\\d{1,2}"
              placeholder="Spalte"
              value={columnSegment}
              onChange={e => setColumnSegment(normalizeSegment(e.target.value))}
              required
              style={{ width: '4rem' }}
            />
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
