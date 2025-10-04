import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models';
import BoxColorTag from './BoxColorTag';
import { formatDate } from '../lib/format';

export default function BoxListPage() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/boxes');
        if (!response.ok) {
          console.error('load boxes failed', response.status);
          if (isMounted) {
            setError('Behälter konnten nicht geladen werden.');
          }
          return;
        }

        const data = await response.json();
        const nextBoxes: Box[] = Array.isArray(data.boxes) ? data.boxes : [];
        if (!Array.isArray(data.boxes)) {
          console.error('Unexpected boxes payload shape', data);
        }
        if (isMounted) {
          setBoxes(nextBoxes);
          setError(null);
        }
        console.log('loaded boxes', nextBoxes.length);
      } catch (err) {
        console.error('fetch boxes failed', err);
        if (isMounted) {
          setError('Behälter konnten nicht geladen werden.');
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="container box">
      <h2>Alle Behälter</h2>
      {error ? (
        <div className="muted">{error}</div>
      ) : boxes.length ? (
        <div className="list">
          {boxes.map((box) => (
            <React.Fragment key={box.BoxID}>
              <Link className="linkcard" to={`/boxes/${encodeURIComponent(box.BoxID)}`}>
                <div className="card">
                  <div className="mono">{box.BoxID}</div>
                  <div>
                    <b>
                      Standort: <BoxColorTag locationKey={box.Location} />
                    </b>
                  </div>
                  <div className="muted">
                    Aktualisiert: {box.UpdatedAt ? formatDate(box.UpdatedAt) : ''}
                  </div>
                </div>
              </Link>
              <div className="spacer"></div>
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="muted">Noch keine Behälter vorhanden.</div>
      )}
    </div>
  );
}
