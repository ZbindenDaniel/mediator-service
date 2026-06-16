import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

interface PrinterQueue {
  name: string;
  device_uri: string;
  ppd_model: string;
  media: string;
  description: string;
  enabled: boolean;
  updated_at: string;
}

interface Device {
  type: string;
  uri: string;
}

interface PpdModel {
  id: string;
  label: string;
}

interface Props {
  authToken?: string;
  onAuthFailure?: () => void;
}

const EMPTY_QUEUE: Omit<PrinterQueue, 'updated_at'> = {
  name: '',
  device_uri: '',
  ppd_model: '',
  media: '',
  description: '',
  enabled: true,
};

export default function PrinterQueuesCard({ authToken, onAuthFailure }: Props) {
  const [queues, setQueues] = useState<PrinterQueue[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [ppds, setPpds] = useState<PpdModel[]>([]);
  const [form, setForm] = useState<Omit<PrinterQueue, 'updated_at'>>(EMPTY_QUEUE);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [message, setMessage] = useState('');

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  });

  async function loadQueues() {
    try {
      const res = await fetch('/api/admin/printer-queues', { headers: authHeaders() });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (res.ok) {
        const data = await res.json() as { queues: PrinterQueue[] };
        setQueues(data.queues);
      }
    } catch (err) {
      logError('Failed to load printer queues', err);
    }
  }

  async function detectDevices() {
    setLoadingDevices(true);
    try {
      const [dRes, pRes] = await Promise.all([
        fetch('/api/admin/cups-devices', { headers: authHeaders() }),
        fetch('/api/admin/cups-ppds?q=brother', { headers: authHeaders() }),
      ]);
      if (dRes.ok) setDevices((await dRes.json() as { devices: Device[] }).devices);
      if (pRes.ok) setPpds((await pRes.json() as { models: PpdModel[] }).models);
    } catch (err) {
      logError('Failed to detect CUPS devices', err);
    } finally {
      setLoadingDevices(false);
    }
  }

  useEffect(() => { void loadQueues(); }, []);

  function startEdit(q: PrinterQueue) {
    setEditingName(q.name);
    setForm({ name: q.name, device_uri: q.device_uri, ppd_model: q.ppd_model, media: q.media, description: q.description, enabled: q.enabled });
    setMessage('');
  }

  function cancelEdit() {
    setEditingName(null);
    setForm(EMPTY_QUEUE);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const isEdit = editingName !== null;
      const url = isEdit ? `/api/admin/printer-queues/${encodeURIComponent(editingName!)}` : '/api/admin/printer-queues';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(form) });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (res.ok) {
        setMessage(isEdit ? 'Aktualisiert' : 'Queue hinzugefügt');
        cancelEdit();
        await loadQueues();
      } else {
        const err = await res.json() as { error?: string };
        setMessage(err.error ?? 'Fehler');
      }
    } catch (err) {
      logError('Failed to save printer queue', err);
      setMessage('Fehler');
    } finally {
      setSaving(false);
    }
  }

  async function deleteQueue(name: string) {
    if (!window.confirm(`Queue "${name}" wirklich löschen?`)) return;
    try {
      const res = await fetch(`/api/admin/printer-queues/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (res.ok) await loadQueues();
    } catch (err) {
      logError('Failed to delete printer queue', err);
    }
  }

  async function toggleEnabled(q: PrinterQueue) {
    try {
      await fetch(`/api/admin/printer-queues/${encodeURIComponent(q.name)}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ enabled: !q.enabled }),
      });
      await loadQueues();
    } catch (err) {
      logError('Failed to toggle queue', err);
    }
  }

  return (
    <div className="card">
      <h2>CUPS-Queues verwalten</h2>

      {/* Queue list */}
      {queues.length === 0 ? (
        <p className="muted">Keine Queues konfiguriert. Queue hinzufügen ↓</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border, #ddd)', textAlign: 'left' }}>
              <th style={{ padding: '0.3rem 0.5rem' }}>Name</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>Device URI</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>PPD</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>Media</th>
              <th style={{ padding: '0.3rem 0.5rem' }}>Aktiv</th>
              <th style={{ padding: '0.3rem 0.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.name} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                <td style={{ padding: '0.3rem 0.5rem', fontWeight: 500 }}>{q.name}</td>
                <td style={{ padding: '0.3rem 0.5rem', wordBreak: 'break-all', maxWidth: '18rem' }}>{q.device_uri || <span className="muted">—</span>}</td>
                <td style={{ padding: '0.3rem 0.5rem' }}>{q.ppd_model || <span className="muted">—</span>}</td>
                <td style={{ padding: '0.3rem 0.5rem' }}>{q.media || <span className="muted">—</span>}</td>
                <td style={{ padding: '0.3rem 0.5rem' }}>
                  <input type="checkbox" checked={q.enabled} onChange={() => void toggleEnabled(q)} />
                </td>
                <td style={{ padding: '0.3rem 0.5rem', whiteSpace: 'nowrap' }}>
                  <button onClick={() => startEdit(q)} style={{ marginRight: '0.3rem', fontSize: '0.8rem' }}>Bearbeiten</button>
                  <button onClick={() => void deleteQueue(q.name)} style={{ fontSize: '0.8rem', color: 'var(--color-error, #c00)' }}>Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / edit form */}
      <details open={editingName !== null || queues.length === 0}>
        <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '0.75rem' }}>
          {editingName !== null ? `Queue bearbeiten: ${editingName}` : 'Queue hinzufügen'}
        </summary>

        <div style={{ display: 'grid', gap: '0.5rem', maxWidth: '36rem' }}>
          {editingName === null && (
            <label>
              <span style={{ fontSize: '0.875rem' }}>Queue-Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="z.B. QL800_box"
                style={{ display: 'block', width: '100%' }}
              />
            </label>
          )}

          <label>
            <span style={{ fontSize: '0.875rem' }}>Device URI</span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                value={form.device_uri}
                onChange={(e) => setForm((f) => ({ ...f, device_uri: e.target.value }))}
                placeholder="usb://Brother/QL-800?serial=…"
                style={{ flex: 1 }}
                list="cups-devices-list"
              />
              <button
                type="button"
                onClick={() => void detectDevices()}
                disabled={loadingDevices}
                style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}
              >
                {loadingDevices ? '…' : 'Geräte erkennen'}
              </button>
            </div>
            {devices.length > 0 && (
              <datalist id="cups-devices-list">
                {devices.map((d) => <option key={d.uri} value={d.uri} />)}
              </datalist>
            )}
          </label>

          <label>
            <span style={{ fontSize: '0.875rem' }}>PPD-Modell</span>
            <input
              type="text"
              value={form.ppd_model}
              onChange={(e) => setForm((f) => ({ ...f, ppd_model: e.target.value }))}
              placeholder="Brother QL-800 series"
              style={{ display: 'block', width: '100%' }}
              list="cups-ppds-list"
            />
            {ppds.length > 0 && (
              <datalist id="cups-ppds-list">
                {ppds.map((p) => <option key={p.id} value={p.id} label={p.label} />)}
              </datalist>
            )}
          </label>

          <label>
            <span style={{ fontSize: '0.875rem' }}>Media (CUPS Mediengrösse)</span>
            <input
              type="text"
              value={form.media}
              onChange={(e) => setForm((f) => ({ ...f, media: e.target.value }))}
              placeholder="w62h100"
              style={{ display: 'block', width: '100%' }}
            />
          </label>

          <label>
            <span style={{ fontSize: '0.875rem' }}>Beschreibung (optional)</span>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              style={{ display: 'block', width: '100%' }}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span style={{ fontSize: '0.875rem' }}>Queue aktiviert</span>
          </label>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
            <button onClick={() => void save()} disabled={saving} className="btn btn--primary">
              {saving ? 'Speichern…' : editingName !== null ? 'Aktualisieren' : 'Hinzufügen'}
            </button>
            {editingName !== null && (
              <button onClick={cancelEdit} style={{ fontSize: '0.875rem' }}>Abbrechen</button>
            )}
            {message && <span className="muted">{message}</span>}
          </div>
        </div>
      </details>

      <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
        Tipp: Device URI ermitteln mit{' '}
        <code>docker compose exec cups lpinfo -v</code>
      </p>
    </div>
  );
}
