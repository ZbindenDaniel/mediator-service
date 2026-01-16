import React from 'react';

/** Card describing item creation */
export default function CreateItemCard() {
  return (
    <div className="card" id="create-item">
      <a href="/items/new">
      <div>
        <h2>Erfassen</h2>
        <p className="muted">Neuen Artikel erfassen und später platzieren</p>
      </div>
      </a>
    </div>
  );
}
