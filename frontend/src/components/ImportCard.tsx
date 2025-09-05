import React, { useState } from 'react';

/** Card handling CSV import */
export default function ImportCard() {
  const [file, setFile] = useState<File | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setValid(null);
    setErrors([]);
    console.log('Selected import file', f?.name);
  }

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
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
        console.log('CSV validation ok');
      } else {
        setValid(false);
        setErrors((data.errors || []).map((e: any) => JSON.stringify(e)));
        console.error('CSV validation failed');
      }
    } catch (err) {
      console.error('CSV validation failed', err);
      setValid(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !valid) return;
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
      } else {
        console.error('CSV upload HTTP error', res.status);
      }
    } catch (err) {
      console.error('CSV upload failed', err);
    }
  }

  return (
    <div className="card" id="csv-import">
      <h2>CSV Import</h2>
      <form onSubmit={valid ? handleUpload : handleValidate}>
        <div className='row'>
          <input type="file" name="file" accept=".csv" onChange={handleFileChange} />
        </div>
        <div className='row'>
          {valid === true && <div className="success">Validierung erfolgreich</div>}
          {valid === false && <div className="error">Validierung fehlgeschlagen</div>}
        </div>
        <div className='row'>
          {valid ? <button type="submit" disabled={!file}>Upload</button> : <button type="submit" disabled={!file}>Validieren</button>}
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
