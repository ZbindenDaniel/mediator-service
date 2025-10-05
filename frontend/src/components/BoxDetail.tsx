import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateBoxCard from './RelocateBoxCard';
import AddItemToBoxDialog from './AddItemToBoxDialog';
import type { Box, ItemRecord, EventLog } from '../../../models';
import { formatDateTime } from '../lib/format';
import { getUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import BoxColorTag from './BoxColorTag';
import { coerceItemRecord } from '../lib/itemLayers';

interface Props {
  boxId: string;
}

function resolveActorName(actor?: string | null): string {
  return actor && actor.trim() ? actor : 'System';
}

export default function BoxDetail({ boxId }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const [removalStatus, setRemovalStatus] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  async function handleDeleteBox() {
    if (!box) return;
    if (!window.confirm('Behälter wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(box.BoxID)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser(), confirm: true })
      });
      if (res.ok) {
        navigate('/');
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error === 'box not empty' ? 'Behälter enthält noch Artikel' : 'Löschen fehlgeschlagen');
        console.error('Failed to delete box', res.status);
      }
    } catch (err) {
      console.error('Failed to delete box', err);
    }
  }

  async function removeItem(itemId: string) {
    const confirmed = window.confirm('Entnehmen?');
    if (!confirmed) {
      console.log('Item removal cancelled', { itemId });
      setRemovalStatus(prev => ({ ...prev, [itemId]: 'Entnahme abgebrochen' }));
      return;
    }
    console.log('Item removal confirmed', { itemId });
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser() })
      });
      if (res.ok) {
        setRemovalStatus(prev => ({ ...prev, [itemId]: 'Entnahme erfolgreich' }));
        await load();
        console.log('Item removal succeeded', { itemId });
      } else {
        console.error('Failed to remove item', res.status);
        setRemovalStatus(prev => ({ ...prev, [itemId]: 'Entnahme fehlgeschlagen' }));
      }
    } catch (err) {
      console.error('Failed to remove item', err);
      setRemovalStatus(prev => ({ ...prev, [itemId]: 'Entnahme fehlgeschlagen' }));
    }
  }
  async function load() {
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
      if (res.ok) {
        const data = await res.json();
        setBox(data.box);
        setNote(data.box?.Notes || '');
        const rawItems: unknown[] = Array.isArray(data.items) ? data.items : [];
        if (!Array.isArray(data.items)) {
          console.warn('BoxDetail: unexpected items payload', data.items);
        }
        const parsed = rawItems
          .map((entry, index) => coerceItemRecord(entry, `box-detail-${index}`))
          .filter((entry): entry is ItemRecord => Boolean(entry));
        setItems(parsed);
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

  // TODO: Replace client-side slicing once the activities page provides pagination.
  const displayedEvents = useMemo(() => events.slice(0, 5), [events]);

  return (
    <div className="container box">
      <div className="grid landing-grid">
        {box ? (
          <>
            <div className="card">
              <h2 className='mono'>{box.BoxID}</h2>
              <table className="details">
                <tbody>
                  <tr>
                    <th>Standort</th>
                    <td><BoxColorTag locationKey={box.Location} /></td>
                  </tr>
                  <tr>
                    <th>Platziert am</th>
                    <td>{box.PlacedAt ? formatDateTime(box.PlacedAt) : ''}</td>
                  </tr>
                  <tr>
                    <th>Platziert von</th>
                    <td>{box.PlacedBy ?? 'Niemandem!'}</td>
                  </tr>
                </tbody>
              </table>
              <div className='row'>
                <button type="button" className="btn danger" onClick={handleDeleteBox}>Löschen</button>
              </div>
            </div>

            <RelocateBoxCard boxId={box.BoxID} onMoved={load} />

            {box.Location && (
              <><PrintLabelButton boxId={box.BoxID} /><div className="card">
                <h3>Notizen</h3>
                <form onSubmit={async (e) => {
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
                } }>
                  <div className='container'>
                    <div className='row'>
                      <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={Math.max(3, note.split('\n').length)} />
                    </div>

                    <div className='row'>
                      <button type="submit">Speichern</button>
                    </div>

                    <div className='row'>
                      {noteStatus && <span className="muted"> {noteStatus}</span>}
                    </div>
                  </div>
                </form>
              </div></>
            )}

            <div className="card">
              <h3>Artikel</h3>
              <div className='container'>
                <div className='row'>
                  <div className="item-cards">
                    {items.map((it) => (
                      <div key={it.ItemUUID} className="card item-card">
                        <Link to={`/items/${encodeURIComponent(it.ItemUUID)}`} className="linkcard">
                          <div className="mono">{it.BoxID || ''}</div>
                          <div className="mono">{it.Artikel_Nummer || it.ItemUUID}</div>
                          <div>{it.Artikelbeschreibung}</div>
                          <div className="muted">Auf Lager: {it.Auf_Lager}</div>
                        </Link>
                        <div className='row'>
                          <button type="button" className="btn" onClick={() => removeItem(it.ItemUUID)}>Entnehmen</button>
                        </div>
                        {removalStatus[it.ItemUUID] && (
                          <div className='row'>
                            <span className="muted">{removalStatus[it.ItemUUID]}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className='row'>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => navigate(`/items/new?box=${encodeURIComponent(boxId)}`)}
                  >
                    neu
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowAdd(true)}
                    style={{ marginLeft: '6px' }}
                  >
                    hinzufügen
                  </button>
                </div>
                {showAdd && (
                  <AddItemToBoxDialog
                    boxId={boxId}
                    onAdded={load}
                    onClose={() => setShowAdd(false)}
                  />
                )}
              </div>
            </div>

            <div className="card">
              <h3>Aktivitäten</h3>
              <ul className="events">
                {displayedEvents.map((ev) => (
                  <li key={ev.Id}>
                    {formatDateTime(ev.CreatedAt)}: {resolveActorName(ev.Actor)}{' hat ' + eventLabel(ev.Event)}
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
