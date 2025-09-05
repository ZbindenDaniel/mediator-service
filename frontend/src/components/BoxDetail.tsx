import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateBoxCard from './RelocateBoxCard';
import type { Box, Item, EventLog } from '../../../models';
import { formatDateTime } from '../lib/format';
import { getUser } from '../lib/user';

interface Props {
  boxId: string;
}

export default function BoxDetail({ boxId }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const navigate = useNavigate();
  async function load() {
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
      if (res.ok) {
        const data = await res.json();
        setBox(data.box);
        setNote(data.box?.Notes || '');
        setItems(data.items || []);
        setEvents(data.events || []);
      } else {
        console.error('Failed to fetch box', res.status);
      }
    } catch (err) {
      console.error('Failed to fetch box', err);
    }
  }

  useEffect(() => {
    load();
  }, [boxId]);

  return (
    <div className="container box">
      <div className="grid landing-grid">
      {box ? (
        <>
          <div className="card">
            <h2>Box {box.Location || ''}</h2>
            {!box.Location && <div className="warning">Box hat keinen Standort!</div>}
            <table className="details">
              <tbody>
                {([
                  ['Location', box.Location],
                  ['PlacedBy', box.PlacedBy],
                  ['CreatedAt', box.CreatedAt ? formatDateTime(box.CreatedAt) : ''],
                  ['PlacedAt', box.PlacedAt ? formatDateTime(box.PlacedAt) : '']
                ] as [string, any][]).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Notizen</h3>
            <form onSubmit={async e => {
              e.preventDefault();
              try {
                const res = await fetch(`/api/boxes/${encodeURIComponent(box.BoxID)}/move`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ notes: note, location: box.Location, actor: getUser() })
                });
                if (res.ok) {
                  setBox(b => b ? { ...b, Notes: note } : b);
                  setNoteStatus('gespeichert');
                } else {
                  setNoteStatus('Fehler');
                }
              } catch (err) {
                console.error('Note save failed', err);
                setNoteStatus('Fehler');
              }
            }}>
              <input value={note} onChange={e => setNote(e.target.value)} />
              <button type="submit">Speichern</button>
              {noteStatus && <span className="muted"> {noteStatus}</span>}
            </form>
          </div>

            <PrintLabelButton boxId={box.BoxID} />

          <RelocateBoxCard boxId={box.BoxID} onMoved={load} />

          <div className="card">
            <div className="row between">
              <h3>Items</h3>
              <button type="button" className="btn" onClick={() => navigate(`/items/new?box=${encodeURIComponent(boxId)}`)}>+</button>
            </div>
            <div className="item-cards">
              {items.map((it) => (
                <Link key={it.ItemUUID} to={`/items/${encodeURIComponent(it.ItemUUID)}`} className="card item-card linkcard">
                  <div className="mono">{it.Artikel_Nummer || it.ItemUUID}</div>
                  <div>{it.Artikelbeschreibung}</div>
                  <div className="muted">Auf Lager: {it.Auf_Lager}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Events</h3>
            <ul className="events">
              {events.map((ev) => (
                <li key={ev.Id}>
                  {formatDateTime(ev.CreatedAt)}: {ev.Actor ? ev.Actor + ' ' : ''}{ev.Event}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </div>
    </div>
  );
}
