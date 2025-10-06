import React, { useCallback, useState } from 'react';
import LoadingPage from './LoadingPage';
import { useDialog } from './dialog';

// TODO: Extract the blocking overlay + messaging pattern into a shared hook when import flows expand.

interface ProcessingState {
  message: string;
}

/** Card handling CSV import */
export default function ImportCard() {
  const dialog = useDialog();
  const [file, setFile] = useState<File | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);

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
    setProcessing({ message: 'CSV wird validiert…' });
    try {
      const text = await file.text();
      const res = await fetch('/api/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setValid(true);
        setErrors([]);
        console.log('CSV validation ok', {
          itemCount: data.itemCount,
          boxCount: data.boxCount
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
        if (!Array.isArray(data.errors) || data.errors.length === 0) {
          try {
            await dialog.alert({
              title: 'Validierung fehlgeschlagen',
              message: 'Die CSV konnte nicht validiert werden. Bitte versuche es später erneut.'
            });
          } catch (alertError) {
            console.error('Failed to display generic validation failure dialog', alertError);
          }
        }
      }
    } catch (err) {
      console.error('CSV validation failed', err);
      setValid(false);
      setProcessing(null);
      try {
        await dialog.alert({
          title: 'Validierung fehlgeschlagen',
          message: 'Beim Validieren der CSV ist ein Fehler aufgetreten.'
        });
      } catch (alertError) {
        console.error('Failed to display validation error dialog', alertError);
      }
    }
  }, [dialog, file]);

  const handleUpload = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !valid) return;
    setProcessing({ message: 'CSV wird hochgeladen…' });
    try {
      const text = await file.text();
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'X-Filename': file.name
        },
        body: text
      });
      if (res.ok) {
        console.log('CSV uploaded');
        window.location.reload();
      } else {
        console.error('CSV upload HTTP error', res.status);
        setProcessing(null);
        try {
          await dialog.alert({
            title: 'Upload fehlgeschlagen',
            message: 'Die CSV konnte nicht hochgeladen werden. Bitte prüfe die Datei und versuche es erneut.'
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
          message: 'Beim Hochladen der CSV ist ein unerwarteter Fehler aufgetreten.'
        });
      } catch (alertError) {
        console.error('Failed to display upload error dialog', alertError);
      }
    } finally {
      setProcessing(null);
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
      <h2>CSV Import</h2>
      <form onSubmit={valid ? handleUpload : handleValidate}>
        <div className='row'>
          <input type="file" name="file" accept=".csv" onChange={handleFileChange} disabled={isBusy} />
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
