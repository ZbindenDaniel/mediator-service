import React from 'react';
import { Link } from 'react-router-dom';

/** Card linking to item creation */
export default function CreateItemCard() {
  return (
    <div className="card" id="create-item">
      <Link className="linkcard" to="/items/new">
        <div>
          <h2>Erfassen</h2>
          <p className="muted">Neuen Artikel erfassen und später platzieren</p>
        </div>
      </Link>
    </div>
  );
}
