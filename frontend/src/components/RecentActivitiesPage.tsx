import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { EventLog } from '../../../models';
import { RecentEventsList } from './RecentEventsCard';
import { filterVisibleEvents } from '../utils/eventLogTopics';
import { EVENT_TOPICS } from '../../../models/event-labels';

const PAGE_SIZE = 100;

const TOPIC_LABELS: Record<string, string> = {
  logistics: 'Logistik',
  data: 'Daten',
  export: 'Export',
  printing: 'Druck',
  agentic: 'KI',
};

type LevelMode = 'important' | 'standard' | 'all';

// 'standard' (default) hides only debug-level bulk noise; it stays reachable via 'all' and on item history.
const LEVEL_MODES: { mode: LevelMode; label: string; title: string; levels: string | null }[] = [
  { mode: 'important', label: 'Wichtig', title: 'Nur wichtige Ereignisse und Fehler', levels: 'Important,Error' },
  { mode: 'standard', label: 'Standard', title: 'Alles ausser technischen Einzelereignissen', levels: 'Information,Important,Error' },
  { mode: 'all', label: 'Alles', title: 'Inklusive technischer Einzelereignisse (z.B. Shop-Sync pro Artikel)', levels: null },
];

function parseLevelMode(raw: string | null): LevelMode {
  return raw === 'important' || raw === 'all' ? raw : 'standard';
}

export default function RecentActivitiesPage() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const params = new URLSearchParams(location.search);
  const termFromUrl = params.get('term') ?? '';
  const actorFromUrl = params.get('actor') ?? '';
  const topicsFromUrl = params.get('topics') ? params.get('topics')!.split(',').filter(Boolean) : [];
  const levelMode = parseLevelMode(params.get('level'));

  const [termInput, setTermInput] = useState(termFromUrl);
  const [actorInput, setActorInput] = useState(actorFromUrl);

  // Sync inputs when URL changes (e.g. back/forward)
  useEffect(() => {
    setTermInput(termFromUrl);
    setActorInput(actorFromUrl);
  }, [termFromUrl, actorFromUrl]);

  const applyFilters = (next: { term?: string; actor?: string; topics?: string[]; level?: LevelMode }) => {
    const term = next.term ?? termInput;
    const actor = next.actor ?? actorInput;
    const topics = next.topics ?? topicsFromUrl;
    const level = next.level ?? levelMode;
    const p = new URLSearchParams();
    if (term.trim()) p.set('term', term.trim());
    if (actor.trim()) p.set('actor', actor.trim());
    if (topics.length) p.set('topics', topics.join(','));
    if (level !== 'standard') p.set('level', level);
    navigate(`/activities${p.toString() ? `?${p}` : ''}`);
  };

  const handleSubmit = () => applyFilters({});

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const toggleTopic = (topic: string) => {
    const next = topicsFromUrl.includes(topic)
      ? topicsFromUrl.filter(t => t !== topic)
      : [...topicsFromUrl, topic];
    applyFilters({ topics: next });
  };

  const buildQuery = (before: string | null) => {
    const p = new URLSearchParams();
    p.set('limit', String(PAGE_SIZE));
    if (termFromUrl) p.set('term', termFromUrl);
    if (actorFromUrl) p.set('actor', actorFromUrl);
    // Topics are filtered server-side so a page is always PAGE_SIZE matching rows, not a thinned-out slice.
    if (topicsFromUrl.length) p.set('topics', topicsFromUrl.join(','));
    const levels = LEVEL_MODES.find((m) => m.mode === levelMode)?.levels;
    if (levels) p.set('levels', levels);
    if (before) p.set('before', before);
    return p;
  };

  const fetchPage = async (before: string | null): Promise<{ events: EventLog[]; nextCursor: string | null }> => {
    const response = await fetch(`/api/activities?${buildQuery(before)}`);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    return {
      events: Array.isArray(data?.events) ? filterVisibleEvents(data.events) : [],
      nextCursor: typeof data?.nextCursor === 'string' ? data.nextCursor : null,
    };
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(null)
      .then((page) => {
        if (cancelled) return;
        setEvents(page.events);
        setNextCursor(page.nextCursor);
        setError(null);
      })
      .catch((err) => { if (!cancelled) setError((err as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.Id));
        return [...prev, ...page.events.filter((e) => !seen.has(e.Id))];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      console.error('[activities] Failed to load more events', err);
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const hasFilters = Boolean(termFromUrl || actorFromUrl || topicsFromUrl.length > 0 || levelMode !== 'standard');

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
          {hasFilters && (
            <button className="btn btn--ghost" onClick={() => { setTermInput(''); setActorInput(''); navigate('/activities'); }}>
              ✕ Zurücksetzen
            </button>
          )}
        </div>
        <div className="row topic-filter-row">
          <div className="level-toggle" role="group" aria-label="Detailgrad">
            {LEVEL_MODES.map(({ mode, label, title }) => (
              <button
                key={mode}
                type="button"
                title={title}
                className={`pill pill--filter${levelMode === mode ? ' is-active' : ''}`}
                onClick={() => applyFilters({ level: mode })}
                aria-pressed={levelMode === mode}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="topic-filter-sep" aria-hidden="true" />
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
      {!loading && !error && (
        <>
          <RecentEventsList events={events} grouped />
          <div className="activities-footer">
            <span className="muted">
              {events.length} {events.length === 1 ? 'Eintrag' : 'Einträge'} geladen{nextCursor ? '' : ' – Ende der Liste'}
            </span>
            {nextCursor && (
              <button className="btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Lädt…' : `Weitere ${PAGE_SIZE} laden`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
