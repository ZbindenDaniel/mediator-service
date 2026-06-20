import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ensureUser } from '../lib/user';
import { logError } from '../utils/logger';

type PendingWarning = {
  entityId: string;
  itemUUID?: string;
  label: string;
  currentLocation: string;
};

type ChecklistEntry = {
  id: string;
  label: string;
  description?: string;
};

export default function PlacementScanView() {
  const { targetId } = useParams<{ targetId: string }>();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'boxes' ? 'boxes' : 'items';
  const location = useLocation();
  const navigate = useNavigate();

  const [pendingWarning, setPendingWarning] = useState<PendingWarning | null>(null);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  // prevents double-processing the same qrReturn payload on StrictMode double-invoke
  const handledQrRef = useRef<string | null>(null);

  const [checklist, setChecklist] = useState<ChecklistEntry[]>([]);
  const [foundIds, setFoundIds] = useState<Set<string>>(new Set());
  const [missingItems, setMissingItems] = useState<ChecklistEntry[]>([]);
  const [markingLost, setMarkingLost] = useState(false);

  // load expected items (or boxes) for the target on mount
  useEffect(() => {
    if (!targetId) return;
    fetch(`/api/boxes/${encodeURIComponent(targetId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: {
        items?: Array<{ ItemUUID: string; Artikel_Nummer?: string | null; Artikelbeschreibung?: string }>;
        containedBoxes?: Array<{ BoxID: string; Label?: string | null }>;
      }) => {
        if (mode === 'items') {
          setChecklist(
            (data.items ?? []).map(item => ({
              id: item.ItemUUID,
              label: item.Artikel_Nummer ?? item.ItemUUID,
              description: item.Artikelbeschreibung,
            }))
          );
        } else {
          setChecklist(
            (data.containedBoxes ?? []).map(box => ({
              id: box.BoxID,
              label: box.BoxID,
              description: box.Label ?? undefined,
            }))
          );
        }
      })
      .catch(() => { /* leave checklist empty; scan loop works without it */ });
  }, [targetId, mode]);

  const navigateToScanner = useCallback(() => {
    if (!targetId) return;
    const returnTo = `/placement/${encodeURIComponent(targetId)}?mode=${mode}`;
    navigate(`/scan?returnTo=${encodeURIComponent(returnTo)}&intent=placement-scan`);
  }, [navigate, targetId, mode]);

  const processScan = useCallback(async (qrReturn: {
    id: string;
    itemUUID?: string;
    rawPayload?: string;
  }) => {
    if (!targetId) return;
    setProcessing(true);
    setStatusMessage(null);
    try {
      if (mode === 'items') {
        const uuid = qrReturn.itemUUID || qrReturn.id;
        const res = await fetch(`/api/items/${encodeURIComponent(uuid)}`);
        if (!res.ok) {
          setStatusMessage(`Artikel nicht gefunden (${res.status})`);
          setProcessing(false);
          return;
        }
        const data = await res.json() as { item?: { BoxID?: string | null; Artikel_Nummer?: string } };
        const currentBoxId = data.item?.BoxID ?? null;
        const label = data.item?.Artikel_Nummer ?? qrReturn.id;
        if (currentBoxId === targetId) {
          setFoundIds(prev => { const next = new Set(prev); next.add(uuid); return next; });
          setProcessing(false);
          navigateToScanner();
          return;
        }
        const currentLocation = currentBoxId ?? 'kein Behälter';
        setPendingWarning({ entityId: uuid, itemUUID: uuid, label, currentLocation });
      } else {
        const boxId = qrReturn.id;
        const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
        if (!res.ok) {
          setStatusMessage(`Behälter nicht gefunden (${res.status})`);
          setProcessing(false);
          return;
        }
        const data = await res.json() as { box?: { LocationId?: string | null; BoxID?: string } };
        const currentLocationId = data.box?.LocationId ?? null;
        const label = data.box?.BoxID ?? boxId;
        if (currentLocationId === targetId) {
          setFoundIds(prev => { const next = new Set(prev); next.add(boxId); return next; });
          setProcessing(false);
          navigateToScanner();
          return;
        }
        const currentLocation = currentLocationId ?? 'kein Regal';
        setPendingWarning({ entityId: boxId, label, currentLocation });
      }
    } catch (err) {
      logError('PlacementScanView: processScan failed', err);
      setStatusMessage('Fehler beim Abrufen der Daten');
    }
    setProcessing(false);
  }, [targetId, mode, navigateToScanner]);

  useEffect(() => {
    const state = location.state as { qrReturn?: { id?: unknown; itemUUID?: unknown; rawPayload?: unknown; intent?: unknown } } | null;
    const qr = state?.qrReturn;
    if (!qr) return;
    const id = typeof qr.id === 'string' ? qr.id.trim() : '';
    const intent = typeof qr.intent === 'string' ? qr.intent : '';
    if (!id || intent !== 'placement-scan') return;
    if (handledQrRef.current === id) return;
    handledQrRef.current = id;
    const itemUUID = typeof qr.itemUUID === 'string' ? qr.itemUUID.trim() : undefined;
    const rawPayload = typeof qr.rawPayload === 'string' ? qr.rawPayload : undefined;
    // clear state so a back-navigation doesn't re-trigger
    navigate(location.pathname + location.search, { replace: true, state: {} });
    void processScan({ id, itemUUID, rawPayload });
  }, [location.state, location.pathname, location.search, navigate, processScan]);

  // auto-navigate to scanner on first visit (no pending warning, not processing)
  useEffect(() => {
    const state = location.state as { qrReturn?: unknown } | null;
    if (state?.qrReturn) return; // being handled by the other effect
    if (pendingWarning || processing) return;
    if (handledQrRef.current !== null) return; // already looping; wait for warning resolution
    const timer = setTimeout(navigateToScanner, 300);
    return () => clearTimeout(timer);
  }, [pendingWarning, processing, navigateToScanner, location.state]);

  const handleConfirm = async () => {
    if (!pendingWarning || !targetId) return;
    setProcessing(true);
    try {
      const actor = await ensureUser();
      if (!actor) {
        setStatusMessage('Bitte zuerst oben den Benutzer setzen.');
        setProcessing(false);
        return;
      }
      let res: Response;
      if (mode === 'items') {
        res = await fetch(`/api/items/${encodeURIComponent(pendingWarning.entityId)}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toBoxId: targetId, actor }),
        });
      } else {
        res = await fetch(`/api/boxes/${encodeURIComponent(pendingWarning.entityId)}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ LocationId: targetId, actor }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setStatusMessage('Fehler: ' + (data.error ?? res.status));
        setProcessing(false);
        return;
      }
    } catch (err) {
      logError('PlacementScanView: move failed', err);
      setStatusMessage('Verschieben fehlgeschlagen');
      setProcessing(false);
      return;
    }
    setFoundIds(prev => { const next = new Set(prev); next.add(pendingWarning.entityId); return next; });
    setPendingWarning(null);
    handledQrRef.current = null;
    setProcessing(false);
    navigateToScanner();
  };

  const handleSkip = () => {
    setPendingWarning(null);
    handledQrRef.current = null;
    navigateToScanner();
  };

  const VERLOREN_SHELF_ID = 'S-0000-0404';

  const handleClose = () => {
    const ausstehend = checklist.filter(e => !foundIds.has(e.id));
    if (ausstehend.length > 0) {
      setMissingItems(ausstehend);
    } else {
      navigate(-1);
    }
  };

  const handleMarkLost = async () => {
    const actor = await ensureUser();
    if (!actor) { setMissingItems([]); navigate(-1); return; }
    setMarkingLost(true);

    // ensure Verloren shelf exists — ignore 409 (already exists)
    await fetch('/api/boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'shelf', location: '0000', floor: '0404',
        shelfId: VERLOREN_SHELF_ID, label: 'Verloren', actor,
      }),
    }).catch(() => {});

    if (mode === 'items') {
      await Promise.allSettled(
        missingItems.map(e =>
          fetch(`/api/items/${encodeURIComponent(e.id)}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toBoxId: VERLOREN_SHELF_ID, actor }),
          })
        )
      );
    } else {
      await Promise.allSettled(
        missingItems.map(e =>
          fetch(`/api/boxes/${encodeURIComponent(e.id)}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ LocationId: VERLOREN_SHELF_ID, actor }),
          })
        )
      );
    }

    setMarkingLost(false);
    navigate(-1);
  };

  const title = mode === 'items'
    ? `Artikel einscannen → ${targetId ?? ''}`
    : `Behälter einlagern → ${targetId ?? ''}`;

  const foundCount = checklist.filter(e => foundIds.has(e.id)).length;
  const missCount = checklist.length - foundCount;

  return (
    <div className="placement-scan">
      <div className="placement-scan__header">
        <button type="button" className="btn btn--ghost" onClick={handleClose}>
          Abbrechen
        </button>
        <h2>{title}</h2>
        <button type="button" className="btn btn--primary" onClick={handleClose}>
          Fertig
        </button>
      </div>

      {statusMessage && (
        <div className="placement-scan__status">
          <p>{statusMessage}</p>
          <button type="button" className="btn" onClick={navigateToScanner}>
            Weiter scannen
          </button>
        </div>
      )}

      {pendingWarning && !processing && (
        <div className="placement-scan__warning">
          <p>
            <strong>{pendingWarning.label}</strong> ist in{' '}
            <strong>{pendingWarning.currentLocation}</strong>. Hierher verschieben?
          </p>
          <div className="placement-scan__warning-actions">
            <button type="button" className="btn btn--primary" onClick={() => void handleConfirm()}>
              Verschieben
            </button>
            <button type="button" className="btn" onClick={handleSkip}>
              Überspringen
            </button>
          </div>
        </div>
      )}

      {processing && (
        <div className="placement-scan__status">
          <p>Wird verarbeitet…</p>
        </div>
      )}

      {checklist.length > 0 ? (
        <div className="placement-scan__checklist-area">
          <div className="placement-scan__checklist-summary">
            {foundCount} von {checklist.length} gescannt
            {missCount > 0 && <span className="placement-scan__checklist-miss"> · {missCount} ausstehend</span>}
          </div>
          <div className="placement-scan__checklist">
            {checklist.map(entry => {
              const found = foundIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className={`placement-scan__checklist-row${found ? ' placement-scan__checklist-row--found' : ''}`}
                >
                  <span className="placement-scan__checklist-label">
                    <strong>{entry.label}</strong>
                    {entry.description && (
                      <span className="placement-scan__checklist-desc"> · {entry.description}</span>
                    )}
                  </span>
                  <span className={`badge ${found ? 'status-success' : 'status-pending'}`}>
                    {found ? 'gefunden' : 'ausstehend'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        !pendingWarning && !processing && !statusMessage && (
          <div className="placement-scan__start">
            <button type="button" className="btn btn--primary" onClick={navigateToScanner}>
              ▶ Scannen starten
            </button>
          </div>
        )
      )}

      {missingItems.length > 0 && (
        <div className="placement-scan__missing-overlay">
          <h2>{mode === 'items' ? 'Nicht gefundene Artikel' : 'Nicht gefundene Behälter'}</h2>
          <ul className="placement-scan__missing-list">
            {missingItems.map(e => (
              <li key={e.id}>
                <strong>{e.label}</strong>
                {e.description && <span className="placement-scan__checklist-desc"> · {e.description}</span>}
              </li>
            ))}
          </ul>
          <p>
            Sind {mode === 'items' ? 'diese Artikel' : 'diese Behälter'} ganz sicher nicht hier?
          </p>
          <div className="placement-scan__missing-actions">
            {markingLost ? (
              <p>Wird verarbeitet…</p>
            ) : (
              <>
                <button type="button" className="btn btn--danger" onClick={() => void handleMarkLost()}>
                  Als verloren markieren
                </button>
                <button type="button" className="btn" onClick={() => navigate(-1)}>
                  Schliessen ohne Aktion
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
