import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

interface Props {
  authToken?: string;
  onAuthFailure?: () => void;
}

export default function AgenticDispatchCard({ authToken, onAuthFailure }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/agentic-dispatch', { headers: authHeaders });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok) { setError('Fehler beim Laden'); return; }
      const data = await res.json() as { enabled: boolean };
      setEnabled(data.enabled);
    } catch (err) {
      logError('Failed to load agentic auto-dispatch setting', err);
      setError('Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  async function toggle() {
    if (enabled === null) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/admin/agentic-dispatch', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled })
      });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok) { setError('Fehler beim Speichern'); return; }
      const data = await res.json() as { enabled: boolean };
      setEnabled(data.enabled);
    } catch (err) {
      logError('Failed to toggle agentic auto-dispatch setting', err);
      setError('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="card">
      <h2>Agentische Auto-Verteilung</h2>
      {loading ? (
        <p className="muted">Lade…</p>
      ) : (
        <div className="admin-status-row">
          <span>Status:</span>
          {enabled
            ? <span className="status-badge status-badge--ok">Aktiviert</span>
            : <span className="status-badge status-badge--error">Deaktiviert</span>
          }
          <button
            type="button"
            className="btn"
            onClick={() => void toggle()}
            disabled={saving || enabled === null}
          >
            {saving ? 'Speichern…' : enabled ? 'Deaktivieren' : 'Aktivieren'}
          </button>
        </div>
      )}
      {error && <p className="alert alert-error">{error}</p>}
      <p className="muted" style={{ marginTop: 8, fontSize: '0.85em' }}>
        Füllt freie Anreicherungs-Slots automatisch mit noch nicht gestarteten Artikeln (höchstens
        {' '}je drei laufende und wartende Läufe). Deaktivieren stoppt diese automatische Zufuhr sofort;
        manuell ausgelöste Anreicherungen laufen weiterhin.
      </p>
    </div>
  );
}
