import React from 'react';
import { formatDateTime } from '../../lib/format';
import { resolveActorName } from '../../lib/itemDetailFormatting';
import { formatEventDescription } from '../../utils/eventDescription';
import type { EventLog } from '../../../../models';

interface Props {
  events: EventLog[];
}

export default function ItemEventsTab({ events }: Props) {
  const displayedEvents = events.slice(0, 5);

  return (
    <div className="card">
      <h3>Aktivitäten</h3>
      {displayedEvents.length === 0 ? (
        <p className="muted">Keine Aktivitäten.</p>
      ) : (
        <ul className="events">
          {displayedEvents.map((ev) => (
            <li key={ev.Id}>
              <span className="muted">[{formatDateTime(ev.CreatedAt)}]</span>{' '}
              <span>{resolveActorName(ev.Actor)}: </span>
              <span>{formatEventDescription(ev)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
