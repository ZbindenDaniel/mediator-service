import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

interface SelfHealItem {
  artikelNummer: string;
  subCategory: number;
  action: 'rework' | 'restamp' | 'reword' | 'rerun';
  fields?: string[];
  fromVersion: number | null;
  toVersion: number;
  standardsFromVersion?: number | null;
  standardsToVersion?: number | null;
  status?: string;
}

interface SelfHealPreview {
  flags: { autoRework: boolean; autoReview: boolean; autoApprove: boolean };
  standardsVersion: number | null;
  totalCandidates: number;
  staleCount: number;
  counts: { rework: number; restamp: number; reword: number; rerun: number };
  byStatus: Record<string, number>;
  items: SelfHealItem[];
}

interface Props {
  authToken?: string;
  onAuthFailure?: () => void;
}

const ACTION_LABELS: Record<SelfHealItem['action'], string> = {
  rework: 'Rework (Extraktion)',
  rerun: 'Rerun (voll)',
  reword: 'Reword (Wording)',
  restamp: 'Restamp (nur Version)'
};

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`status-badge ${on ? 'status-badge--ok' : 'status-badge--error'}`}>
      {label}: {on ? 'an' : 'aus'}
    </span>
  );
}

export default function AgenticSelfHealCard({ authToken, onAuthFailure }: Props) {
  const [data, setData] = useState<SelfHealPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggered, setTriggered] = useState(false);

  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/agentic-self-heal', { headers: authHeaders });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok) { setError('Fehler beim Laden'); return; }
      setData(await res.json() as SelfHealPreview);
    } catch (err) {
      logError('Failed to load self-heal preview', err);
      setError('Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  async function runNow() {
    try {
      setError(null);
      const res = await fetch('/api/admin/agentic-self-heal', { method: 'POST', headers: authHeaders });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok && res.status !== 202) { setError('Fehler beim Auslösen'); return; }
      setTriggered(true);
      setTimeout(() => setTriggered(false), 4000);
    } catch (err) {
      logError('Failed to trigger self-heal sweep', err);
      setError('Fehler beim Auslösen');
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="card">
      <h2>Self-Heal Vorschau</h2>
      {loading ? (
        <p className="muted">Lade…</p>
      ) : error ? (
        <p className="alert alert-error">{error}</p>
      ) : data ? (
        <>
          <div className="admin-status-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <Flag label="AUTO_REWORK" on={data.flags.autoRework} />
            <Flag label="AUTO_REVIEW" on={data.flags.autoReview} />
            <Flag label="AUTO_APPROVE" on={data.flags.autoApprove} />
            <button type="button" className="btn" onClick={() => void load()}>Aktualisieren</button>
            <button type="button" className="btn" onClick={() => void runNow()}>Jetzt ausführen</button>
            {triggered ? <span className="muted">Sweep angefordert — läuft beim nächsten Tick.</span> : null}
          </div>

          <p style={{ marginTop: 10 }}>
            <strong>{data.staleCount}</strong> von {data.totalCandidates} geprüften Artikeln sind veraltet
            {' '}(Standards-Version aktuell: {data.standardsVersion ?? '—'}).
          </p>

          {data.staleCount === 0 ? (
            <p className="muted" style={{ fontSize: '0.85em' }}>
              Nichts zu tun: kein Artikel ist veraltet. Der Sweep wird erst aktiv, wenn eine Contract- oder
              Standards-Version erhöht wird (und die Contract-Caches neu geladen sind — Serverneustart oder
              Contract-Upload über die Admin-Oberfläche).
            </p>
          ) : (
            <>
              <div className="admin-status-row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <span>Rework: {data.counts.rework}</span>
                <span>Rerun: {data.counts.rerun}</span>
                <span>Reword: {data.counts.reword}</span>
                <span>Restamp: {data.counts.restamp}</span>
              </div>
              <table className="details">
                <thead>
                  <tr><th>Artikel</th><th>Status</th><th>Aktion</th><th>Contract</th><th>Standards</th></tr>
                </thead>
                <tbody>
                  {data.items.slice(0, 25).map((it) => (
                    <tr key={it.artikelNummer}>
                      <td>{it.artikelNummer}</td>
                      <td>{it.status ?? '—'}</td>
                      <td>{ACTION_LABELS[it.action]}{it.fields?.length ? ` (${it.fields.join(', ')})` : ''}</td>
                      <td>{it.fromVersion ?? '∅'} → {it.toVersion}</td>
                      <td>{it.standardsToVersion != null ? `${it.standardsFromVersion ?? '∅'} → ${it.standardsToVersion}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : null}
      <p className="muted" style={{ marginTop: 8, fontSize: '0.85em' }}>
        Zeigt, was der Idle-Sweep tun würde — unabhängig davon, ob die Flags an sind. Nur Artikel mit einem
        Spec-Contract werden erfasst; Artikel ohne Contract sweept der Self-Heal derzeit nicht.
      </p>
    </div>
  );
}
