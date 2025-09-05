import React from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models';
import { formatDateTime } from '../lib/format';

interface Props {
  boxes: Box[];
}

export default function RecentBoxesCard({ boxes }: Props) {
  return (
    <div className="card">
      <h2 id="boxes">Letzte Boxen</h2>
      <div id="boxesOut" className="list">
        {boxes.length ? (
          boxes.map(b => (
            <React.Fragment key={b.BoxID}>
              <Link className="linkcard" to={`/boxes/${encodeURIComponent(b.BoxID)}`}>
                <div className="card">
                  <div><b>{b.BoxID}</b></div>
                  <div className="muted">Standort: {b.Location || '(nicht gesetzt)'} · Aktualisiert: {b.UpdatedAt ? formatDateTime(b.UpdatedAt) : ''}</div>
                </div>
              </Link>
              <div className="spacer"></div>
            </React.Fragment>
          ))
        ) : (
          <div className="muted">Noch keine Boxen.</div>
        )}
      </div>
    </div>
  );
}
