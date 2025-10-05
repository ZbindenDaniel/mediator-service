import React from 'react';
import type { EventLog } from '../../../models';
import { formatDate } from '../lib/format';
import { eventLabel } from '../../../models/event-labels';
import { Link } from 'react-router-dom';
interface Props {
  events: EventLog[];
}

export function RecentEventsList({ events }: Props) {
  return (
    <div id="eventsOut" className="list">
      {events.length ? (
        events.map((e) => (
          <React.Fragment key={e.Id}>
            <div className="card">
              <div>
                <span className={`pill ${e.EntityType}`}>{e.EntityType == 'Box' ? 'Behälter' : 'Artikel'}</span>
                <br />
              </div>
              <div>{formatDate(e.CreatedAt)} </div>
              <div> {eventLabel(e.Event)}{e.Actor ? ` von ${e.Actor}` : ''}</div>
              <div className="muted">
                {e.EntityId}
              </div>
            </div>
            <div className="spacer"></div>
          </React.Fragment>
        ))
      ) : (
        <div className="muted">Keine aktuellen Aktivitäten.</div>
      )}
    </div>
  );
}

export default function RecentEventsCard({ events }: Props) {
  return (
    
    <div className="card">
       <div className="card-header">
              <h2 id='activity'>Letzte Aktivitäten</h2>
              <Link to="/activities" id="all-events" aria-label="Alle Aktivitäten anzeigen">
                Alle
              </Link>
            </div>
      <RecentEventsList events={events} />
    </div>
  );
}

// formatting handled by formatDate util
