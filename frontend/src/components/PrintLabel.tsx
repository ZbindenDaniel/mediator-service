import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { BoxLabelPayload, ItemLabelPayload } from '../../../models';
import { getUser } from '../lib/user';

type PrintKind = 'box' | 'item';

type BoxPayload = BoxLabelPayload;
type ItemPayload = ItemLabelPayload;
type PrintPayload = BoxPayload | ItemPayload;

interface PrintResponse<T extends PrintPayload> {
  template: string;
  payload: T;
}

const STYLES = `
  :root { color-scheme: only light; }
  .print-container {
    min-height: 100vh;
    margin: 0;
    box-sizing: border-box;
    padding: 24px 16px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: #e8ebf0;
  }
  .print-container.item { background: #f2f4f7; }
  .print-page {
    box-sizing: border-box;
    width: 148mm;
    height: 105mm;
    background: #fff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 6mm;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    padding: 12mm 16mm;
  }
  .print-page.item {
    padding: 14mm 18mm;
    border-radius: 5mm;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.15);
  }
  .print-page header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .print-page.item header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .print-page header h1 {
    font-size: 20pt;
    margin: 0;
    letter-spacing: 1px;
  }
  .print-page.item header h1 {
    font-size: 18pt;
    text-transform: uppercase;
  }
  .print-page header span {
    font-size: 10pt;
    color: #4b5563;
  }
  .print-page.item header span {
    font-size: 11pt;
    color: #475569;
  }
  .details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;
    font-size: 11pt;
  }
  .notes {
    margin-top: 12px;
    padding: 12px;
    border: 1px dashed #cbd5f5;
    border-radius: 4mm;
    min-height: 60px;
    font-size: 11pt;
    background: #f6f8fc;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 16px;
    font-size: 11pt;
  }
  .meta div strong {
    display: block;
    font-size: 9pt;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 2px;
  }
  .qr-wrapper {
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    gap: 20px;
  }
  .qr-wrapper img,
  .qr-wrapper canvas {
    width: 160px;
    height: 160px;
    image-rendering: pixelated;
  }
  .qr-wrapper.item img,
  .qr-wrapper.item canvas {
    width: 150px;
    height: 150px;
  }
  .qr-wrapper pre {
    font-size: 8pt;
    max-width: 250px;
    white-space: pre-wrap;
    background: #f1f5f9;
    padding: 8px;
    border-radius: 8px;
    color: #0f172a;
  }
  .print-status {
    font-size: 14px;
    color: #475569;
    text-align: center;
  }
  .print-error {
    color: #b91c1c;
    background: #fee2e2;
    padding: 12px 16px;
    border-radius: 12px;
    max-width: 460px;
    text-align: center;
    font-size: 14px;
  }
  .print-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  .print-actions button {
    padding: 10px 16px;
    border-radius: 8px;
    border: none;
    background: #1d4ed8;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
  }
  .print-actions button:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }
  @media print {
    body { background: none !important; }
    .print-container {
      background: none !important;
      padding: 0 !important;
      min-height: auto;
    }
    .print-page {
      margin: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    .print-actions,
    .print-status,
    .print-error {
      display: none !important;
    }
  }
`;

function isBoxPayload(value: unknown): value is BoxPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<BoxPayload>;
  return (
    typeof candidate.id === 'string' &&
    'notes' in candidate &&
    'qrDataUri' in candidate &&
    'qrModules' in candidate &&
    'qrMargin' in candidate
  );
}

function isItemPayload(value: unknown): value is ItemPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ItemPayload>;
  return (
    typeof candidate.id === 'string' &&
    'boxId' in candidate &&
    'qrDataUri' in candidate &&
    'qrModules' in candidate &&
    'qrMargin' in candidate
  );
}

function drawQrMatrix(canvas: HTMLCanvasElement, modules: boolean[][], margin: number): boolean {
  try {
    if (!Array.isArray(modules) || modules.length === 0) {
      console.warn('QR fallback rendering skipped: empty module matrix.');
      return false;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('Unable to obtain 2D context for QR fallback rendering.');
      return false;
    }

    const safeMargin = Number.isFinite(margin) ? Math.max(0, Math.floor(margin)) : 4;
    const moduleCount = modules.length;
    const totalModules = moduleCount + safeMargin * 2;
    const target = 320;
    const scale = Math.max(1, Math.floor(target / totalModules));
    const size = totalModules * scale;

    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    for (let row = 0; row < moduleCount; row += 1) {
      const rowData = modules[row];
      if (!Array.isArray(rowData)) {
        continue;
      }
      for (let col = 0; col < rowData.length; col += 1) {
        if (rowData[col]) {
          const x = (col + safeMargin) * scale;
          const y = (row + safeMargin) * scale;
          ctx.fillRect(x, y, scale, scale);
        }
      }
    }
    return true;
  } catch (err) {
    console.error('Failed to draw QR matrix for print label', err);
    return false;
  }
}

