import React from 'react';
import type { EventLog } from '../../../models';
import { formatDate } from '../lib/format';
import { eventLabel } from '../../../models/event-labels';
interface Props {
  events: EventLog[];
}

export default function RecentEventsCard({ events }: Props) {
  return (
    <div className="card">
      <h2 id="activity">Letzte Aktivitäten</h2>
      <div id="eventsOut" className="list">
        {events.length ? (
          events.map(e => (
            <React.Fragment key={e.Id}>
              <div className="card">
                <div>
                  <span className={`pill ${e.EntityType}`}>{e.EntityType == 'Box' ? 'Box' : 'Artikel'}</span>
                  <br />
                </div>
                <div>{formatDate(e.CreatedAt)} </div>
                <div> {eventLabel(e.Event)}{e.Actor ? ` von ${e.Actor}` : ''}</div>
              </div>
              <div className="spacer"></div>
            </React.Fragment>
          ))
        ) : (
          <div className="muted">Keine aktuellen Aktivitäten.</div>
        )}
      </div>
    </div>
  );
}

// formatting handled by formatDate util
