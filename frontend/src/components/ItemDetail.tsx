import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateItemCard from './RelocateItemCard';
import type { ItemWithRelations, EventLog, AgenticRun } from '../../../models';
import { formatDateTime } from '../lib/format';
import { getUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import {
  buildAgenticCancelUrl,
  buildAgenticRunUrl,
  cancelAgenticRun,
  persistAgenticRunCancellation,
  resolveAgenticApiBase,
  triggerAgenticRun
} from '../lib/agentic';
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemMediaGallery from './ItemMediaGallery';

interface Props {
  itemId: string;
}

export interface AgenticStatusCardProps {
  status: { label: string; className: string; description: string };
  rows: [string, React.ReactNode][];
  actionPending: boolean;
  reviewIntent: 'approved' | 'rejected' | null;
  error: string | null;
  needsReview: boolean;
  hasFailure: boolean;
  onRestart: () => void;
  onReview: (decision: 'approved' | 'rejected') => void;
  onCancel: () => void;
}

export function AgenticStatusCard({
  status,
  rows,
  actionPending,
  reviewIntent,
  error,
  needsReview,
  hasFailure,
  onRestart,
  onReview,
  onCancel
}: AgenticStatusCardProps) {
  return (
    <div className="card">
      <h3>Ki Status</h3>
      <div className="row">
        <span className={status.className}>{status.label}</span>
      </div>
      <p className="muted">{status.description}</p>
      {rows.length > 0 ? (
        <table className="details">
          <tbody>
            {rows.map(([k, v], idx) => (
              <tr key={`${k}-${idx}`} className="responsive-row">
                <th className="responsive-th">{k}</th>
                <td className="responsive-td">{v ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {actionPending ? <p className="muted">Agentic-Aktion wird ausgeführt…</p> : null}
      {reviewIntent ? (
        <p className="muted">
          Review-Aktion "{reviewIntent === 'approved' ? 'Freigeben' : 'Ablehnen'}" vorbereitet.
        </p>
      ) : null}
      {error ? (
        <p className="muted" style={{ color: '#a30000' }}>{error}</p>
      ) : null}
      { status.label != 'Abgebrochen' ?(
        <div className='row'>
        <button type="button" className="btn" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
      ) : null}
      {!needsReview && hasFailure ? (
        <div className='row'>
          <button type="button" className="btn" disabled={actionPending} onClick={onRestart}>
            Wiederholen
          </button>
        </div>
      ) : null}
      {needsReview ? (
        <div className='row'>
          <button type="button" className="btn" disabled={actionPending} onClick={() => onReview('approved')}>
            Freigeben
          </button>
          <button type="button" className="btn danger" disabled={actionPending} onClick={() => onReview('rejected')}>
            Ablehnen
          </button>
        </div>
      ) : null}
    </div>
  );
}

function resolveActorName(actor?: string | null): string {
  return actor && actor.trim() ? actor : 'System';
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export default function ItemDetail({ itemId }: Props) {
  const [item, setItem] = useState<ItemWithRelations | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [agentic, setAgentic] = useState<AgenticRun | null>(null);
  const [agenticError, setAgenticError] = useState<string | null>(null);
  const [agenticActionPending, setAgenticActionPending] = useState(false);
  const [agenticReviewIntent, setAgenticReviewIntent] = useState<'approved' | 'rejected' | null>(null);
  const [mediaAssets, setMediaAssets] = useState<string[]>([]);
  const navigate = useNavigate();

  const derived = useMemo(() => {
    if (!item) {
      return null;
    }
    const reference = item.reference ?? {};
    const quantity = item.quantity ?? {};
    const itemId = quantity.ItemUUID ?? item.ItemUUID;
    const artikelbeschreibung = coerceString(reference.Artikelbeschreibung) ?? item.Artikelbeschreibung ?? '';
    const artikelNummer = coerceString(reference.Artikel_Nummer) ?? item.Artikel_Nummer ?? '';
    const kurzbeschreibung = coerceString(reference.Kurzbeschreibung) ?? item.Kurzbeschreibung ?? '';
    const langtext = coerceString(reference.Langtext) ?? item.Langtext ?? '';
    const hersteller = coerceString(reference.Hersteller) ?? item.Hersteller ?? '';
    const einheit = coerceString(reference.Einheit) ?? item.Einheit ?? '';
    const wmsLink = coerceString(reference.WmsLink) ?? item.WmsLink ?? '';
    const verkaufspreis = coerceNumber(reference.Verkaufspreis) ?? item.Verkaufspreis ?? null;
    const quantityValue = typeof quantity.Quantity === 'number' ? quantity.Quantity : item.Auf_Lager ?? 0;
    const boxId = quantity.BoxID ?? item.BoxID ?? null;
    const datumErfasst = reference.Datum_erfasst ?? item.Datum_erfasst ?? null;
    const updatedAt = quantity.UpdatedAt ?? item.UpdatedAt ?? null;
    const createdAt = quantity.CreatedAt ?? item.CreatedAt ?? null;
    const length = coerceNumber(reference.Länge_mm) ?? item.Länge_mm ?? null;
    const width = coerceNumber(reference.Breite_mm) ?? item.Breite_mm ?? null;
    const height = coerceNumber(reference.Höhe_mm) ?? item.Höhe_mm ?? null;
    const weight = coerceNumber(reference.Gewicht_kg) ?? item.Gewicht_kg ?? null;
    const location = quantity.Location ?? item.Location ?? null;
    const storedLocation = quantity.StoredLocation ?? item.StoredLocation ?? null;

    return {
      reference,
      quantity,
      itemId,
      artikelbeschreibung,
      artikelNummer,
      kurzbeschreibung,
      langtext,
      hersteller,
      einheit,
      wmsLink,
      verkaufspreis,
      quantityValue,
      boxId,
      datumErfasst,
      updatedAt,
      createdAt,
      length,
      width,
      height,
      weight,
      location,
      storedLocation
    };
  }, [item]);

  const currentItemId = derived?.itemId ?? item?.ItemUUID ?? itemId;

  const agenticApiBase = useMemo(resolveAgenticApiBase, []);
  const agenticRunUrl = useMemo(() => buildAgenticRunUrl(agenticApiBase), [agenticApiBase]);
  const agenticCancelUrl = useMemo(() => buildAgenticCancelUrl(agenticApiBase), [agenticApiBase]);
  // TODO: Replace client-side slicing once the activities page provides pagination.
  const displayedEvents = useMemo(() => events.slice(0, 5), [events]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
      if (res.ok) {
        const data = await res.json();
        const nextItem = (data.item ?? null) as ItemWithRelations | null;
        setItem(nextItem);
        setEvents(data.events || []);
        setAgentic(data.agentic ?? null);
        const media = Array.isArray(data.media)
          ? data.media.filter((src: unknown): src is string => typeof src === 'string' && src.trim() !== '')
          : [];
        setMediaAssets(media);
        setAgenticError(null);
        setAgenticReviewIntent(null);
      } else {
        console.error('Failed to fetch item', res.status);
        setAgentic(null);
        setAgenticError('Agentic-Status konnte nicht geladen werden.');
        setMediaAssets([]);
        setAgenticReviewIntent(null);
      }
    } catch (err) {
      console.error('Failed to fetch item', err);
      setAgentic(null);
      setAgenticError('Agentic-Status konnte nicht geladen werden.');
      setMediaAssets([]);
      setAgenticReviewIntent(null);
    }
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  const agenticNeedsReview = agentic ? (agentic.ReviewState || '').toLowerCase() === 'pending' : false;
  const normalizedAgenticStatus = (agentic?.Status || '').toLowerCase();
  const agenticHasFailure = !agentic
    ? true
    : ['failed', 'error', 'errored', 'cancelled', 'canceled'].includes(normalizedAgenticStatus);

  function agenticStatusDisplay(run: AgenticRun | null): {
    label: string;
    className: string;
    description: string;
  } {
    if (!run) {
      return {
        label: 'Keine Daten',
        className: 'pill status status-info',
        description: 'Es liegen keine agentischen Ergebnisse vor.'
      };
    }
    const normalized = (run.Status || '').toLowerCase();
    let variant: 'info' | 'success' | 'error' | 'pending' = 'info';
    let label = run.Status || 'Unbekannt';
    let description = '';

    if (['failed', 'error', 'errored'].includes(normalized)) {
      variant = 'error';
      label = 'Fehler';
      description = 'Der agentische Durchlauf ist fehlgeschlagen.';
    } else if (['running', 'processing'].includes(normalized)) {
      variant = 'info';
      label = 'In Arbeit';
      description = 'Der agentische Durchlauf läuft derzeit.';
    } else if (['pending', 'queued'].includes(normalized)) {
      variant = 'pending';
      label = 'Wartet';
      description = 'Der agentische Durchlauf wartet auf Ausführung.';
    } else if (['cancelled', 'canceled'].includes(normalized)) {
      variant = 'info';
      label = 'Abgebrochen';
      description = 'Der agentische Durchlauf wurde abgebrochen.';
    } else if (['completed', 'done', 'success'].includes(normalized)) {
      if ((run.ReviewState || '').toLowerCase() === 'pending') {
        variant = 'pending';
        label = 'Fertig (Review offen)';
        description = 'Das Ergebnis wartet auf Freigabe.';
      } else if ((run.ReviewState || '').toLowerCase() === 'approved') {
        variant = 'success';
        label = 'Fertig (Freigegeben)';
        description = 'Das Ergebnis wurde freigegeben.';
      } else if ((run.ReviewState || '').toLowerCase() === 'rejected') {
        variant = 'error';
        label = 'Fertig (Abgelehnt)';
        description = 'Das Ergebnis wurde abgelehnt.';
      } else {
        variant = 'success';
        label = 'Fertig';
        description = 'Der agentische Durchlauf wurde abgeschlossen.';
      }
    } else {
      if (!label.trim()) {
        label = 'Unbekannt';
      }
      description = `Status: ${label}`;
    }

    return {
      label,
      className: `pill status status-${variant}`,
      description
    };
  }

  async function handleAgenticReview(decision: 'approved' | 'rejected') {
    if (!agentic) return;
    const actor = getUser();
    if (!actor) {
      window.alert('Bitte zuerst oben den Benutzer setzen.');
      return;
    }
    const confirmMessage =
      decision === 'approved'
        ? 'Agentisches Ergebnis freigeben?'
        : 'Agentisches Ergebnis ablehnen?';
    if (!window.confirm(confirmMessage)) return;
    const noteInput = window.prompt('Notiz (optional):', '') ?? '';
    setAgenticActionPending(true);
    setAgenticError(null);
    setAgenticReviewIntent(decision);
    try {
      const res = await fetch(
        `/api/items/${encodeURIComponent(agentic.ItemUUID)}/agentic/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor, decision, notes: noteInput })
        }
      );
      if (res.ok) {
        const data = await res.json();
        setAgentic(data.agentic ?? null);
        setAgenticError(null);
      } else {
        console.error('Agentic review update failed', res.status);
        setAgenticError('Review konnte nicht gespeichert werden.');
      }
    } catch (err) {
      console.error('Agentic review request failed', err);
      setAgenticError('Review-Anfrage fehlgeschlagen.');
    } finally {
      setAgenticReviewIntent(null);
      setAgenticActionPending(false);
    }
  }

  async function handleAgenticRestart() {
    if (!item) {
      console.warn('Agentic restart requested without loaded item data');
      setAgenticError('Artikel konnte nicht geladen werden.');
      return;
    }

    const actor = getUser();
    if (!actor) {
      window.alert('Bitte zuerst oben den Benutzer setzen.');
      return;
    }

    const baseSearchTerm = (agentic?.SearchQuery || derived?.artikelbeschreibung || '').trim();

    setAgenticActionPending(true);
    setAgenticError(null);
    setAgenticReviewIntent(null);

    try {
      const restartResponse = await fetch(
        `/api/items/${encodeURIComponent(currentItemId)}/agentic/restart`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor, search: baseSearchTerm })
        }
      );

      if (!restartResponse.ok) {
        console.error('Agentic restart failed', restartResponse.status);
        setAgenticError('Agentic-Neustart fehlgeschlagen.');
        return;
      }

      const body = await restartResponse
        .json()
        .catch((err) => {
          console.error('Failed to parse agentic restart response', err);
          return null;
        });

      const refreshedRun: AgenticRun | null = body?.agentic ?? null;
      setAgentic(refreshedRun);

      if (!refreshedRun) {
        console.warn('Agentic restart succeeded without returning a run');
        setAgenticError('Agentic-Neustart lieferte keine Daten.');
        return;
      }

      const searchTerm =
        (refreshedRun.SearchQuery ?? '').trim() ||
        baseSearchTerm ||
        derived?.artikelbeschreibung ||
        '';
      if (!searchTerm) {
        console.warn('Agentic restart skipped: missing search term');
        setAgenticError('Agentic-Neustart konnte nicht ausgelöst werden (fehlender Suchbegriff).');
        return;
      }
      const triggerPayload: AgenticRunTriggerPayload = {
        itemId: refreshedRun.ItemUUID || currentItemId,
        artikelbeschreibung: searchTerm
      };
      const triggerResult = await triggerAgenticRun({
        runUrl: agenticRunUrl,
        payload: triggerPayload,
        context: 'item detail restart'
      });
      if (triggerResult.outcome !== 'triggered') {
        console.warn('Agentic restart did not trigger run; auto-cancelling', triggerResult);
        const cancelResult = await persistAgenticRunCancellation({
          itemId: refreshedRun.ItemUUID || currentItemId,
          actor,
          context: 'item detail restart auto-cancel'
        });
        if (cancelResult.ok && cancelResult.agentic) {
          setAgentic(cancelResult.agentic);
        }
        const baseMessage =
          triggerResult.outcome === 'skipped' && triggerResult.reason === 'run-url-missing'
            ? 'Agentic-Konfiguration fehlt. Durchlauf wurde abgebrochen.'
            : 'Agentic-Neustart konnte nicht gestartet werden. Durchlauf wurde abgebrochen.';
        if (!cancelResult.ok) {
          setAgenticError(`${baseMessage} (Abbruch konnte nicht gespeichert werden.)`);
        } else {
          setAgenticError(baseMessage);
        }
        return;
      }
    } catch (err) {
      console.error('Agentic restart request failed', err);
      setAgenticError('Agentic-Neustart fehlgeschlagen.');
    } finally {
      setAgenticReviewIntent(null);
      setAgenticActionPending(false);
    }
  }

  async function handleAgenticCancel() {
    if (!agentic) {
      console.warn('Agentic cancel requested without run data');
      setAgenticError('Kein agentischer Durchlauf vorhanden.');
      return;
    }

    const actor = getUser();
    if (!actor) {
      window.alert('Bitte zuerst oben den Benutzer setzen.');
      return;
    }

    if (!window.confirm('Agentischen Durchlauf abbrechen?')) {
      return;
    }

    console.info('Agentic action cancellation requested', agentic.ItemUUID);

    setAgenticActionPending(true);
    setAgenticReviewIntent(null);
    setAgenticError(null);

    let updatedRun: AgenticRun | null = agentic;
    let finalError: string | null = null;

    const persistence = await persistAgenticRunCancellation({
      itemId: agentic.ItemUUID,
      actor,
      context: 'item detail cancel persistence'
    });

    if (persistence.ok) {
      if (persistence.agentic) {
        updatedRun = persistence.agentic;
      }
    } else if (persistence.status === 404) {
      finalError = 'Kein laufender agentischer Durchlauf gefunden.';
    } else if (persistence.status === 0) {
      finalError = 'Agentic-Abbruch fehlgeschlagen.';
    } else {
      finalError = 'Agentic-Abbruch konnte nicht gespeichert werden.';
    }

    if (agenticCancelUrl) {
      try {
        await cancelAgenticRun({
          cancelUrl: agenticCancelUrl,
          itemId: agentic.ItemUUID,
          actor,
          context: 'item detail cancel'
        });
      } catch (err) {
        console.error('Agentic external cancel failed', err);
        if (!finalError) {
          finalError = 'Agentic-Abbruch konnte extern nicht gestoppt werden.';
        }
      }
    } else {
      console.warn('Agentic cancel URL not configured; external cancellation skipped.');
    }

    if (updatedRun) {
      setAgentic(updatedRun);
    }
    setAgenticReviewIntent(null);
    setAgenticError(finalError);
    setAgenticActionPending(false);
  }

  const agenticStatus = agenticStatusDisplay(agentic);
  const agenticRows: [string, React.ReactNode][] = [];
  if (agentic?.LastModified) {
    agenticRows.push(['Zuletzt aktualisiert', formatDateTime(agentic.LastModified)]);
  }
  if (agentic?.ReviewState) {
    const reviewStateNormalized = agentic.ReviewState.toLowerCase();
    let reviewLabel = 'Nicht erforderlich';
    if (reviewStateNormalized === 'pending') reviewLabel = 'Ausstehend';
    else if (reviewStateNormalized === 'approved') reviewLabel = 'Freigegeben';
    else if (reviewStateNormalized === 'rejected') reviewLabel = 'Abgelehnt';
    else if (reviewStateNormalized && reviewStateNormalized !== 'not_required') {
      reviewLabel = agentic.ReviewState;
    }
    agenticRows.push(['Review-Status', reviewLabel]);
  }
  if (agentic?.ReviewedBy) {
    agenticRows.push(['Geprüft von', agentic.ReviewedBy]);
  }

  async function handleDelete() {
    if (!item) return;
    if (!window.confirm('Item wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(currentItemId)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser(), confirm: true })
      });
      if (res.ok) {
        if (derived?.boxId) {
          navigate(`/boxes/${encodeURIComponent(String(derived.boxId))}`);
        } else {
          navigate('/');
        }
      } else {
        console.error('Failed to delete item', res.status);
      }
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  }

  return (
    <div className="container item">
      <div className="grid landing-grid">
        {item ? (
          <>
            <div className="card">
              <h2>Artikel <span className="muted">({currentItemId})</span></h2>
              <section className="item-media-section">
                <h3>Medien</h3>
                <ItemMediaGallery
                  itemId={currentItemId}
                  grafikname={item.Grafikname}
                  mediaAssets={mediaAssets}
                />
              </section>
              <div className='row'>

                <table className="details">
                    <tbody>
                    {([
                      [
                        'Erstellt von',
                        resolveActorName(events.length ? events[events.length - 1].Actor : null)
                      ],
                      ['Artikelbeschreibung', derived?.artikelbeschreibung],
                      ['Artikelnummer', derived?.artikelNummer],
                      ['Anzahl', derived?.quantityValue],
                      [
                        'Behälter',
                        derived?.boxId
                          ? <Link to={`/boxes/${encodeURIComponent(String(derived.boxId))}`}>{derived.boxId}</Link>
                          : ''
                      ],
                      ['Kurzbeschreibung', derived?.kurzbeschreibung],
                      ['Erfasst am', derived?.datumErfasst ? formatDateTime(derived.datumErfasst as any) : ''],
                      ['Aktualisiert am', derived?.updatedAt ? formatDateTime(derived.updatedAt as any) : ''],
                      ['Verkaufspreis', derived?.verkaufspreis],
                      ['Langtext', derived?.langtext],
                      ['Hersteller', derived?.hersteller],
                      ['Länge (mm)', derived?.length],
                      ['Breite (mm)', derived?.width],
                      ['Höhe (mm)', derived?.height],
                      ['Gewicht (kg)', derived?.weight],
                      ['Einheit', derived?.einheit],
                      ['Standort', derived?.location || derived?.storedLocation || ''],
                      // ['Kivi-Link', item.WmsLink]
                    ] as [string, any][]).map(([k, v]) => (
                      <tr key={k} className="responsive-row">
                      <th className="responsive-th">{k}</th>
                      <td className="responsive-td">{v ?? ''}</td>
                      </tr>
                    ))}
                    </tbody>
                </table>
              </div>
              <div className='row'>
                <button type="button" className="btn" onClick={() => navigate(`/items/${encodeURIComponent(currentItemId)}/edit`)}>Bearbeiten</button>
                <button type="button" className="btn" onClick={async () => {
                  if (!window.confirm('Entnehmen?')) return;
                  const actor = getUser();
                  const primaryUrl = `/api/item-quants/${encodeURIComponent(currentItemId)}/decrement`;
                  const legacyUrl = `/api/items/${encodeURIComponent(currentItemId)}/remove`;
                  const requestInit: RequestInit = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ actor })
                  };
                  let response: Response | null = null;
                  try {
                    response = await fetch(primaryUrl, requestInit);
                    if (!response.ok && [404, 405, 501].includes(response.status)) {
                      console.warn('Primary decrement endpoint unavailable, falling back to legacy', {
                        status: response.status,
                        currentItemId
                      });
                      response = null;
                    }
                  } catch (err) {
                    console.error('Primary decrement endpoint failed', err);
                    response = null;
                  }

                  if (!response) {
                    try {
                      response = await fetch(legacyUrl, requestInit);
                    } catch (legacyErr) {
                      console.error('Legacy remove endpoint failed', legacyErr);
                      return;
                    }
                  }

                  if (!response) {
                    console.error('No response received for item removal', { currentItemId });
                    return;
                  }

                  if (!response.ok) {
                    console.error('Failed to remove item', response.status);
                    return;
                  }

                  const payload = await response
                    .json()
                    .catch((err) => {
                      console.error('Failed to parse item removal response', err);
                      return null;
                    });

                  const nextQuantity = typeof payload?.quantity === 'number' ? payload.quantity : undefined;
                  const nextBoxId =
                    payload && Object.prototype.hasOwnProperty.call(payload, 'boxId')
                      ? payload.boxId ?? null
                      : payload?.item?.BoxID ?? null;

                  setItem((prev) => {
                    if (!prev) {
                      return prev;
                    }
                    const updatedQuantity = {
                      ...(prev.quantity ?? {}),
                      Quantity: nextQuantity ?? prev.quantity?.Quantity ?? prev.Auf_Lager ?? 0,
                      BoxID: nextBoxId ?? prev.quantity?.BoxID ?? prev.BoxID ?? null
                    };
                    return {
                      ...prev,
                      Auf_Lager: updatedQuantity.Quantity,
                      BoxID: updatedQuantity.BoxID,
                      quantity: updatedQuantity
                    };
                  });
                  console.log('Item entnommen', currentItemId);
                }}>Entnehmen</button>
                <button type="button" className="btn danger" onClick={handleDelete}>Löschen</button>
              </div>
            </div>

            <AgenticStatusCard
              status={agenticStatus}
              rows={agenticRows}
              actionPending={agenticActionPending}
              reviewIntent={agenticReviewIntent}
              error={agenticError}
              needsReview={agenticNeedsReview}
              hasFailure={agenticHasFailure}
              onRestart={handleAgenticRestart}
              onReview={handleAgenticReview}
              onCancel={handleAgenticCancel}
            />

            <RelocateItemCard itemId={currentItemId} onRelocated={load} />

            <PrintLabelButton itemId={currentItemId} />

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
