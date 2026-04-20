import React from 'react';
import { eventLabel } from '../../../../models/event-labels';
import { formatDateTime } from '../../lib/format';
import { resolveActorName } from '../../lib/itemDetailFormatting';
import type { EventLog } from '../../../../models';

interface Props {
  events: EventLog[];
}

export default function ItemEventsTab({ events }: Props) {
  const displayedEvents = events.slice(0, 5);

  return (
    <div className="card grid-span-2">
      <h3>Aktivitäten</h3>
      <ul className="events">
        {displayedEvents.map((ev) => (
          <li key={ev.Id}>
            <span className="muted">[{formatDateTime(ev.CreatedAt)}]</span>{' '}
            {resolveActorName(ev.Actor)}{': ' + eventLabel(ev.Event)}
          </li>
        ))}
      </ul>
    </div>
  );
}
