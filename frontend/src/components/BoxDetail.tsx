import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateBoxCard from './RelocateBoxCard';
import AddItemToBoxDialog from './AddItemToBoxDialog';
import type { Box, Item, EventLog } from '../../../models';
import { formatDateTime } from '../lib/format';
import { ensureUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import BoxColorTag from './BoxColorTag';
import { dialogService } from './dialog';

interface Props {
  boxId: string;
}

function resolveActorName(actor?: string | null): string {
  return actor && actor.trim() ? actor : 'System';
}

export default function BoxDetail({ boxId }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [note, setNote] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const [removalStatus, setRemovalStatus] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const navigate = useNavigate();

  async function handleDeleteBox() {
    if (!box) return;

    let confirmed = false;
    const actor = await ensureUser();
    if (!actor) {
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display agentic cancel user alert', error);
      }
      return;
    }
    try {
      confirmed = await dialogService.confirm({
        title: 'Behälter löschen',
        message: 'Behälter wirklich löschen?',
        confirmLabel: 'Löschen',
        cancelLabel: 'Abbrechen'
      });
    } catch (error) {
      console.error('Failed to confirm box deletion', error);
      return;
    }

    if (!confirmed) {
      console.log('Box deletion cancelled', { boxId: box.BoxID });
      return;
    }
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(box.BoxID)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor, confirm: true })
      });
      if (res.ok) {
        navigate('/');
      } else {
        const j = await res.json().catch(() => ({}));
        const message = j.error === 'box not empty' ? 'Behälter enthält noch Artikel' : 'Löschen fehlgeschlagen';
        try {
          await dialogService.alert({
            title: 'Fehler',
            message
          });
        } catch (error) {
          console.error('Failed to show box deletion failure alert', error);
        }
        console.error('Failed to delete box', res.status);
      }
    } catch (err) {
      console.error('Failed to delete box', err);
    }
  }

  async function removeItem(itemId: string) {
    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Entnahme bestätigen',
        message: 'Entnehmen?',
        confirmLabel: 'Entnehmen',
        cancelLabel: 'Abbrechen'
      });
    } catch (error) {
      console.error('Failed to confirm item removal', error);
      setRemovalStatus(prev => ({ ...prev, [itemId]: 'Entnahme fehlgeschlagen' }));
      return;
    }

    if (!confirmed) {
      console.log('Item removal cancelled', { itemId });
      setRemovalStatus(prev => ({ ...prev, [itemId]: 'Entnahme abgebrochen' }));
      return;
    }
    console.log('Item removal confirmed', { itemId });
    const actor = await ensureUser();
    if (!actor) {
      console.info('Box item removal aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for box item removal', error);
      }
    
      return;
    }
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor })
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
                  const actor = await ensureUser();
                  if (!actor) {
                    console.info('Box note save aborted: missing username.');
                    try {
                      await dialogService.alert({
                        title: 'Aktion nicht möglich',
                        message: 'Bitte zuerst oben den Benutzer setzen.'
                      });
                    } catch (error) {
                      console.error('Failed to display missing user alert for note save', error);
                    }
                    return;
                  }
                  try {
                    const res = await fetch(`/api/boxes/${encodeURIComponent(box.BoxID)}/move`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ notes: note, location: box.Location, actor })
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
                  <div className=''>
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
              <div className=''>
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
