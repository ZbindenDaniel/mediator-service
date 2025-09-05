import React from 'react';
import { Link } from 'react-router-dom';

/** Card linking to the import page */
export default function ImportCard() {
  return (
    <div className="card" id="import">
      <Link className="linkcard" to="/import">
        <div className="card">
          <h2>Erfassen</h2>
          <p className="muted">Neue Box anlegen und Artikel erfassen</p>
        </div>
      </Link>
    </div>
  );
}
