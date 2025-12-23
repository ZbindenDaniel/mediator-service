import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventLog } from '../../../models';
import RecentEventsCard, { RecentEventsList } from './RecentEventsCard';
import { filterVisibleEvents } from '../utils/eventLogTopics';

const DEFAULT_LIMIT = 50;

export default function RecentActivitiesPage() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadActivities = async () => {
      try {
        const response = await fetch(`/api/activities?limit=${DEFAULT_LIMIT}`);
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
  }, []);

  return (
    <div className="list-container activities">
      <div className="page-header">
        <h1>Letzte Aktivitäten</h1>
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
