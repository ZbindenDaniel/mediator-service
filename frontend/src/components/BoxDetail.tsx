import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateBoxCard from './RelocateBoxCard';
import AddItemToBoxDialog from './AddItemToBoxDialog';
import type { Box, Item, EventLog } from '../../../models';
import { formatDateTime } from '../lib/format';
import { ensureUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import { filterAllowedEvents } from '../utils/eventLogLevels';
import BoxColorTag from './BoxColorTag';
import { dialogService } from './dialog';
import LoadingPage from './LoadingPage';

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
  type NoteFeedback = { type: 'info' | 'success' | 'error'; message: string } | null;

  const [note, setNote] = useState('');
  const [noteFeedback, setNoteFeedback] = useState<NoteFeedback>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoUpload, setPhotoUpload] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [removalStatus, setRemovalStatus] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
        await load({ showSpinner: false });
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
  async function load(options?: { showSpinner?: boolean }) {
    const showSpinner = Boolean(options?.showSpinner);
    if (showSpinner) {
      setIsLoading(true);
    }
    setLoadError(null);
    console.info('Loading box details', { boxId, showSpinner });
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
      if (res.ok) {
        const data = await res.json();
        setBox(data.box);
        setNote(data.box?.Notes || '');
        setNoteFeedback(null);
        const nextPhotoPath = typeof data.box?.PhotoPath === 'string' ? data.box.PhotoPath.trim() : '';
        setPhotoPreview(nextPhotoPath);
        setPhotoUpload(null);
        setPhotoRemoved(false);
        setItems(data.items || []);
        setEvents(Array.isArray(data.events) ? filterAllowedEvents(data.events) : []);
        setLoadError(null);
      } else {
        console.error('Failed to fetch box', res.status);
        setBox(null);
        setItems([]);
        setEvents([]);
        setNote('');
        setPhotoPreview('');
        setPhotoUpload(null);
        setPhotoRemoved(false);
        setLoadError(res.status === 404 ? 'Behälter wurde nicht gefunden.' : 'Behälter konnte nicht geladen werden.');
      }
    } catch (err) {
      console.error('Failed to fetch box', err);
      setLoadError('Behälter konnte nicht geladen werden.');
      setPhotoPreview('');
      setPhotoUpload(null);
      setPhotoRemoved(false);
    } finally {
      if (showSpinner) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    void load({ showSpinner: true });
  }, [boxId]);

  const handlePhotoFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          console.warn('Box photo reader produced non-string result');
          return;
        }
        setPhotoPreview(reader.result);
        setPhotoUpload(reader.result);
        setPhotoRemoved(false);
        console.info('Prepared box photo upload preview', { boxId, size: file.size });
      };
      reader.onerror = (error) => {
        console.error('Failed to read selected box photo', error);
      };
      reader.onloadend = () => {
        try {
          input.value = '';
        } catch (resetErr) {
          console.warn('Failed to reset box photo input after selection', resetErr);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to prepare box photo upload', error);
    }
  }, [boxId]);

  const handlePhotoRemove = useCallback(() => {
    try {
      setPhotoPreview('');
      setPhotoUpload(null);
      setPhotoRemoved(true);
      console.info('Marked box photo for removal', { boxId });
    } catch (error) {
      console.error('Failed to mark box photo for removal', error);
    }
  }, [boxId]);

  // TODO: Replace client-side slicing once the activities page provides pagination.
  const displayedEvents = useMemo(() => events.slice(0, 5), [events]);

  if (isLoading) {
    return <LoadingPage message="Behälter wird geladen…" />;
  }

  if (loadError && !box) {
    // TODO: Replace basic retry UI with shared error boundary once available.
    return (
      <div className="container box">
        <div className="grid landing-grid">
          <div className="card">
            <h2>Fehler beim Laden</h2>
            <p className="muted">{loadError}</p>
            <div className='row'>
              <button type="button" className="btn" onClick={() => void load({ showSpinner: true })}>
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                    <td><BoxColorTag locationKey={box.Location} labelOverride={box.StandortLabel} /></td>
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

            <RelocateBoxCard boxId={box.BoxID} onMoved={() => { void load({ showSpinner: false }); }} />

            <PrintLabelButton boxId={box.BoxID} />
            <div className="card">
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
                    setIsSavingNote(true);
                    setNoteFeedback({ type: 'info', message: 'Speichern…' });
                    console.info('Saving box note', { boxId: box.BoxID });
                    const payload: Record<string, unknown> = { notes: note, actor };
                    if (typeof box.Location === 'string' && box.Location.trim()) {
                      payload.location = box.Location;
                    }
                    if (photoUpload) {
                      payload.photo = photoUpload;
                    } else if (photoRemoved) {
                      payload.removePhoto = true;
                    }
                    const res = await fetch(`/api/boxes/${encodeURIComponent(box.BoxID)}/move`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    let responseBody: any = null;
                    try {
                      responseBody = await res.json();
                    } catch (parseErr) {
                      console.error('Failed to parse box note response', parseErr);
                    }
                    if (res.ok) {
                      const nextPhotoPath = typeof responseBody?.photoPath === 'string' ? responseBody.photoPath.trim() : '';
                      setBox(b => b ? { ...b, Notes: note, PhotoPath: nextPhotoPath || null } : b);
                      setPhotoPreview(nextPhotoPath);
                      setPhotoUpload(null);
                      setPhotoRemoved(false);
                      setNoteFeedback({ type: 'success', message: 'Notiz gespeichert' });
                      console.info('Box note saved', { boxId: box.BoxID, hasPhoto: Boolean(nextPhotoPath) });
                    } else {
                      let errorMessage = `Speichern fehlgeschlagen (Status ${res.status})`;
                      const errorBody = responseBody;
                      if (errorBody?.error) {
                        errorMessage = `Speichern fehlgeschlagen: ${errorBody.error}`;
                      }
                      console.error('Note save request failed', { boxId: box.BoxID, status: res.status });
                      setNoteFeedback({ type: 'error', message: errorMessage });
                    }
                  } catch (err) {
                    console.error('Note save failed', err);
                    setNoteFeedback({ type: 'error', message: 'Speichern fehlgeschlagen' });
                  } finally {
                    setIsSavingNote(false);
                  }
                }}>
                  <div className=''>
                    <div className='row'>
                      <label htmlFor="box-note-photo">Foto</label>
                      <div className="note-photo-controls">
                        {photoPreview ? (
                          <div className="note-photo-preview">
                            {/* TODO(agent): Extract box note photo preview into shared media component when expanding uploader features. */}
                            <img
                              src={photoPreview}
                              alt="Aktuelles Box-Foto"
                              style={{ maxWidth: '240px', maxHeight: '180px', display: 'block' }}
                            />
                            <div className='row'>
                              <button type="button" className="btn danger" onClick={handlePhotoRemove}>
                                Foto entfernen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="muted">Kein Foto gespeichert.</p>
                        )}
                        {photoRemoved ? (
                          <p className="muted">Foto wird nach dem Speichern entfernt.</p>
                        ) : null}
                        <input
                          type="file"
                          id="box-note-photo"
                          name="box-note-photo"
                          accept="image/*"
                          onChange={handlePhotoFileChange}
                        />
                      </div>
                    </div>

                    <div className='row'>
                      <textarea
                        value={note}
                        onChange={e => {
                          setNote(e.target.value);
                          if (noteFeedback && noteFeedback.type !== 'info') {
                            setNoteFeedback(null);
                          }
                        }}
                        rows={Math.max(3, note.split('\n').length)} />
                    </div>

                    <div className='row'>
                      <button type="submit" disabled={isSavingNote}>Speichern</button>
                    </div>

                    <div className='row'>
                      {noteFeedback && (
                        <span
                          className="muted"
                          role={noteFeedback.type === 'error' ? 'alert' : 'status'}
                          style={noteFeedback.type === 'error' ? { color: '#b3261e', fontWeight: 600 } : undefined}
                        >
                          {noteFeedback.message}
                        </span>
                      )}
                    </div>
                  </div>
                </form>
              </div>

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
                    onAdded={() => { void load({ showSpinner: false }); }}
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
                    <span className="muted">[{formatDateTime(ev.CreatedAt)}]</span>{' '}
                    {resolveActorName(ev.Actor)}{': ' + eventLabel(ev.Event)}
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
