import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { EventLog } from '../../../models';
import { RecentEventsList } from './RecentEventsCard';
import { filterVisibleEvents } from '../utils/eventLogTopics';
import { logger } from '../utils/logger';

const DEFAULT_LIMIT = 50;
// TODO(agent): Include activities search term in feed request once the API confirms term filtering.
// TODO(agent): Revisit activities search helper text once box/shelf search guidance is validated.
const BOX_SHELF_PATTERN = /^[BS]-/i;

export default function RecentActivitiesPage() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const term = params.get('term') ?? '';
    setSearchTerm(term);
  }, [location.search]);

  const handleSearchSubmit = () => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      return;
    }

    try {
      console.info('RecentActivitiesPage: updating activities search term', { term: trimmed });
      navigate(`/activities?term=${encodeURIComponent(trimmed)}`);
    } catch (err) {
      console.error('RecentActivitiesPage: Failed to update activities search term', err);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadActivities = async () => {
      try {
        const params = new URLSearchParams(location.search);
        const termFromUrl = params.get('term') ?? '';
        const trimmed = (termFromUrl || searchTerm).trim();
        const termParam = trimmed ? `&term=${encodeURIComponent(trimmed)}` : '';
        if (trimmed && BOX_SHELF_PATTERN.test(trimmed)) {
          try {
            logger.info('RecentActivitiesPage: box or shelf search term detected', { term: trimmed });
          } catch (logError) {
            console.error('RecentActivitiesPage: Failed to log box/shelf search term', logError);
          }
        }
        console.info('RecentActivitiesPage: fetching activities', {
          limit: DEFAULT_LIMIT,
          term: trimmed || undefined,
        });
        const response = await fetch(`/api/activities?limit=${DEFAULT_LIMIT}${termParam}`);
        if (!response.ok) {
          throw new Error(`Aktivitäten konnten nicht geladen werden (Status ${response.status}).`);
        }
        const data = await response.json();
        const receivedEvents = Array.isArray(data?.events) ? filterVisibleEvents(data.events) : [];
        if (!cancelled) {
          setEvents(receivedEvents);
          setError(null);
          console.log('Loaded recent activities', { count: receivedEvents.length });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load activities feed', err);
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadActivities();

    return () => {
      cancelled = true;
    };
  }, [location.search, searchTerm]);

  return (
    <div className="list-container activities">
      <div className="page-header">
        <h1>Letzte Aktivitäten</h1>
      </div>
      <div className="row">
        <input
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder="Artikelnummer, UUID, Box-ID oder Regal-ID"
          aria-label="Aktivitäten durchsuchen nach Artikelnummer, UUID, Box- oder Regal-ID"
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
      {loading && <p className="muted">Aktivitäten werden geladen…</p>}
      {error && (
        <div role="alert" className="card error">
          <p>Aktivitäten konnten nicht geladen werden.</p>
          <p className="muted">{error}</p>
        </div>
      )}
      {!loading && !error && <RecentEventsList events={events} />}
    </div>
  );
}
