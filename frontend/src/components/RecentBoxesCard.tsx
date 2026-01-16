import React from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models';
import { formatDate } from '../lib/format';
import BoxTag from './BoxTag';

// TODO(agent): Confirm recent boxes still surface location labels clearly without color data.
// TODO(navigation): Keep header nav links aligned with cards as entry points evolve.

interface Props {
  boxes: Box[];
}

export default function RecentBoxesCard({ boxes }: Props) {
  const sortedBoxes = React.useMemo(() => {
    const parseUpdatedAt = (updatedAt?: string | null) => {
      if (!updatedAt) {
        return 0;
      }
      const timestamp = Date.parse(updatedAt);
      if (Number.isNaN(timestamp)) {
        console.warn('Encountered invalid UpdatedAt when sorting recent boxes', { updatedAt });
        return 0;
      }
      return timestamp;
    };

    return [...boxes].sort((a, b) => {
      const updatedAtDiff = parseUpdatedAt(b.UpdatedAt) - parseUpdatedAt(a.UpdatedAt);
      if (updatedAtDiff !== 0) {
        return updatedAtDiff;
      }
      return (b.BoxID || '').localeCompare(a.BoxID || '');
    });
  }, [boxes]);

  return (
    <div className="card">
      <div
        className="card-header">
        <a href="/boxes">
          <h2 id="boxes">Letzte Behälter</h2>
        </a>
      </div>
      <div id="boxesOut" className="list">
        {sortedBoxes.length ? (
          sortedBoxes.map(b => (
            <React.Fragment key={b.BoxID}>
              <Link className="linkcard" to={`/boxes/${encodeURIComponent(b.BoxID)}`}>
                <div className="card">
                  <div className="mono">{b.BoxID}</div>
                  <div><b>Standort: <BoxTag locationKey={b.LocationId} labelOverride={b.Label} /></b></div>
                  <div className="muted">Aktualisiert: {b.UpdatedAt ? formatDate(b.UpdatedAt) : ''}</div>
                </div>
              </Link>
            </React.Fragment>
          ))
        ) : (
          <div className="muted">Noch keine Behälter.</div>
        )}
      </div>
    </div>
  );
}
