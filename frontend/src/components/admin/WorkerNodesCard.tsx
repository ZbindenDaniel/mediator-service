import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

// Worker nodes view (docs/PLANNING_multi_instance.md) — shows discovered print-agent
// queues (populated from each agent's `hello` message, no manual lpadmin push needed)
// and lets the admin set Site + LabelTypes per queue, the entire routing config.
const LABEL_TYPES = ['box', 'item', 'smallitem', 'shelf', 'marketingsheet'] as const;

interface WorkerQueue {
  name: string;
  instance_id: string | null;
  site: string | null;
  labelTypes: string[];
  online: boolean;
}

interface Props {
  authToken?: string;
  onAuthFailure?: () => void;
}

export default function WorkerNodesCard({ authToken, onAuthFailure }: Props) {
  const [queues, setQueues] = useState<WorkerQueue[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { site: string; labelTypes: string[] }>>({});
  const [gathering, setGathering] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  });

  async function loadQueues() {
    try {
      const res = await fetch('/api/admin/printer-queues', { headers: authHeaders() });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok) return;
      const data = await res.json() as { queues: WorkerQueue[] };
      const withInstance = data.queues.filter((q) => q.instance_id);
      setQueues(withInstance);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const q of withInstance) {
          if (!next[q.name]) {
            next[q.name] = { site: q.site ?? '', labelTypes: q.labelTypes ?? [] };
          }
        }
        return next;
      });
    } catch (err) {
      logError('Failed to load worker queues', err);
    }
  }

  useEffect(() => { void loadQueues(); }, []);

  async function gatherQueues() {
    setGathering(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/worker-agents/gather', { method: 'POST', headers: authHeaders() });
      if (res.status === 401) { onAuthFailure?.(); return; }
      setMessage(res.ok ? 'Abfrage gesendet' : 'Fehler beim Abfragen');
      // Agents reply with `hello` asynchronously over the socket; give them a moment.
      setTimeout(() => void loadQueues(), 1500);
    } catch (err) {
      logError('Failed to gather worker queues', err);
      setMessage('Verbindungsfehler');
    } finally {
      setGathering(false);
    }
  }

  function updateDraft(name: string, patch: Partial<{ site: string; labelTypes: string[] }>) {
    setDrafts((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }

  function toggleLabelType(name: string, type: string) {
    const current = drafts[name]?.labelTypes ?? [];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    updateDraft(name, { labelTypes: next });
  }

  async function saveRouting(name: string) {
    const draft = drafts[name];
    if (!draft) return;
    setSavingName(name);
    try {
      const res = await fetch(`/api/admin/printer-queues/${encodeURIComponent(name)}/routing`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ site: draft.site, labelTypes: draft.labelTypes }),
      });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (res.ok) {
        setMessage(`${name}: gespeichert`);
        await loadQueues();
      } else {
        setMessage(`${name}: Fehler beim Speichern`);
      }
    } catch (err) {
      logError('Failed to save queue routing', err);
      setMessage(`${name}: Verbindungsfehler`);
    } finally {
      setSavingName(null);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Worker-Knoten</h2>
        <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {message && <span className="muted" style={{ fontSize: '0.8rem' }}>{message}</span>}
          <button type="button" onClick={() => void gatherQueues()} disabled={gathering} style={{ fontSize: '0.8rem' }}
            title="Alle verbundenen Print-Agents nach ihren aktuellen Queues fragen">
            {gathering ? '…' : '↺ Queues abrufen'}
          </button>
        </span>
      </div>

      {queues.length === 0 ? (
        <p className="muted">Keine Print-Agents verbunden. Print-Agent mit AGENT_TOKEN starten, dann «Queues abrufen» klicken.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border, #ddd)', textAlign: 'left' }}>
              <th style={{ padding: '0.3rem 0.5rem' }}>Queue</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>Agent</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>Online</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>Standort</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>Label-Typen</th>
              <th style={{ padding: '0.3rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => {
              const draft = drafts[q.name] ?? { site: q.site ?? '', labelTypes: q.labelTypes ?? [] };
              return (
                <tr key={q.name} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                  <td style={{ padding: '0.3rem 0.5rem', fontWeight: 500 }}>{q.name}</td>
                  <td style={{ padding: '0.3rem 0.5rem' }}>{q.instance_id}</td>
                  <td style={{ padding: '0.3rem 0.5rem' }}>
                    <span style={{ color: q.online ? 'var(--color-success, #2a2)' : 'var(--color-error, #c00)' }}>
                      {q.online ? '● online' : '○ offline'}
                    </span>
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem' }}>
                    <input
                      type="text"
                      value={draft.site}
                      onChange={(e) => updateDraft(q.name, { site: e.target.value })}
                      style={{ width: '8rem' }}
                    />
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {LABEL_TYPES.map((t) => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem' }}>
                          <input
                            type="checkbox"
                            checked={draft.labelTypes.includes(t)}
                            onChange={() => toggleLabelType(q.name, t)}
                          />
                          {t}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem' }}>
                    <button onClick={() => void saveRouting(q.name)} disabled={savingName === q.name} style={{ fontSize: '0.8rem' }}>
                      {savingName === q.name ? '…' : 'Speichern'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
