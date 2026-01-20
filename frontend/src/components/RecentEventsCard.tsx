import React, { useState } from 'react';
import type { EventLog } from '../../../models';
import { formatDate } from '../lib/format';
import { eventLabel } from '../../../models/event-labels';
import { Link, useNavigate } from 'react-router-dom';
import { filterVisibleEvents } from '../utils/eventLogTopics';

// TODO(agent): Surface active topic filters in the UI to avoid confusing operators.
// TODO(agent): Follow up on filtering the activities feed by query once backend support lands.
// TODO(navigation): Validate header navigation coverage before reintroducing card-level links.
// TODO(labeling): Reconfirm the activities table header labels against product terminology.

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
        <div className="item-list-wrapper">
          <table className="item-list activities-table" aria-label="Letzte Aktivitäten">
            <thead>
              <tr>
                <th scope="col">Typ</th>
                <th scope="col">ID</th>
                <th scope="col">Akteur</th>
                <th scope="col">Aktion</th>
                <th scope="col">Datum</th>
              </tr>
            </thead>
            <tbody>
              {allowedEvents.map((e) => {
                const { path, ariaSuffix } = resolveEventLink(e);
                const formattedDate = formatDate(e.CreatedAt);
                const label = eventLabel(e.Event);
                const actorText = e.Actor ?? '[?]';
                const ariaActor = e.Actor ? `${e.Actor}: ` : 'Unbekannt: ';
                const ariaLabel = `${ariaActor}${label} am ${formattedDate} – ${ariaSuffix}`;
                const typeLabel = e.EntityType === 'Box' ? 'Behälter' : e.EntityType === 'Item' ? 'Artikel' : e.EntityType;
                const entityId = e.EntityId ?? '—';

                return (
                  <tr key={e.Id}>
                    <td>
                      <Link className="linkcard" to={path} tabIndex={0} aria-label={ariaLabel}>
                        <span className={`pill ${e.EntityType}`}>{typeLabel}</span>
                      </Link>
                    </td>
                    <td>
                      <Link className="linkcard" to={path} tabIndex={-1} aria-hidden="true">
                        {entityId}
                      </Link>
                    </td>
                    <td>
                      <Link className="linkcard" to={path} tabIndex={-1} aria-hidden="true">
                        {actorText}
                      </Link>
                    </td>
                    <td>
                      <Link className="linkcard" to={path} tabIndex={-1} aria-hidden="true">
                        {label}
                      </Link>
                    </td>
                    <td>
                      <Link className="linkcard" to={path} tabIndex={-1} aria-hidden="true">
                        {formattedDate}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">Keine aktuellen Aktivitäten.</div>
      )}
    </div>
  );
}

export default function RecentEventsCard({ events }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const handleSearchSubmit = () => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      return;
    }

    try {
      console.info('RecentEventsCard: submitting activities search', { term: trimmed });
      navigate(`/activities?term=${encodeURIComponent(trimmed)}`);
    } catch (error) {
      console.error('RecentEventsCard: Failed to navigate to activities search', error);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <a href="/activities">
          <h2 id="activity">Letzte Aktivitäten</h2>
        </a>
      </div>
      <div className="row">
        <input
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder="Artikelnummer oder UUID"
          aria-label="Aktivitäten durchsuchen nach Artikelnummer oder UUID"
          onKeyDown={event => {
            if (event.key === 'Enter') {
              handleSearchSubmit();
            }
          }}
        />
        <button className="btn" onClick={handleSearchSubmit}>
          Suchen
        </button>
      </div>
      <RecentEventsList events={events} />
    </div>
  );
}

// formatting handled by formatDate util
