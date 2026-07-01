import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { EventLog } from '../../../models';
import { RecentEventsList } from './RecentEventsCard';
import { filterVisibleEvents } from '../utils/eventLogTopics';
import { EVENT_TOPICS, resolveEventTopic } from '../../../models/event-labels';

const DEFAULT_LIMIT = 50;

const TOPIC_LABELS: Record<string, string> = {
  logistics: 'Logistik',
  data: 'Daten',
  export: 'Export',
  printing: 'Druck',
  agentic: 'KI',
};

export default function RecentActivitiesPage() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const termFromUrl = params.get('term') ?? '';
  const actorFromUrl = params.get('actor') ?? '';
  const topicsFromUrl = params.get('topics') ? params.get('topics')!.split(',').filter(Boolean) : [];

  const [termInput, setTermInput] = useState(termFromUrl);
  const [actorInput, setActorInput] = useState(actorFromUrl);

  // Sync inputs when URL changes (e.g. back/forward)
  useEffect(() => {
    setTermInput(termFromUrl);
    setActorInput(actorFromUrl);
  }, [termFromUrl, actorFromUrl]);

  const applyFilters = (term: string, actor: string, topics: string[]) => {
    const p = new URLSearchParams();
    if (term.trim()) p.set('term', term.trim());
    if (actor.trim()) p.set('actor', actor.trim());
    if (topics.length) p.set('topics', topics.join(','));
    navigate(`/activities${p.toString() ? `?${p}` : ''}`);
  };

  const handleSubmit = () => applyFilters(termInput, actorInput, topicsFromUrl);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const toggleTopic = (topic: string) => {
    const next = topicsFromUrl.includes(topic)
      ? topicsFromUrl.filter(t => t !== topic)
      : [...topicsFromUrl, topic];
    applyFilters(termInput, actorInput, next);
  };

  useEffect(() => {
    let cancelled = false;
    const loadActivities = async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams();
        p.set('limit', String(DEFAULT_LIMIT));
        if (termFromUrl) p.set('term', termFromUrl);
        if (actorFromUrl) p.set('actor', actorFromUrl);
        const response = await fetch(`/api/activities?${p}`);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const data = await response.json();
        let received: EventLog[] = Array.isArray(data?.events) ? filterVisibleEvents(data.events) : [];
        // client-side topic filter (fast, no extra endpoint needed)
        if (topicsFromUrl.length) {
          received = received.filter(e => {
            const t = resolveEventTopic(e.Event);
            return t && topicsFromUrl.includes(t);
          });
        }
        if (!cancelled) { setEvents(received); setError(null); }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadActivities();
    return () => { cancelled = true; };
  }, [location.search]);

  return (
    <div className="list-container activities">
      <div className="page-header">
        <h1>Letzte Aktivitäten</h1>
      </div>
      <div className="filter-bar">
        <div className="row">
          <input
            value={termInput}
            onChange={e => setTermInput(e.target.value)}
            placeholder="Artikelnummer, UUID, Box-ID oder Regal-ID"
            aria-label="Aktivitäten durchsuchen"
            autoFocus
            onKeyDown={handleKeyDown}
          />
          <input
            value={actorInput}
            onChange={e => setActorInput(e.target.value)}
            placeholder="Akteur"
            aria-label="Nach Akteur filtern"
            onKeyDown={handleKeyDown}
          />
          <button className="btn" onClick={handleSubmit}>Suchen</button>
          {(termFromUrl || actorFromUrl || topicsFromUrl.length > 0) && (
            <button className="btn btn--ghost" onClick={() => { setTermInput(''); setActorInput(''); navigate('/activities'); }}>
              ✕ Zurücksetzen
            </button>
          )}
        </div>
        <div className="row topic-filter-row">
          {EVENT_TOPICS.map(topic => (
            <button
              key={topic}
              type="button"
              className={`pill pill--filter${topicsFromUrl.includes(topic) ? ' is-active' : ''}`}
              onClick={() => toggleTopic(topic)}
              aria-pressed={topicsFromUrl.includes(topic)}
            >
              {TOPIC_LABELS[topic] ?? topic}
            </button>
          ))}
        </div>
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
