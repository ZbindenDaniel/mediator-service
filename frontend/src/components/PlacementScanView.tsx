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
        <button type="button" className="btn btn--primary" onClick={() => navigate(-1)}>
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

      {!pendingWarning && !processing && !statusMessage && (
        <div className="placement-scan__start">
          <button type="button" className="btn btn--primary" onClick={navigateToScanner}>
            ▶ Scannen starten
          </button>
        </div>
      )}
    </div>
  );
}
