import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser } from '../../lib/user';
import { logError } from '../../utils/logger';

interface AgenticCounts {
  queued?: number;
  running?: number;
  needs_review?: number;
  failed?: number;
  approved?: number;
  waiting?: number;
}

const STATE_LABELS: Array<[keyof AgenticCounts, string]> = [
  ['queued', 'Warteschlange'],
  ['running', 'Läuft'],
  ['needs_review', 'Zu prüfen'],
  ['failed', 'Fehlgeschlagen'],
  ['approved', 'Abgeschlossen'],
  ['waiting', 'Wartend'],
];

export default function AgenticOverviewCard() {
  const [counts, setCounts] = useState<AgenticCounts | null>(null);
  const [restartMsg, setRestartMsg] = useState('');
  const [restarting, setRestarting] = useState(false);

  async function loadCounts() {
    try {
      const res = await fetch('/api/overview');
      if (res.ok) {
        const data = await res.json() as { agentic?: { stateCounts?: AgenticCounts } };
        setCounts(data.agentic?.stateCounts ?? {});
      }
    } catch (err) {
      logError('Failed to load agentic counts', err);
    }
  }

  useEffect(() => { void loadCounts(); }, []);

  async function handleRestartFailed() {
    const actor = getUser();
    if (!actor) { setRestartMsg('Kein Benutzername gesetzt.'); return; }
    setRestarting(true);
    setRestartMsg('');
    try {
      const res = await fetch('/api/agentic/restart-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor }),
      });
      const data = await res.json() as { restarted?: number; error?: string };
      if (res.ok) {
        setRestartMsg(`${data.restarted ?? 0} Runs neu in die Warteschlange gestellt.`);
        void loadCounts();
      } else {
        setRestartMsg(data.error ?? 'Fehler beim Neustart.');
      }
    } catch (err) {
      logError('Failed to restart failed agentic runs', err);
      setRestartMsg('Netzwerkfehler.');
    } finally {
      setRestarting(false);
    }
  }

  const failedCount = counts?.failed ?? 0;

  return (
    <div className="card">
      <h2>KI-Warteschlange</h2>
      {counts !== null ? (
        <div className="admin-agentic-grid">
          {STATE_LABELS.map(([key, label]) => {
            const val = counts[key] ?? 0;
            return val > 0 ? (
              <div key={key} className="admin-agentic-stat">
                <span className="muted">{label}</span>
                <strong>{val}</strong>
              </div>
            ) : null;
          })}
        </div>
      ) : (
        <p className="muted">Lade…</p>
      )}
      <div className="admin-action-row">
        <Link to="/items?agenticState=needs_review" className="link-btn">
          Artikel in Prüfung →
        </Link>
        <button
          type="button"
          disabled={failedCount === 0 || restarting}
          onClick={() => void handleRestartFailed()}
        >
          {restarting
            ? 'Wird neu gestartet…'
            : failedCount > 0
              ? `${failedCount} Fehlgeschlagene neu starten`
              : 'Keine fehlgeschlagenen Runs'}
        </button>
      </div>
      {restartMsg && <p className="muted" style={{ marginTop: '6px' }}>{restartMsg}</p>}
    </div>
  );
}
