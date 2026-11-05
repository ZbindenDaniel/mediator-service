import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventLog } from '../../../models';
import { RecentEventsList } from './RecentEventsCard';
import { logError } from '../utils/logger';

const LIMIT = 15;
// Same filter as the activities page's "KI + Standard" view, so "Alle anzeigen" lands on exactly this list extended.
const QUERY = `topics=agentic&levels=Information,Important,Error&limit=${LIMIT}`;

interface Props {
  /** Bump to reload (after a lever or cluster rework fired). */
  refreshKey: number;
}

/** "What did the pipeline (and its operators) just do?" — the KI slice of the activity log, in the cockpit. */
export default function CockpitActivityPanel({ refreshKey }: Props): JSX.Element {
  const [events, setEvents] = useState<EventLog[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/activities?${QUERY}`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setEvents(Array.isArray(data?.events) ? data.events : []);
          setFailed(false);
        }
      } catch (err) {
        logError('Failed to load cockpit activity', err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className="card cockpit-panel">
      <h3>Letzte KI-Ereignisse</h3>
      {failed ? (
        <p className="muted">KI-Ereignisse konnten nicht geladen werden.</p>
      ) : events === null ? (
        <p className="muted">Lade…</p>
      ) : (
        <RecentEventsList events={events} grouped />
      )}
      <p className="muted cockpit-note">
        Hebel-Änderungen, Self-Heal, Auto-Freigaben und Fehler. Einzelereignisse pro Lauf (eingereiht,
        Ergebnis erhalten) stehen in der Artikel-Historie.{' '}
        <Link to="/activities?topics=agentic">Alle KI-Ereignisse →</Link>
      </p>
    </section>
  );
}
