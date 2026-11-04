import React, { useState } from 'react';
import type { EventLog } from '../../../models';
import { formatDate } from '../lib/format';
import { eventLabel, eventLevel } from '../../../models/event-labels';
import { formatEventDescription } from '../utils/eventDescription';
import { buildActivityRows } from '../utils/activityGroups';
import { useNavigate } from 'react-router-dom';
import { filterVisibleEvents } from '../utils/eventLogTopics';
import { usePanelContext } from '../context/PanelContext';

// TODO(agent): Follow up on filtering the activities feed by query once backend support lands.
// TODO(navigation): Validate header navigation coverage before reintroducing card-level links.
// TODO(agent): Confirm Artikelbezeichnung data coverage for activity rows without item references.
// TODO(labeling): Reconfirm the activities table header labels against product terminology.
// TODO(events): Reconfirm ItemUUID validation rules for activity links once backend emits canonical identifiers.

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
          path: `/boxes?entity=box&id=${encodeURIComponent(event.EntityId)}`,
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
      try {
        const artikelNummer = typeof event.Artikel_Nummer === 'string' ? event.Artikel_Nummer.trim() : '';
        if (artikelNummer) {
          console.info('RecentEventsCard: Selected item identifier for event link', {
            identifierType: 'artikelNummer',
            identifier: artikelNummer,
            eventId: event.Id,
          });
          return {
            path: `/items?entity=item&id=${encodeURIComponent(artikelNummer)}`,
            ariaSuffix: `Artikel ${artikelNummer}`,
          };
        }

        const itemUUID = typeof event.EntityId === 'string' ? event.EntityId.trim() : '';
        if (itemUUID) {
          console.info('RecentEventsCard: Selected item identifier for event link', {
            identifierType: 'itemUUID',
            identifier: itemUUID,
            eventId: event.Id,
          });
          return {
            path: `/items?entity=item&id=${encodeURIComponent(itemUUID)}`,
            ariaSuffix: `Artikel ${itemUUID}`,
          };
        }
      } catch (itemIdentifierError) {
        console.error('RecentEventsCard: Failed to resolve item identifier for event link.', itemIdentifierError, event);
      }

      console.warn('RecentEventsCard: Missing Artikel_Nummer and EntityId for Item event, falling back to /items.', event);
      return {
        path: '/items',
        ariaSuffix: 'Artikelliste',
      };
    }

    if (event.EntityType !== 'Batch') {
      console.warn('RecentEventsCard: Unknown EntityType for event, falling back to /activities.', event);
    }
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

interface ListProps extends Props {
  /** Day headers + folding of consecutive similar events (activities page). */
  grouped?: boolean;
}

function entityTypeLabel(entityType: string): string {
  if (entityType === 'Box') return 'Behälter';
  if (entityType === 'Item') return 'Artikel';
  if (entityType === 'Batch') return 'Sammelaktion';
  return entityType;
}

export function RecentEventsList({ events, grouped = false }: ListProps) {
  const allowedEvents = filterVisibleEvents(events);
  const { setEntity } = usePanelContext();
  const [expandedBursts, setExpandedBursts] = useState<Set<string>>(() => new Set());

  const handleEventClick = (e: EventLog) => {
    if (e.EntityType === 'Box' && e.EntityId) {
      setEntity('box', e.EntityId);
    } else if (e.EntityType === 'Item') {
      const id = (typeof e.Artikel_Nummer === 'string' && e.Artikel_Nummer.trim())
        || (typeof e.EntityId === 'string' && e.EntityId.trim())
        || null;
      if (id) setEntity('item', id);
    }
  };

  const toggleBurst = (key: string) => {
    setExpandedBursts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const renderEventRow = (e: EventLog, nested = false) => {
    const { ariaSuffix } = resolveEventLink(e);
    const formattedDate = formatDate(e.CreatedAt);
    const label = eventLabel(e.Event);
    const ariaActor = e.Actor ? `${e.Actor}: ` : 'Unbekannt: ';
    const clickable = e.EntityType === 'Item' || e.EntityType === 'Box';
    const isError = eventLevel(e.Event) === 'error';
    const className = ['item-list-row', isError ? 'is-error' : '', nested ? 'is-nested' : ''].filter(Boolean).join(' ');

    return (
      <tr
        key={e.Id}
        className={className}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={`${ariaActor}${label} am ${formattedDate} – ${ariaSuffix}`}
        onClick={clickable ? () => handleEventClick(e) : undefined}
        onKeyDown={clickable ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') handleEventClick(e); } : undefined}
      >
        <td><span className={`pill ${e.EntityType}`}>{entityTypeLabel(e.EntityType)}</span></td>
        <td>{e.EntityId ?? '—'}</td>
        <td>{e.Artikelbeschreibung ?? '—'}</td>
        <td>{e.Actor ?? '[?]'}</td>
        <td>{formatEventDescription(e)}</td>
        <td>{formattedDate}</td>
      </tr>
    );
  };

  const renderRows = () => {
    if (!grouped) return allowedEvents.map((e) => renderEventRow(e));
    return buildActivityRows(allowedEvents).flatMap((row) => {
      if (row.kind === 'day') {
        return [
          <tr key={row.key} className="activities-day">
            <th scope="colgroup" colSpan={6}>{row.label}</th>
          </tr>
        ];
      }
      if (row.kind === 'event') return [renderEventRow(row.event)];

      const first = row.events[0];
      const last = row.events[row.events.length - 1];
      const expanded = expandedBursts.has(row.key);
      const isError = eventLevel(first.Event) === 'error';
      const summary = (
        <tr
          key={row.key}
          className={`item-list-row activities-burst${isError ? ' is-error' : ''}`}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => toggleBurst(row.key)}
          onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleBurst(row.key); } }}
        >
          <td><span className={`pill ${first.EntityType}`}>{entityTypeLabel(first.EntityType)}</span></td>
          <td colSpan={2}>
            <span className="activities-burst__toggle" aria-hidden="true">{expanded ? '▾' : '▸'}</span>{' '}
            {row.events.length} Einträge
          </td>
          <td>{first.Actor ?? '[?]'}</td>
          <td>{eventLabel(first.Event)} ×{row.events.length}</td>
          <td>{formatDate(last.CreatedAt)} – {formatDate(first.CreatedAt)}</td>
        </tr>
      );
      return expanded ? [summary, ...row.events.map((e) => renderEventRow(e, true))] : [summary];
    });
  };

  return (
    <div id="eventsOut" className="list">
      {allowedEvents.length ? (
        <div className="item-list-wrapper">
          <table className="item-list activities-table" aria-label="Letzte Aktivitäten">
            <thead>
              <tr>
                <th scope="col">Typ</th>
                <th scope="col">ID</th>
                <th scope="col">Artikelbezeichnung</th>
                <th scope="col">Akteur</th>
                <th scope="col">Aktion</th>
                <th scope="col">Datum</th>
              </tr>
            </thead>
            <tbody>{renderRows()}</tbody>
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
