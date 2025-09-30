import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateItemCard from './RelocateItemCard';
import type { Item, EventLog, AgenticRun } from '../../../models';
import { formatDateTime } from '../lib/format';
import { getUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import { buildAgenticRunUrl, resolveAgenticApiBase, triggerAgenticRun } from '../lib/agentic';
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemMediaGallery from './ItemMediaGallery';

interface Props {
  itemId: string;
}

export default function ItemDetail({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [agentic, setAgentic] = useState<AgenticRun | null>(null);
  const [agenticError, setAgenticError] = useState<string | null>(null);
  const [agenticActionPending, setAgenticActionPending] = useState(false);
  const navigate = useNavigate();

  const agenticApiBase = useMemo(resolveAgenticApiBase, []);
  const agenticRunUrl = useMemo(() => buildAgenticRunUrl(agenticApiBase), [agenticApiBase]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
        if (res.ok) {
          const data = await res.json();
          setItem(data.item);
          setEvents(data.events || []);
          setAgentic(data.agentic ?? null);
          setAgenticError(null);
        } else {
          console.error('Failed to fetch item', res.status);
          setAgentic(null);
          setAgenticError('Agentic-Status konnte nicht geladen werden.');
        }
      } catch (err) {
        console.error('Failed to fetch item', err);
        setAgentic(null);
        setAgenticError('Agentic-Status konnte nicht geladen werden.');
      }
    }
    load();
  }, [itemId]);

  const agenticNeedsReview = agentic ? (agentic.ReviewState || '').toLowerCase() === 'pending' : false;
  const normalizedAgenticStatus = (agentic?.Status || '').toLowerCase();
  const agenticHasFailure = !agentic
    ? true
    : ['failed', 'error', 'errored'].includes(normalizedAgenticStatus);

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

    const baseSearchTerm = (agentic?.SearchQuery || item.Artikelbeschreibung || '').trim();

    setAgenticActionPending(true);
    setAgenticError(null);

    try {
      const restartResponse = await fetch(
        `/api/items/${encodeURIComponent(item.ItemUUID)}/agentic/restart`,
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
        item.Artikelbeschreibung ||
        '';
      if (!searchTerm) {
        console.warn('Agentic restart skipped: missing search term');
        setAgenticError('Agentic-Neustart konnte nicht ausgelöst werden (fehlender Suchbegriff).');
        return;
      }
      const triggerPayload: AgenticRunTriggerPayload = {
        itemId: refreshedRun.ItemUUID || item.ItemUUID,
        artikelbeschreibung: searchTerm
      };
      await triggerAgenticRun({
        runUrl: agenticRunUrl,
        payload: triggerPayload,
        context: 'item detail restart'
      });
    } catch (err) {
      console.error('Agentic restart request failed', err);
      setAgenticError('Agentic-Neustart fehlgeschlagen.');
    } finally {
      setAgenticActionPending(false);
    }
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
      const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser(), confirm: true })
      });
      if (res.ok) {
        if (item.BoxID) {
          navigate(`/boxes/${encodeURIComponent(String(item.BoxID))}`);
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
              <h2>Artikel <span className="muted">({item.ItemUUID})</span></h2>
              <div className='row'>

                <table className="details">
                    <tbody>
                    {([
                      ['Erstellt von', events.length ? events[events.length - 1].Actor : ''],
                      ['Artikelbeschreibung', item.Artikelbeschreibung],
                      ['Artikelnummer', item.Artikel_Nummer],
                      ['Anzahl', item.Auf_Lager],
                      ['Behälter', item.BoxID ? <Link to={`/boxes/${encodeURIComponent(String(item.BoxID))}`}>{item.BoxID}</Link> : ''],
                      ['Kurzbeschreibung', item.Kurzbeschreibung],
                      ['Erfasst am', item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : ''],
                      ['Aktualisiert am', item.UpdatedAt ? formatDateTime(item.UpdatedAt) : ''],
                      ['Verkaufspreis', item.Verkaufspreis],
                      ['Langtext', item.Langtext],
                      ['Hersteller', item.Hersteller],
                      ['Länge (mm)', item.Länge_mm],
                      ['Breite (mm)', item.Breite_mm],
                      ['Höhe (mm)', item.Höhe_mm],
                      ['Gewicht (kg)', item.Gewicht_kg],
                      ['Einheit', item.Einheit],
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
                <button type="button" className="btn" onClick={() => navigate(`/items/${encodeURIComponent(item.ItemUUID)}/edit`)}>Bearbeiten</button>
                <button type="button" className="btn" onClick={async () => {
                  if (!window.confirm('Entnehmen?')) return;
                  try {
                    const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/remove`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ actor: getUser() })
                    });
                    if (res.ok) {
                      const j = await res.json();
                      setItem({ ...item, Auf_Lager: j.quantity, BoxID: j.boxId });
                      console.log('Item entnommen', item.ItemUUID);
                    } else {
                      console.error('Failed to remove item', res.status);
                    }
                  } catch (err) {
                    console.error('Entnahme fehlgeschlagen', err);
                  }
                }}>Entnehmen</button>
                <button type="button" className="btn danger" onClick={handleDelete}>Löschen</button>
              </div>
            </div>

            <div className="card">
              <h3>Agentic Status</h3>
              <div className="row">
                <span className={agenticStatus.className}>{agenticStatus.label}</span>
              </div>
              <p className="muted">{agenticStatus.description}</p>
              {agenticRows.length > 0 ? (
                <table className="details">
                  <tbody>
                    {agenticRows.map(([k, v], idx) => (
                      <tr key={`${k}-${idx}`} className="responsive-row">
                        <th className="responsive-th">{k}</th>
                        <td className="responsive-td">{v ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {agenticActionPending ? (
                <p className="muted">Agentic-Aktion wird ausgeführt…</p>
              ) : null}
              {agenticError ? (
                <p className="muted" style={{ color: '#a30000' }}>{agenticError}</p>
              ) : null}
              {!agenticNeedsReview && agenticHasFailure ? (
                <div className='row'>
                  <button
                    type="button"
                    className="btn"
                    disabled={agenticActionPending}
                    onClick={handleAgenticRestart}
                  >
                    Neu starten
                  </button>
                </div>
              ) : null}
              {agenticNeedsReview ? (
                <div className='row'>
                  <button
                    type="button"
                    className="btn"
                    disabled={agenticActionPending}
                    onClick={() => handleAgenticReview('approved')}
                  >
                    Freigeben
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={agenticActionPending}
                    onClick={() => handleAgenticReview('rejected')}
                  >
                    Ablehnen
                  </button>
                </div>
              ) : null}
            </div>

            <RelocateItemCard itemId={item.ItemUUID} />

            <PrintLabelButton itemId={item.ItemUUID} />

            <div className="card">
              <h3>Aktivitäten</h3>
              <ul className="events">
                {events.map((ev) => (
                  <li key={ev.Id}>
                    {formatDateTime(ev.CreatedAt)}: {ev.Actor ? ev.Actor : 'wer?'}{' hat ' + eventLabel(ev.Event)}
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
