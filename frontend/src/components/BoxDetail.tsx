import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateBoxCard from './RelocateBoxCard';
import type { Box, Item, EventLog } from '../../../models';
import { formatDateTime } from '../lib/format';
import { getUser } from '../lib/user';
import{ eventLabel } from '../../../models/event-labels';

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

  async function handleDeleteBox() {
    if (!box) return;
    if (!window.confirm('Box wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(box.BoxID)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser(), confirm: true })
      });
      if (res.ok) {
        navigate('/');
      } else {
        console.error('Failed to delete box', res.status);
      }
    } catch (err) {
      console.error('Failed to delete box', err);
    }
  }

  async function removeItem(itemId: string) {
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser() })
      });
      if (res.ok) {
        load();
      } else {
        console.error('Failed to remove item', res.status);
      }
    } catch (err) {
      console.error('Failed to remove item', err);
    }
  }
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

              <table className="details">
                <tbody>
                  {([
                    ['Standort', box.Location ?? 'kein Standort!'],
                    ['Platziert von', box.PlacedBy ?? 'Niemandem!'],
                    // ['', box.CreatedAt ? formatDateTime(box.CreatedAt) : ''],
                    ['Platziert am', box.PlacedAt ? formatDateTime(box.PlacedAt) : '']
                  ] as [string, any][]).map(([k, v]) => (
                    <tr key={k}>
                      <th>{k}</th>
                      <td>{v ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className='row'>
                <button type="button" className="btn danger" onClick={handleDeleteBox}>Löschen</button>
              </div>
            </div>

            <RelocateBoxCard boxId={box.BoxID} onMoved={load} />

            {box.Location && (
              <PrintLabelButton boxId={box.BoxID} />
            )}

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
                <div className='container'>
                  <div className='row'>
                    <textarea value={note} onChange={e => setNote(e.target.value)} />
                  </div>

                  <div className='row'>
                    <button type="submit">Speichern</button>
                  </div>

                  <div className='row'>
                    {noteStatus && <span className="muted"> {noteStatus}</span>}
                  </div>
                </div>
              </form>
            </div>

            <div className="card">
              <h3>Artikel</h3>
              <div className='container'>
                <div className='row'>
                  <div className="item-cards">
                    {items.map((it) => (
                      <div key={it.ItemUUID} className="card item-card">
                        <Link to={`/items/${encodeURIComponent(it.ItemUUID)}`} className="linkcard">
                          <div className="mono">{it.Artikel_Nummer || it.ItemUUID}</div>
                          <div>{it.Artikelbeschreibung}</div>
                          <div className="muted">Auf Lager: {it.Auf_Lager}</div>
                        </Link>
                        <button type="button" className="btn" onClick={() => removeItem(it.ItemUUID)}>Entnehmen</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='row'>
                  <button type="button" className="btn" onClick={() => navigate(`/items/new?box=${encodeURIComponent(boxId)}`)}>+</button>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Events</h3>
              <ul className="events">
                {events.map((ev) => (
                  <li key={ev.Id}>
                    {formatDateTime(ev.CreatedAt)}: {ev.Actor ? ev.Actor : 'wer?'}{' hat '+eventLabel(ev.Event)}
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
