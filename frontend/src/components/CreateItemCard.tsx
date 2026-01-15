import React from 'react';

/** Card describing item creation */
export default function CreateItemCard() {
  return (
    <div className="card" id="create-item">
      {/* TODO(navigation): Revisit copy if header navigation labels are updated. */}
      <div>
        <h2>Erfassen</h2>
        <p className="muted">Neuen Artikel erfassen und später platzieren</p>
      </div>
    </div>
  );
}
