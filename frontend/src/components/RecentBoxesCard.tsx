import React from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models';
import { formatDate } from '../lib/format';

interface Props {
  boxes: Box[];
}

export default function RecentBoxesCard({ boxes }: Props) {
  return (
    <div className="card">
      <h2 id="boxes">Letzte Behälter</h2>
      <div id="boxesOut" className="list">
        {boxes.length ? (
          boxes.map(b => (
            <React.Fragment key={b.BoxID}>
              <Link className="linkcard" to={`/boxes/${encodeURIComponent(b.BoxID)}`}>
                <div className="card">
                  <div className="mono">{b.BoxID}</div>
                  <div><b>Standort: {b.Location || '(nicht gesetzt)'}</b></div>
                  <div className="muted">Aktualisiert: {b.UpdatedAt ? formatDate(b.UpdatedAt) : ''}</div>
                </div>
              </Link>
              <div className="spacer"></div>
            </React.Fragment>
          ))
        ) : (
          <div className="muted">Noch keine Behälter.</div>
        )}
      </div>
    </div>
  );
}
