import React from 'react';

export default function ImportPage() {
  return (
    <div className="import-page">
      <h2>Import CSV</h2>
      <form method="post" action="/api/import" encType="multipart/form-data">
        <input type="file" name="file" accept=".csv" />
        <button type="submit">Upload</button>
      </form>
    </div>
  );
}