export default function PrintLabel() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const kindParam = (params.get('type') || '').trim().toLowerCase();
  const idParam = (params.get('id') || '').trim();
  const kind: PrintKind | null = kindParam === 'box' || kindParam === 'item' ? (kindParam as PrintKind) : null;

  const [status, setStatus] = useState<string>('Bereite Druckdaten vor…');
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [templatePath, setTemplatePath] = useState<string>('');
  const [canvasReady, setCanvasReady] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPayload(null);
      setTemplatePath('');
      setCanvasReady(false);

      if (!kind) {
        setError('Unbekannter Drucktyp. Bitte ?type=box oder ?type=item verwenden.');
        setStatus('');
        console.error('Print label aborted: missing or invalid type parameter', { type: kindParam, id: idParam });
        return;
      }

      if (!idParam) {
        setError('Es wurde keine ID übergeben. Bitte öffnen Sie den Druck über die Detailseite erneut.');
        setStatus('');
        console.warn('Print label aborted: missing id parameter', { type: kind });
        return;
      }

      setStatus('Lade Druckdaten…');
      setError(null);

      let actor = '';
      try {
        actor = getUser().trim();
      } catch (err) {
        console.error('Failed to resolve actor for print label', err);
      }

      if (!actor) {
        setError('Kein Benutzername hinterlegt. Bitte im Hauptfenster doppelklicken, um ihn zu setzen, und erneut versuchen.');
        setStatus('');
        console.warn('Print label aborted: empty actor after prompt', { type: kind, id: idParam });
        return;
      }

      const endpoint = kind === 'box'
        ? `/api/print/box/${encodeURIComponent(idParam)}`
        : `/api/print/item/${encodeURIComponent(idParam)}`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor })
        });

        if (cancelled) {
          return;
        }

        let data: PrintResponse<PrintPayload> | null = null;
        try {
          data = (await response.json()) as PrintResponse<PrintPayload>;
        } catch (parseErr) {
          console.error('Failed to parse print payload response', parseErr);
          setError('Antwort des Servers konnte nicht gelesen werden.');
          setStatus('');
          return;
        }

        if (!response.ok) {
          const message = typeof (data as any)?.error === 'string' ? (data as any).error : `HTTP ${response.status}`;
          setError(`Druckdaten konnten nicht geladen werden: ${message}`);
          setStatus('');
          console.error('Print payload request rejected', { endpoint, status: response.status, message });
          return;
        }

        const body = data ?? null;
        if (!body || !body.payload) {
          setError('Server lieferte keinen Payload zurück.');
          setStatus('');
          console.error('Print payload missing in response', { endpoint, body });
          return;
        }

        if (kind === 'box') {
          if (!isBoxPayload(body.payload)) {
            setError('Antwort enthält kein gültiges Behälter-Etikett.');
            setStatus('');
            console.error('Unexpected payload shape for box label', { endpoint, payload: body.payload });
            return;
          }
        } else {
          if (!isItemPayload(body.payload)) {
            setError('Antwort enthält kein gültiges Artikel-Etikett.');
            setStatus('');
            console.error('Unexpected payload shape for item label', { endpoint, payload: body.payload });
            return;
          }
        }

        setPayload(body.payload);
        setTemplatePath(body.template);
        setStatus('Vorlage geladen. Öffnen Sie den Druckdialog über Ihren Browser.');
        console.info('Print payload geladen', { endpoint, template: body.template });
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load print payload', err);
        setError('Druckdaten konnten nicht geladen werden. Prüfen Sie die Netzwerkverbindung.');
        setStatus('');
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [kind, kindParam, idParam]);

  useEffect(() => {
    if (!payload) {
      setCanvasReady(false);
      return;
    }

    if (payload.qrDataUri) {
      setCanvasReady(false);
      return;
    }

    if (!payload.qrModules || payload.qrModules.length === 0) {
      console.warn('QR fallback rendering skipped: no modules provided.');
      setCanvasReady(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('QR fallback rendering skipped: canvas element missing.');
      setCanvasReady(false);
      return;
    }

    const success = drawQrMatrix(canvas, payload.qrModules, payload.qrMargin);
    setCanvasReady(success);
  }, [payload]);

  useEffect(() => {
    if (!payload) {
      return;
    }
    try {
      if (kind === 'box') {
        document.title = payload.id ? `Behälter ${payload.id} – Etikett` : 'Behälter-Etikett';
      } else if (kind === 'item') {
        document.title = payload.id ? `Artikel ${payload.id} – Etikett` : 'Artikel-Etikett';
      }
    } catch (err) {
      console.warn('Failed to update document title for print label', err);
    }
  }, [kind, payload]);

  const handlePrint = () => {
    try {
      if (typeof window !== 'undefined') {
        window.print();
      }
    } catch (err) {
      console.error('Failed to open print dialog', err);
    }
  };

  const renderBox = (data: BoxPayload) => {
    const placedBy = data.placedBy?.trim() ? data.placedBy.trim() : 'Unbekannt';
    const placedAt = data.placedAt ? new Date(data.placedAt).toLocaleDateString('de-DE') : 'Datum offen';
    const notes = data.notes?.trim() ? data.notes : 'Keine Notizen vorhanden.';

    return (
      <div className="print-page box">
        <header>
          <div>
            <h1>{data.id ? `Behälter ${data.id}` : 'Behälter'}</h1>
            <span>{data.location ? `Standort: ${data.location}` : 'Standort unbekannt'}</span>
          </div>
          <div className="qr-wrapper">
            {data.qrDataUri ? (
              <img src={data.qrDataUri} alt="QR-Code" />
            ) : (
              <canvas ref={canvasRef} style={{ display: canvasReady ? 'block' : 'none' }} />
            )}
          </div>
        </header>
        <div className="details">
          <div>{`Eingelagert ${placedBy} am ${placedAt}`}</div>
          <div>{data.id ? `Payload-ID: ${data.id}` : ''}</div>
        </div>
        <div className="notes">{notes}</div>
      </div>
    );
  };

  const renderItem = (data: ItemPayload) => {
    const shortId = data.id ? data.id.slice(-6).toUpperCase() : '';
    const articleNumber = data.articleNumber?.trim() || '—';
    const boxId = data.boxId?.trim() || 'Nicht zugeordnet';
    const location = data.location?.trim() || 'Unbekannter Standort';
    const payloadJson = JSON.stringify(data, null, 2);

    return (
      <div className="print-page item">
        <header>
          <h1>{shortId ? `Artikel ${shortId}` : 'Artikel'}</h1>
          <span>{data.id || ''}</span>
        </header>
        <div className="meta">
          <div>
            <strong>Artikelnummer</strong>
            <span>{articleNumber}</span>
          </div>
          <div>
            <strong>Behälter</strong>
            <span>{boxId}</span>
          </div>
          <div>
            <strong>Standort</strong>
            <span>{location}</span>
          </div>
          <div>
            <strong>UUID</strong>
            <span>{data.id || '—'}</span>
          </div>
        </div>
        <div className="qr-wrapper item">
          <div>
            <small>Payload:</small>
            <pre>{payloadJson}</pre>
          </div>
          {data.qrDataUri ? (
            <img src={data.qrDataUri} alt="QR-Code" />
          ) : (
            <canvas ref={canvasRef} style={{ display: canvasReady ? 'block' : 'none' }} />
          )}
        </div>
      </div>
    );
  };

  const containerClass = `print-container ${kind === 'item' ? 'item' : 'box'}`;
  const ready = Boolean(payload);

  return (
    <div className={containerClass}>
      <style>{STYLES}</style>
      {ready && payload ? (kind === 'box' ? renderBox(payload as BoxPayload) : renderItem(payload as ItemPayload)) : null}
      {error ? <div className="print-error">{error}</div> : <div className="print-status">{status}</div>}
      <div className="print-actions">
        <button type="button" onClick={handlePrint} disabled={!ready}>
          Druckdialog öffnen
        </button>
        {templatePath && (
          <button
            type="button"
            onClick={() => {
              try {
                const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
                if (clipboard && typeof clipboard.writeText === 'function') {
                  clipboard
                    .writeText(templatePath)
                    .then(() => console.info('Vorlagenpfad in die Zwischenablage kopiert', { templatePath }))
                    .catch((err) => console.warn('Konnte Vorlagenpfad nicht kopieren', err));
                } else {
                  console.warn('Clipboard API nicht verfügbar, Vorlagenpfad:', templatePath);
                }
              } catch (err) {
                console.warn('Fehler beim Zugriff auf die Zwischenablage', err);
              }
            }}
          >
            Vorlagenpfad kopieren
          </button>
        )}
      </div>
    </div>
  );
}
