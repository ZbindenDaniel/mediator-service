import React, { useCallback, useEffect, useMemo, useRef, useState, useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateBoxCard from './RelocateBoxCard';
import AddItemToBoxDialog from './AddItemToBoxDialog';
import type { Box, Item, EventLog, BoxDetailResponse } from '../../../models';
import { formatDateTime } from '../lib/format';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';
import { groupItemsForDisplay } from '../lib/itemGrouping';
import { ensureUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import { filterVisibleEvents } from '../utils/eventLogTopics';
import { logger, logError } from '../utils/logger';
import BoxTag from './BoxTag';
import { dialogService } from './dialog';
import LoadingPage from './LoadingPage';
import QualityBadge from './QualityBadge';

// TODO(agent): Verify the BoxTag rendering still aligns with the detailed box metadata layout.
// TODO(agent): Confirm location tags remain navigable only when LocationId is valid and link targets are encoded correctly.
// TODO(agent): Audit box label fallbacks here if backend label fields change.
// TODO(agent): Confirm shelf box lists align with relocation rules before expanding shelf detail UI.
// TODO(agent): Evaluate consolidating box photo preview modal with ItemMediaGallery once use cases align.
// TODO(agent): Audit remaining box detail form fields to ensure LocationId/Label handling is consistent after legacy migration.
// TODO(agent): Confirm note-only box updates preserve stored labels after label input removal.
// TODO(grouped-box-items): Align grouped box item display with forthcoming backend grouped payloads.
// TODO(bulk-display): Recheck Einheit=Menge quantity display once box detail payloads are refined.
// TODO(agent): Add shared focus styling for clickable table rows once global table styles support it.
// TODO(bulk-display): Validate displayCount fallback logic for Menge rows after backend grouping changes.
// TODO(box-detail-layout): Validate box detail summary grid alignment across breakpoints.
// TODO(agent): Reassess shelf label/notes editing once shelf tagging conventions stabilize.

interface Props {
  boxId: string;
}

function resolveActorName(actor?: string | null): string {
  return actor && actor.trim() ? actor : 'System';
}

function resolveDisplayCount(group: ReturnType<typeof groupItemsForDisplay>[number]): number {
  try {
    if (typeof group.displayCount === 'number' && Number.isFinite(group.displayCount)) {
      return group.displayCount;
    }
    const fallback = group.isBulk && Number.isFinite(group.totalStock) ? group.totalStock : group.summary.count;
    logger.warn?.('Invalid grouped displayCount in box detail row', {
      groupKey: group.key,
      displayCount: group.displayCount,
      totalStock: group.totalStock,
      isBulk: group.isBulk,
      fallback
    });
    return fallback;
  } catch (error) {
    logError('Failed to resolve grouped display count in box detail row', error, {
      groupKey: group.key,
      displayCount: group.displayCount,
      totalStock: group.totalStock,
      isBulk: group.isBulk
    });
    return group.summary.count;
  }
}

export default function BoxDetail({ boxId }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [containedBoxes, setContainedBoxes] = useState<Box[]>([]);
  type NoteFeedback = { type: 'info' | 'success' | 'error'; message: string } | null;

  const [note, setNote] = useState('');
  const [label, setLabel] = useState('');
  const [noteFeedback, setNoteFeedback] = useState<NoteFeedback>(null);
  const [shelfFeedback, setShelfFeedback] = useState<NoteFeedback>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingShelfDetails, setIsSavingShelfDetails] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoUpload, setPhotoUpload] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [removalStatus, setRemovalStatus] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const navigate = useNavigate();
  const photoModalRef = useRef<HTMLDivElement | null>(null);
  const photoDialogTitleId = useId();
  const groupedItems = useMemo(() => groupItemsForDisplay(items, { logContext: 'box-detail-grouping' }), [items]);
  const normalizedLocationId = useMemo(() => {
    if (typeof box?.LocationId !== 'string') {
      return '';
    }
    try {
      return box.LocationId.trim();
    } catch (error) {
      logError('Failed to normalize box location link target', error, { boxId: box?.BoxID, locationId: box?.LocationId });
      return '';
    }
  }, [box?.BoxID, box?.LocationId]);
  const shouldLinkLocation = Boolean(normalizedLocationId);
  const handleRowNavigate = useCallback((itemId: string | null | undefined, source: 'click' | 'keyboard') => {
    if (!itemId) {
      logger.warn('Attempted to navigate from box detail row without item id', { boxId, source });
      return;
    }

    try {
      logger.info('Navigating to item detail from box detail row', { boxId, itemId, source });
      navigate(`/items/${encodeURIComponent(itemId)}`);
    } catch (error) {
      logError('Failed to navigate to item detail from box detail row', error, { boxId, itemId, source });
    }
  }, [boxId, navigate]);

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
    if (items.length > 0) {
      console.info('Box deletion blocked because items remain', { boxId: box.BoxID, itemCount: items.length });
      try {
        await dialogService.alert({
          title: 'Löschen nicht möglich',
          message: 'Bitte entnehmen Sie zuerst alle Artikel aus dem Behälter.'
        });
      } catch (error) {
        console.error('Failed to display non-empty box deletion alert', error);
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
        let data: BoxDetailResponse;
        try {
          data = await res.json();
        } catch (parseError) {
          console.error('Failed to parse box detail response', { boxId, error: parseError });
          setLoadError('Behälter konnte nicht geladen werden.');
          setBox(null);
          setItems([]);
          setEvents([]);
          setContainedBoxes([]);
          setNote('');
          setPhotoPreview('');
          setPhotoUpload(null);
          setPhotoRemoved(false);
          return;
        }
        setBox(data.box);
        setNote(data.box?.Notes || '');
        setLabel(typeof data.box?.Label === 'string' ? data.box.Label : '');
        setNoteFeedback(null);
        setShelfFeedback(null);
        const nextPhotoPath = typeof data.box?.PhotoPath === 'string' ? data.box.PhotoPath.trim() : '';
        setPhotoPreview(nextPhotoPath);
        setPhotoUpload(null);
        setPhotoRemoved(false);
        setItems(data.items || []);
        setEvents(Array.isArray(data.events) ? filterVisibleEvents(data.events) : []);
        if (Array.isArray(data.containedBoxes)) {
          setContainedBoxes(data.containedBoxes);
        } else if (Array.isArray((data as any).boxes)) {
          console.warn('Box detail response used legacy boxes field', { boxId });
          setContainedBoxes((data as any).boxes);
        } else {
          if (data.containedBoxes !== undefined) {
            console.warn('Box detail containedBoxes was not an array', { boxId });
          }
          setContainedBoxes([]);
        }
        setLoadError(null);
      } else {
        console.error('Failed to fetch box', res.status);
        setBox(null);
        setItems([]);
        setEvents([]);
        setContainedBoxes([]);
        setNote('');
        setPhotoPreview('');
        setPhotoUpload(null);
        setPhotoRemoved(false);
        setLoadError(res.status === 404 ? 'Behälter wurde nicht gefunden.' : 'Behälter konnte nicht geladen werden.');
      }
    } catch (err) {
      console.error('Failed to fetch box', err);
      setLoadError('Behälter konnte nicht geladen werden.');
      setContainedBoxes([]);
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

  useEffect(() => {
    if (!isPhotoModalOpen) {
      return undefined;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsPhotoModalOpen(false);
        console.info('Closed box photo modal via keyboard', { boxId });
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [boxId, isPhotoModalOpen]);

  useEffect(() => {
    if (isPhotoModalOpen && photoModalRef.current) {
      photoModalRef.current.focus();
    }
  }, [isPhotoModalOpen]);

  useEffect(() => {
    if (!photoPreview && isPhotoModalOpen) {
      setIsPhotoModalOpen(false);
      console.info('Closed box photo modal after preview reset', { boxId });
    }
  }, [boxId, isPhotoModalOpen, photoPreview]);

  const openPhotoModal = useCallback(() => {
    if (!photoPreview) {
      console.warn('Attempted to open box photo modal without preview', { boxId });
      return;
    }
    setIsPhotoModalOpen(true);
    console.info('Opened box photo modal', { boxId });
  }, [boxId, photoPreview]);

  const closePhotoModal = useCallback(() => {
    setIsPhotoModalOpen(false);
    console.info('Closed box photo modal', { boxId });
  }, [boxId]);

  const saveBoxNoteAndPhoto = useCallback(async ({
    photoData,
    removePhotoOverride,
    source
  }: {
    photoData?: string | null;
    removePhotoOverride?: boolean;
    source: 'note-form' | 'photo-upload';
  }) => {
    if (!box) {
      return;
    }
    const actor = await ensureUser();
    if (!actor) {
      console.info('Box note save aborted: missing username.', { source });
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
      console.info('Saving box note', { boxId: box.BoxID, source });
      const payload: Record<string, unknown> = { notes: note, actor };
      if (typeof box.LocationId === 'string' && box.LocationId.trim()) {
        payload.LocationId = box.LocationId.trim();
      }
      const resolvedPhotoUpload = typeof photoData === 'string' ? photoData : photoUpload;
      const resolvedRemovePhoto = typeof removePhotoOverride === 'boolean' ? removePhotoOverride : photoRemoved;
      if (resolvedPhotoUpload) {
        payload.photo = resolvedPhotoUpload;
      } else if (resolvedRemovePhoto) {
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
        console.info('Box note saved', { boxId: box.BoxID, hasPhoto: Boolean(nextPhotoPath), source });
      } else {
        let errorMessage = `Speichern fehlgeschlagen (Status ${res.status})`;
        const errorBody = responseBody;
        if (errorBody?.error) {
          errorMessage = `Speichern fehlgeschlagen: ${errorBody.error}`;
        }
        console.error('Note save request failed', { boxId: box.BoxID, status: res.status, source });
        setNoteFeedback({ type: 'error', message: errorMessage });
      }
    } catch (err) {
      console.error('Note save failed', err);
      setNoteFeedback({ type: 'error', message: 'Speichern fehlgeschlagen' });
    } finally {
      setIsSavingNote(false);
    }
  }, [box, boxId, note, photoRemoved, photoUpload]);

  const saveShelfDetails = useCallback(async () => {
    if (!box) {
      return;
    }
    const actor = await ensureUser();
    if (!actor) {
      console.info('Shelf detail save aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        logError('Failed to display missing user alert for shelf detail save', error, { boxId: box.BoxID });
      }
      return;
    }
    try {
      setIsSavingShelfDetails(true);
      setShelfFeedback({ type: 'info', message: 'Speichern…' });
      const trimmedLabel = label.trim();
      const trimmedNotes = note.trim();
      logger.info('[shelf-detail] Saving shelf label/notes', {
        boxId: box.BoxID,
        hasLabel: Boolean(trimmedLabel),
        hasNotes: Boolean(trimmedNotes)
      });
      const payload = {
        actor,
        Label: trimmedLabel,
        notes: trimmedNotes
      };
      const res = await fetch(`/api/boxes/${encodeURIComponent(box.BoxID)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const responseBody = await res.json().catch(() => ({}));
      if (res.ok) {
        setBox((current) => current ? { ...current, Label: trimmedLabel || null, Notes: trimmedNotes } : current);
        setShelfFeedback({ type: 'success', message: 'Regal gespeichert' });
        logger.info('[shelf-detail] Shelf label/notes saved', { boxId: box.BoxID, status: res.status });
      } else {
        const errorMessage = responseBody?.error
          ? `Speichern fehlgeschlagen: ${responseBody.error}`
          : `Speichern fehlgeschlagen (Status ${res.status})`;
        setShelfFeedback({ type: 'error', message: errorMessage });
        logger.warn('[shelf-detail] Shelf label/notes update failed', {
          boxId: box.BoxID,
          status: res.status,
          error: responseBody?.error
        });
      }
    } catch (error) {
      logError('Shelf label/notes update failed', error, { boxId: box.BoxID });
      setShelfFeedback({ type: 'error', message: 'Speichern fehlgeschlagen' });
    } finally {
      setIsSavingShelfDetails(false);
    }
  }, [box, label, note]);

  // TODO(box-detail-photo-autosave): Add retry/backoff support for repeated photo save failures.
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
        const preparedPhotoData = reader.result;
        setPhotoPreview(preparedPhotoData);
        setPhotoUpload(preparedPhotoData);
        setPhotoRemoved(false);
        console.info('Prepared box photo upload preview', { boxId, size: file.size });
        void saveBoxNoteAndPhoto({ photoData: preparedPhotoData, removePhotoOverride: false, source: 'photo-upload' })
          .catch((error) => {
            logError('Failed to auto-save box photo after selection', error, { boxId });
          });
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
  }, [boxId, saveBoxNoteAndPhoto]);

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

  const handlePhotoImageError = useCallback(() => {
    console.error('Failed to render box photo preview', { boxId });
  }, [boxId]);

  // TODO: Replace client-side slicing once the activities page provides pagination.
  const displayedEvents = useMemo(() => events.slice(0, 5), [events]);

  const isShelf = useMemo(() => {
    if (!box?.BoxID) {
      return false;
    }
    try {
      return box.BoxID.trim().toUpperCase().startsWith('S-');
    } catch (error) {
      console.error('Failed to evaluate shelf box id', error);
      return false;
    }
  }, [box?.BoxID]);

  const isBoxRelocatable = useMemo(() => {
    if (!box?.BoxID) {
      return false;
    }
    try {
      return box.BoxID.trim().toUpperCase().startsWith('B');
    } catch (error) {
      console.error('Failed to evaluate relocatable box id', error);
      return false;
    }
  }, [box?.BoxID]);

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
            <div className="box-detail-summary-grid grid-span-2">
              <div className="box-detail-summary-column">
                <div className="card">
                  <h2 className='mono'>{box.BoxID}</h2>
                  <table className="details">
                    <tbody>
                      <tr>
                        <th>Standort</th>
                        <td>
                          {shouldLinkLocation ? (
                            <Link
                              to={`/boxes/${encodeURIComponent(normalizedLocationId)}`}
                              aria-label="Zum Regal"
                            >
                              <BoxTag locationKey={box.LocationId} labelOverride={box.Label} />
                            </Link>
                          ) : (
                            <BoxTag locationKey={box.LocationId} labelOverride={box.Label} />
                          )}
                        </td>
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

                {isBoxRelocatable ? (
                  <RelocateBoxCard
                    boxId={box.BoxID}
                    onMoved={() => { void load({ showSpinner: false }); }}
                  />
                ) : null}
              </div>

              <div className="box-detail-summary-column">
                {isBoxRelocatable ? (
                  <div className="card">
                    <h3>Notizen</h3>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      await saveBoxNoteAndPhoto({ source: 'note-form' });
                    }}>
                      <div className=''>
                        <div className='row'>
                          <label htmlFor="box-note-photo">Foto</label>
                          <div className="note-photo-controls">
                            {photoPreview ? (
                              <div className="note-photo-preview">
                                {/* TODO(agent): Extract box note photo preview into shared media component when expanding uploader features. */}
                                <figure className="item-media-gallery__item" style={{ maxWidth: '240px' }}>
                                  <img
                                    src={photoPreview}
                                    alt="Aktuelles Box-Foto"
                                    style={{ maxWidth: '240px', maxHeight: '180px', display: 'block', cursor: 'pointer' }}
                                    onClick={openPhotoModal}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openPhotoModal();
                                      }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    aria-haspopup="dialog"
                                    aria-label="Box-Foto vergrößern"
                                    onError={handlePhotoImageError}
                                  />
                                </figure>
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
                            {/* TODO(agent): Disable the photo upload control while autosave is in progress to prevent overlapping requests. */}
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
                ) : null}

                {isShelf ? (
                  <div className="card">
                    <h3>Regal-Details</h3>
                    <form onSubmit={async (event) => {
                      event.preventDefault();
                      await saveShelfDetails();
                    }}>
                      <div className="row">
                        <label htmlFor="shelf-label">Label</label>
                        <input
                          id="shelf-label"
                          type="text"
                          value={label}
                          onChange={(event) => setLabel(event.target.value)}
                          placeholder="Regalname"
                          disabled={isSavingShelfDetails}
                        />
                      </div>
                      <div className="row">
                        <label htmlFor="shelf-notes">Notizen</label>
                        <textarea
                          id="shelf-notes"
                          value={note}
                          onChange={(event) => {
                            setNote(event.target.value);
                            if (shelfFeedback && shelfFeedback.type !== 'info') {
                              setShelfFeedback(null);
                            }
                          }}
                          rows={Math.max(3, note.split('\n').length)}
                          disabled={isSavingShelfDetails}
                        />
                      </div>
                      <div className="row">
                        <button type="submit" disabled={isSavingShelfDetails}>Speichern</button>
                      </div>
                      <div className="row">
                        {shelfFeedback ? (
                          <span
                            className="muted"
                            role={shelfFeedback.type === 'error' ? 'alert' : 'status'}
                            style={shelfFeedback.type === 'error' ? { color: '#b3261e', fontWeight: 600 } : undefined}
                          >
                            {shelfFeedback.message}
                          </span>
                        ) : null}
                      </div>
                    </form>
                  </div>
                ) : null}

                <PrintLabelButton boxId={box.BoxID} />
              </div>
            </div>

            {isShelf ? (
              <div className="card">
                <h3>Behälter</h3>
                <div className="item-cards">
                  {containedBoxes.length ? (
                    containedBoxes.map((containedBox) => (
                      <div key={containedBox.BoxID} className="card item-card">
                        <Link to={`/boxes/${encodeURIComponent(containedBox.BoxID)}`} className="linkcard">
                          <div className="mono">{containedBox.BoxID}</div>
                          <div>
                            <BoxTag
                              locationKey={containedBox.LocationId}
                              labelOverride={containedBox.Label}
                            />
                          </div>
                        </Link>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Keine Behälter in diesem Regal.</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="card grid-span-2">
              <h3>Artikel</h3>
              <div className=''>
                <div className='row'>
                  <div className="item-list-wrapper">
                    <table className="item-list">
                      <thead>
                        <tr className="item-list-header">
                          <th className="col-number">A-Nr</th>
                          <th className="col-desc">Artikel</th>
                          <th className="col-stock optional-column">Anzahl</th>
                          <th className="col-quality optional-column">Qualität</th>
                          <th className="col-agentic optional-column">Ki</th>
                          <th className="col-subcategory optional-column">Unterkategorie A</th>
                          <th className="col-actions">Aktionen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedItems.length ? (
                          groupedItems.map((group) => {
                            const representative = group.representative;
                            const representativeId = group.summary.representativeItemId;
                            const subcategoryValue = group.summary.Category
                              ?? (typeof representative?.Unterkategorien_A === 'number'
                                ? String(representative.Unterkategorien_A)
                                : (typeof representative?.Unterkategorien_A === 'string'
                                  ? representative.Unterkategorien_A
                                  : null));
                            const qualityValue = typeof group.summary.Quality === 'number'
                              ? group.summary.Quality
                              : (typeof representative?.Quality === 'number' ? representative.Quality : null);
                            const agenticLabel = describeAgenticStatus(group.agenticStatusSummary);
                            const removalMessage = representativeId ? removalStatus[representativeId] : null;
                            const itemNumber = group.summary.Artikel_Nummer || representative?.Artikel_Nummer;
                            const itemNumberLabel = itemNumber ?? 'Artikel';
                            const rowLabel = representativeId ? `Artikel ${itemNumberLabel} öffnen` : undefined;

                            return (
                              <tr
                                key={group.key}
                                tabIndex={representativeId ? 0 : -1}
                                role={representativeId ? 'link' : undefined}
                                aria-label={rowLabel}
                                onClick={representativeId ? () => handleRowNavigate(representativeId, 'click') : undefined}
                                onKeyDown={representativeId ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleRowNavigate(representativeId, 'keyboard');
                                  }
                                } : undefined}
                              >
                                <td className="col-number">
                                  {itemNumber ?? '—'}
                                </td>
                                <td className="col-desc">
                                  {representative?.Artikelbeschreibung ?? '—'}
                                </td>
                                <td className="col-stock optional-column">
                                  {resolveDisplayCount(group)}
                                </td>
                                <td className="col-quality optional-column">
                                  <QualityBadge compact value={qualityValue} />
                                </td>
                                <td className="col-agentic optional-column">{agenticLabel}</td>
                                <td className="col-subcategory optional-column">{subcategoryValue ?? '—'}</td>
                                <td className="col-actions">
                                  {representativeId ? (
                                    <>
                                      <button
                                        type="button"
                                        className="btn"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          removeItem(representativeId);
                                        }}
                                        aria-label={`Artikel ${itemNumberLabel} entnehmen`}
                                      >
                                        Entnehmen
                                      </button>
                                    </>
                                  ) : (
                                    <span className="muted">Keine Aktion verfügbar</span>
                                  )}
                                  {removalMessage ? (
                                    <div className="muted">{removalMessage}</div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td className="muted" colSpan={7}>Keine Artikel in diesem Behälter.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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

            <div className="card grid-span-2">
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
      {
        isPhotoModalOpen && photoPreview ? (
          <div
            className="dialog-overlay item-media-gallery__overlay"
            role="presentation"
            onClick={closePhotoModal}
          >
            <div
              className="dialog-content item-media-gallery__dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={photoDialogTitleId}
              tabIndex={-1}
              ref={photoModalRef}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="item-media-gallery__dialog-header">
                <h2 id={photoDialogTitleId} className="dialog-title">
                  Box-Foto
                </h2>
                <button
                  type="button"
                  className="item-media-gallery__dialog-close"
                  onClick={closePhotoModal}
                >
                  Schließen
                </button>
              </header>
              <div className="item-media-gallery__dialog-body">
                <img
                  className="item-media-gallery__dialog-image"
                  src={photoPreview}
                  alt={`Foto für Behälter ${box?.BoxID ?? boxId}`}
                  onError={handlePhotoImageError}
                />
                <figcaption className="item-media-gallery__dialog-caption">
                  Foto für Behälter {box?.BoxID ?? boxId}
                </figcaption>
              </div>
            </div>
          </div>
        ) : null
      }
    </div >
  );
}
