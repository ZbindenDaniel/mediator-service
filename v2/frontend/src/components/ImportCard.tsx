import React, { useState } from 'react';

/** Card handling CSV import */
export default function ImportCard() {
  const [file, setFile] = useState<File | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    console.log('Selected import file', f?.name);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
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
      <form onSubmit={handleSubmit}>
        <input type="file" name="file" accept=".csv" onChange={handleFileChange} />
        <button type="submit" disabled={!file}>Upload</button>
      </form>
    </div>
  );
}
