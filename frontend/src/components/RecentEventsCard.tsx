import React from 'react';
import type { EventLog } from '../../../models';
import { formatDate } from '../lib/format';
import { eventLabel } from '../../../models/event-labels';
import { Link } from 'react-router-dom';
import { filterVisibleEvents } from '../utils/eventLogTopics';

// TODO(agent): Surface active topic filters in the UI to avoid confusing operators.

interface ResolvedEventLink {
  path: string;
  ariaSuffix: string;
}

function resolveEventLink(event: EventLog): ResolvedEventLink {
  try {
    if (!event || !event.EntityType) {
      console.warn('RecentEventsCard: Missing event payload, falling back to /activities.', event);
      return {
        path: '/activities',
        ariaSuffix: 'Aktivitätenübersicht',
      };
    }

    if (event.EntityType === 'Box') {
      if (event.EntityId) {
        return {
          path: `/boxes/${encodeURIComponent(event.EntityId)}`,
          ariaSuffix: `Behälter ${event.EntityId}`,
        };
      }

      console.warn('RecentEventsCard: Missing EntityId for Box event, falling back to /boxes.', event);
      return {
        path: '/boxes',
        ariaSuffix: 'Behälterliste',
      };
    }

    if (event.EntityType === 'Item') {
      if (event.EntityId) {
        return {
          path: `/items/${encodeURIComponent(event.EntityId)}`,
          ariaSuffix: `Artikel ${event.EntityId}`,
        };
      }

      console.warn('RecentEventsCard: Missing EntityId for Item event, falling back to /items.', event);
      return {
        path: '/items',
        ariaSuffix: 'Artikelliste',
      };
    }

    console.warn('RecentEventsCard: Unknown EntityType for event, falling back to /activities.', event);
    return {
      path: '/activities',
      ariaSuffix: 'Aktivitätenübersicht',
    };
  } catch (error) {
    console.error('RecentEventsCard: Error while resolving link target.', error, event);
    return {
      path: '/activities',
      ariaSuffix: 'Aktivitätenübersicht',
    };
  }
}

interface Props {
  events: EventLog[];
}

export function RecentEventsList({ events }: Props) {
  const allowedEvents = filterVisibleEvents(events);
  return (
    <div id="eventsOut" className="list">
      {allowedEvents.length ? (
        allowedEvents.map((e) => {
          const { path, ariaSuffix } = resolveEventLink(e);
          const formattedDate = formatDate(e.CreatedAt);
          const label = eventLabel(e.Event);
          const actorText = e.Actor ? `${e.Actor}: ` : '[?] ';
          const ariaActor = e.Actor ? `${e.Actor}: ` : 'Unbekannt: ';
          const ariaLabel = `${ariaActor}${label} am ${formattedDate} – ${ariaSuffix}`;

          return (
            <React.Fragment key={e.Id}>
              <Link className="linkcard" to={path} tabIndex={0} aria-label={ariaLabel}>
                <div className="card event-card">
                  <div>
                    <span className={`pill ${e.EntityType}`}>{e.EntityType == 'Box' ? 'Behälter  ' : 'Artikel  '}</span>
                    <br />
                  </div>
                  <div className="muted">{e.EntityId}</div>
                  <div className="muted">{formattedDate} </div>
                  <div className="event-row">
                    <span>
                      {actorText}
                      {label}
                    </span>
                  </div>
                </div>
              </Link>
            </React.Fragment>
          );
        })
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
        <h2 id="activity">Letzte Aktivitäten</h2>
        <Link to="/activities" id="all-events" aria-label="Alle Aktivitäten anzeigen">
          Alle
        </Link>
      </div>
      <RecentEventsList events={events} />
    </div>
  );
}

// formatting handled by formatDate util
