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

type UnscannedItem = {
  itemUUID: string;
  label: string;
  count: number;
  resolution: 'stock' | 'location' | null;
};

// The view remounts on every scan round-trip through /scan, so the set of items confirmed
// present this session can't live in component state — persist it in sessionStorage per box.
const scannedKey = (targetId: string) => `placement:scanned:${targetId}`;

function addScanned(targetId: string, uuid: string): void {
  try {
    const raw = sessionStorage.getItem(scannedKey(targetId));
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(uuid);
    sessionStorage.setItem(scannedKey(targetId), JSON.stringify([...set]));
  } catch {
    /* sessionStorage unavailable → reconciliation simply sees fewer confirmed items */
  }
}

function getScanned(targetId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(scannedKey(targetId));
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function clearScanned(targetId: string): void {
  try {
    sessionStorage.removeItem(scannedKey(targetId));
  } catch {
    /* no-op */
  }
}

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
  // exit-route reconciliation: box items that were never scanned this session
  const [reconcile, setReconcile] = useState<UnscannedItem[] | null>(null);
  const didInitRef = useRef(false);

  // A mount without a qrReturn is a fresh open (from BoxDetail), not a scan-loop return:
  // start the confirmed-present set clean so a previous session doesn't leak in.
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    const hasQr = !!(location.state as { qrReturn?: unknown } | null)?.qrReturn;
    if (!hasQr && targetId && mode === 'items') {
      clearScanned(targetId);
    }
  }, [location.state, targetId, mode]);

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
          // already in this box → count as confirmed present for the exit reconciliation
          addScanned(targetId, uuid);
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
    if (pendingWarning || processing || reconcile) return;
    if (handledQrRef.current !== null) return; // already looping; wait for warning resolution
    const timer = setTimeout(navigateToScanner, 300);
    return () => clearTimeout(timer);
  }, [pendingWarning, processing, reconcile, navigateToScanner, location.state]);

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
      if (mode === 'items' && targetId) {
        // moved into the target box → confirmed present for the exit reconciliation
        addScanned(targetId, pendingWarning.entityId);
      }
    } catch (err) {
      logError('PlacementScanView: move failed', err);
      setStatusMessage('Verschieben fehlgeschlagen');
      setProcessing(false);
      return;
    }
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

  // Exit route: compare the box's recorded items against what was scanned this session.
  // Items in the box that were never scanned are surfaced for removal (stock or location).
  const finishInventory = async () => {
    if (mode !== 'items' || !targetId) {
      navigate(-1);
      return;
    }
    setProcessing(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/boxes/${encodeURIComponent(targetId)}`);
      if (!res.ok) {
        setStatusMessage(`Behälter nicht gefunden (${res.status})`);
        setProcessing(false);
        return;
      }
      const data = await res.json() as {
        items?: Array<{ ItemUUID?: string; Artikel_Nummer?: string; Auf_Lager?: number | null }>;
      };
      const scanned = getScanned(targetId);
      const unscanned: UnscannedItem[] = (data.items ?? [])
        .filter((i) => typeof i.ItemUUID === 'string' && !scanned.has(i.ItemUUID))
        .map((i) => ({
          itemUUID: i.ItemUUID as string,
          label: i.Artikel_Nummer ?? (i.ItemUUID as string),
          count: typeof i.Auf_Lager === 'number' ? i.Auf_Lager : 0,
          resolution: null,
        }));
      setProcessing(false);
      if (unscanned.length === 0) {
        clearScanned(targetId);
        navigate(-1);
        return;
      }
      setReconcile(unscanned);
    } catch (err) {
      logError('PlacementScanView: finishInventory failed', err);
      setStatusMessage('Fehler beim Laden der Behälter-Artikel');
      setProcessing(false);
    }
  };

  const resolveUnscanned = async (itemUUID: string, action: 'stock' | 'location') => {
    if (!reconcile) return;
    setProcessing(true);
    try {
      const actor = await ensureUser();
      if (!actor) {
        setStatusMessage('Bitte zuerst oben den Benutzer setzen.');
        setProcessing(false);
        return;
      }
      const url = action === 'stock'
        ? `/api/items/${encodeURIComponent(itemUUID)}/remove`
        : `/api/items/${encodeURIComponent(itemUUID)}/clear-location`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setStatusMessage('Fehler: ' + (body.error ?? res.status));
        setProcessing(false);
        return;
      }
      setReconcile((prev) =>
        prev ? prev.map((u) => (u.itemUUID === itemUUID ? { ...u, resolution: action } : u)) : prev
      );
    } catch (err) {
      logError('PlacementScanView: resolveUnscanned failed', err);
      setStatusMessage('Aktion fehlgeschlagen');
    }
    setProcessing(false);
  };

  const resolveAllUnscanned = async (action: 'stock' | 'location') => {
    if (!reconcile) return;
    for (const item of reconcile) {
      if (item.resolution === null) {
        // sequential to keep actor resolution + error surfacing simple
        await resolveUnscanned(item.itemUUID, action);
      }
    }
  };

  const closeReconcile = () => {
    if (targetId) clearScanned(targetId);
    navigate(-1);
  };

  const title = mode === 'items'
    ? `Artikel einscannen → ${targetId ?? ''}`
    : `Behälter einlagern → ${targetId ?? ''}`;

  return (
    <div className="placement-scan">
      <div className="placement-scan__header">
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>
          Abbrechen
        </button>
        <h2>{title}</h2>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => (reconcile ? closeReconcile() : void finishInventory())}
        >
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

      {reconcile && (
        <div className="placement-scan__reconcile">
          <p>
            <strong>{reconcile.length}</strong>{' '}
            {reconcile.length === 1 ? 'Artikel wurde' : 'Artikel wurden'} nicht gescannt. Sind sie
            noch vorhanden?
          </p>
          <div className="placement-scan__reconcile-bulk">
            <span>Für alle:</span>
            <button
              type="button"
              className="btn"
              disabled={processing}
              onClick={() => void resolveAllUnscanned('stock')}
            >
              Bestand entfernen
            </button>
            <button
              type="button"
              className="btn"
              disabled={processing}
              onClick={() => void resolveAllUnscanned('location')}
            >
              Standort entfernen
            </button>
          </div>
          <ul className="placement-scan__reconcile-list">
            {reconcile.map((item) => (
              <li key={item.itemUUID} className="placement-scan__reconcile-row">
                <span className="placement-scan__reconcile-label">
                  {item.label}
                  {item.count > 1 ? ` (${item.count})` : ''}
                </span>
                {item.resolution ? (
                  <span className="placement-scan__reconcile-done">
                    {item.resolution === 'stock' ? '✓ Bestand entfernt' : '✓ Standort entfernt'}
                  </span>
                ) : (
                  <span className="placement-scan__reconcile-actions">
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={processing}
                      onClick={() => void resolveUnscanned(item.itemUUID, 'stock')}
                    >
                      Bestand entfernen
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      disabled={processing}
                      onClick={() => void resolveUnscanned(item.itemUUID, 'location')}
                    >
                      Standort entfernen
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--primary" onClick={closeReconcile}>
            Fertig
          </button>
        </div>
      )}

      {!pendingWarning && !processing && !statusMessage && !reconcile && (
        <div className="placement-scan__start">
          <button type="button" className="btn btn--primary" onClick={navigateToScanner}>
            ▶ Scannen starten
          </button>
        </div>
      )}
    </div>
  );
}
