import React from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models';
import { formatDate } from '../lib/format';
import BoxColorTag from './BoxColorTag';

interface Props {
  boxes: Box[];
}

export default function RecentBoxesCard({ boxes }: Props) {
  return (
    <div className="card">
      <div
        className="card-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <h2 id="boxes">Letzte Behälter</h2>
        <Link className="btn" to="/boxes">
          Alle Behälter
        </Link>
      </div>
      <div id="boxesOut" className="list">
        {boxes.length ? (
          boxes.map(b => (
            <React.Fragment key={b.BoxID}>
              <Link className="linkcard" to={`/boxes/${encodeURIComponent(b.BoxID)}`}>
                <div className="card">
                  <div className="mono">{b.BoxID}</div>
                  <div><b>Standort: <BoxColorTag locationKey={b.Location} boxId={b.BoxID} /></b></div>
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
