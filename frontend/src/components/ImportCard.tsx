import React, { useCallback, useState } from 'react';
import LoadingPage from './LoadingPage';
import { useDialog } from './dialog';

// TODO: Extract the blocking overlay + messaging pattern into a shared hook when import flows expand.
// TODO: Extract the import result summary dialog builder into a shared helper once other importers are added.
// TODO(agent): Add progress reporting for large ZIP uploads once backpressure hooks are available in fetch.

interface ProcessingState {
  message: string;
}

/** Card handling ZIP-based import */
export default function ImportCard() {
  const dialog = useDialog();
  const [file, setFile] = useState<File | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const isBusy = Boolean(processing);

  const processingMessage = processing?.message ?? '';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setValid(null);
    setErrors([]);
    console.log('Selected import file', f?.name);
  }

  const handleValidate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setProcessing({ message: 'Archiv wird validiert…' });
    try {
      const payload = await file.arrayBuffer();
      const res = await fetch('/api/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip', 'X-Filename': file.name },
        body: payload
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setValid(true);
        setErrors([]);
        console.log('CSV validation ok', {
          itemCount: data.itemCount,
          boxCount: data.boxCount,
          boxesFileCount: data.boxesFileCount
        });
        setProcessing(null);
        try {
          await dialog.alert({
            title: 'Validierung erfolgreich',
            message: (
              <div>
                <p>
                  Die Datei enthält {data.itemCount ?? 0} Artikel und {data.boxCount ?? 0} Behälter.
                </p>
                <p>Zusätzliche Box-Stammdaten: {data.boxesFileCount ?? 0} Einträge.</p>
                {data.message && <p>{data.message}</p>}
                <p>Du kannst die Daten jetzt hochladen.</p>
              </div>
            )
          });
        } catch (alertError) {
          console.error('Failed to display validation success dialog', alertError);
        }
      } else {
        setValid(false);
        setErrors((data.errors || []).map((e: any) => JSON.stringify(e)));
        setProcessing(null);
        console.error('CSV validation failed', data);
        const errorMessage = data.error || data.message || 'Die ZIP-Datei konnte nicht validiert werden. Bitte versuche es später erneut.';
        try {
          await dialog.alert({
            title: 'Validierung fehlgeschlagen',
            message: errorMessage
          });
        } catch (alertError) {
          console.error('Failed to display generic validation failure dialog', alertError);
        }
      }
    } catch (err) {
      console.error('CSV validation failed', err);
      setValid(false);
      setProcessing(null);
      try {
        await dialog.alert({
          title: 'Validierung fehlgeschlagen',
          message: 'Beim Validieren des Archivs ist ein Fehler aufgetreten.'
        });
      } catch (alertError) {
        console.error('Failed to display validation error dialog', alertError);
      }
    }
  }, [dialog, file]);

  const handleUpload = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !valid) return;
    setProcessing({ message: 'Archiv wird hochgeladen…' });
    try {
      const payload = await file.arrayBuffer();
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/zip',
          'X-Filename': file.name
        },
        body: payload
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        console.log('CSV uploaded');
        const itemCount = typeof payload?.itemCount === 'number' ? payload.itemCount : undefined;
        const boxCount = typeof payload?.boxCount === 'number' ? payload.boxCount : undefined;
        const diffs = Array.isArray(payload?.diffs) ? payload.diffs : [];
        const uploadErrors = Array.isArray(payload?.errors) ? payload.errors : [];

        if (!payload || itemCount === undefined || boxCount === undefined) {
          console.error('Unexpected upload response payload', payload);
        }

        const message = (
          <div>
            <p>
              Import abgeschlossen. {itemCount !== undefined && boxCount !== undefined
                ? `Es wurden ${itemCount} Artikel und ${boxCount} Behälter verarbeitet.`
                : 'Es liegen keine detaillierten Zahlen vor.'}
            </p>
            {diffs.length > 0 && (
              <div>
                <p>Änderungen:</p>
                <ul>
                  {diffs.map((diff: any, index: number) => (
                    <li key={index}>{JSON.stringify(diff)}</li>
                  ))}
                </ul>
              </div>
            )}
            {uploadErrors.length > 0 && (
              <div>
                <p>Fehler:</p>
                <ul>
                  {uploadErrors.map((error: any, index: number) => (
                    <li key={index}>{JSON.stringify(error)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

        setProcessing(null);
        try {
          await dialog.alert({
            title: 'Import abgeschlossen',
            message
          });
        } catch (alertError) {
          console.error('Failed to display upload success dialog', alertError);
        }

        setFile(null);
        setValid(null);
        setErrors([]);
        setFileInputKey((key) => key + 1);
      } else {
        console.error('CSV upload HTTP error', res.status, payload);
        setProcessing(null);
        try {
          await dialog.alert({
            title: 'Upload fehlgeschlagen',
            message: (
              <div>
                <p>Die CSV konnte nicht hochgeladen werden. Bitte prüfe die Datei und versuche es erneut.</p>
                {Array.isArray(payload?.errors) && payload.errors.length > 0 && (
                  <ul>
                    {payload.errors.map((error: any, index: number) => (
                      <li key={index}>{JSON.stringify(error)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          });
        } catch (alertError) {
          console.error('Failed to display upload failure dialog', alertError);
        }
      }
    } catch (err) {
      console.error('CSV upload failed', err);
      setProcessing(null);
      try {
        await dialog.alert({
          title: 'Upload fehlgeschlagen',
          message: 'Beim Hochladen des Archivs ist ein unerwarteter Fehler aufgetreten.'
        });
      } catch (alertError) {
        console.error('Failed to display upload error dialog', alertError);
      }
    }
  }, [dialog, file, valid]);

  return (
    <div className="card" id="csv-import">
      {isBusy && (
        <div className="blocking-overlay" role="presentation">
          <div className="blocking-overlay__surface" role="dialog" aria-modal="true" aria-live="assertive">
            <LoadingPage message={processingMessage} />
          </div>
        </div>
      )}
      <h2>ZIP Import</h2>
      <form onSubmit={valid ? handleUpload : handleValidate}>
        <div className='row'>
          <input type="file" name="file" accept=".zip" onChange={handleFileChange} disabled={isBusy} />
        </div>
        <div className='row'>
          {valid === true && <div className="success">Validierung erfolgreich</div>}
          {valid === false && <div className="error">Validierung fehlgeschlagen</div>}
        </div>
        <div className='row'>
          {valid ? (
            <button type="submit" disabled={!file || isBusy}>Upload</button>
          ) : (
            <button type="submit" disabled={!file || isBusy}>Validieren</button>
          )}
        </div>
      </form>
      {errors.length > 0 && (
        <ul className="muted">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
