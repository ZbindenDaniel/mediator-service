import React from 'react';

/** Card handling CSV import */
export default function ImportCard() {
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    console.log('Selected import file', file?.name);
  }

  function handleSubmit() {
    console.log('Submitting CSV import');
  }

  return (
    <div className="card" id="csv-import">
      <h2>CSV Import</h2>
      <form
        method="post"
        action="/api/import"
        encType="multipart/form-data"
        onSubmit={handleSubmit}
      >
        <input type="file" name="file" accept=".csv" onChange={handleFileChange} />
        <button type="submit">Upload</button>
      </form>
    </div>
  );
}
