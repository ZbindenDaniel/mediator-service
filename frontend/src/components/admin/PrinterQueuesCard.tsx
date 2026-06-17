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

interface DetectionResult {
  devices: number;
  ppds: number;
  error?: string;
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

const MEDIA_SUGGESTIONS = [
  { value: 'w62', label: '62 mm Endlosband' },
  { value: 'w29h90', label: '29×90 mm Adressetikett' },
  { value: 'w62h100', label: '62×100 mm' },
  { value: 'w62h29', label: '62×29 mm' },
  { value: 'w17h54', label: '17×54 mm' },
  { value: 'w62h75', label: '62×75 mm' },
  { value: 'w23h23', label: '23×23 mm' },
  { value: 'w102', label: '102 mm Endlosband' },
];

export default function PrinterQueuesCard({ authToken, onAuthFailure }: Props) {
  const [queues, setQueues] = useState<PrinterQueue[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [ppds, setPpds] = useState<PpdModel[]>([]);
  const [form, setForm] = useState<Omit<PrinterQueue, 'updated_at'>>(EMPTY_QUEUE);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [message, setMessage] = useState('');
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, string | null> | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [cancelingQueue, setCancelingQueue] = useState<string | null>(null);

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
    setDetectionResult(null);
    try {
      const [dRes, pRes] = await Promise.all([
        fetch('/api/admin/cups-devices', { headers: authHeaders() }),
        fetch('/api/admin/cups-ppds', { headers: authHeaders() }),
      ]);

      if (dRes.status === 401 || pRes.status === 401) { onAuthFailure?.(); return; }

      let detectedDevices: Device[] = [];
      let detectedPpds: PpdModel[] = [];
      let error: string | undefined;

      if (dRes.ok) {
        detectedDevices = (await dRes.json() as { devices: Device[] }).devices;
        setDevices(detectedDevices);
      } else {
        const body = await dRes.json().catch(() => ({})) as { error?: string };
        error = body.error ?? `CUPS-Fehler (${dRes.status})`;
      }

      if (pRes.ok) {
        detectedPpds = (await pRes.json() as { models: PpdModel[] }).models;
        setPpds(detectedPpds);
      }

      setDetectionResult({ devices: detectedDevices.length, ppds: detectedPpds.length, error });
    } catch (err) {
      logError('Failed to detect CUPS devices', err);
      setDetectionResult({ devices: 0, ppds: 0, error: 'Verbindungsfehler' });
    } finally {
      setLoadingDevices(false);
    }
  }

  useEffect(() => { void loadQueues(); }, []);

  async function resync() {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/admin/cups-sync', { method: 'POST', headers: authHeaders() });
      if (res.status === 401) { onAuthFailure?.(); return; }
      setSyncMessage(res.ok ? 'Sync abgeschlossen' : 'Fehler beim Sync');
    } catch (err) {
      logError('Failed to resync', err);
      setSyncMessage('Verbindungsfehler');
    } finally {
      setSyncing(false);
    }
  }

  async function fetchDiagnostics() {
    setLoadingDiag(true);
    setDiagnostics(null);
    try {
      const res = await fetch('/api/admin/cups-diagnostics', { headers: authHeaders() });
      if (res.status === 401) { onAuthFailure?.(); return; }
      const data = await res.json() as Record<string, string | null>;
      setDiagnostics(data);
    } catch (err) {
      logError('Failed to fetch CUPS diagnostics', err);
      setDiagnostics({ error: 'Verbindungsfehler' });
    } finally {
      setLoadingDiag(false);
    }
  }

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

  async function cancelJobs(name: string) {
    setCancelingQueue(name);
    try {
      const res = await fetch('/api/admin/cups-cancel-jobs', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ queue: name }),
      });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setMessage(err.error ?? 'Fehler beim Abbrechen');
      }
    } catch (err) {
      logError('Failed to cancel jobs', err);
    } finally {
      setCancelingQueue(null);
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

  function DetectionFeedback() {
    if (!detectionResult) return null;
    const { devices: d, ppds: p, error } = detectionResult;
    if (error) {
      return (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--color-error, #c00)' }}>
          {error}
        </p>
      );
    }
    return (
      <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--color-muted, #555)' }}>
        {d > 0
          ? <span>{d} Gerät{d !== 1 ? 'e' : ''} erkannt — Autocomplete aktiv.</span>
          : (
            <>
              <span style={{ color: 'var(--color-error, #c00)' }}>Keine USB-Geräte erkannt.</span>
              {' '}USB-Passthrough aktiv?{' '}
              <code style={{ fontSize: '0.75rem' }}>
                docker compose -f docker-compose.yml -f docker-compose.usb.yml up -d cups
              </code>
            </>
          )
        }
        {p === 0 && (
          <div style={{ marginTop: '0.25rem' }}>
            <span style={{ color: 'var(--color-error, #c00)' }}>Keine Treiber installiert.</span>
            {' '}<code style={{ fontSize: '0.75rem' }}>docker compose exec cups lpinfo -m</code>
          </div>
        )}
        {d > 0 && p > 0 && (
          <span style={{ marginLeft: '0.5rem' }}>{p} Treiber verfügbar.</span>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>CUPS-Queues verwalten</h2>
        <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {syncMessage && <span className="muted" style={{ fontSize: '0.8rem' }}>{syncMessage}</span>}
          <button
            type="button"
            onClick={() => void resync()}
            disabled={syncing}
            style={{ fontSize: '0.8rem' }}
            title="Alle Queues aus DB erneut in CUPS eintragen (nach Treiber-Rebuild oder Fehlerbehebung)"
          >
            {syncing ? '…' : '↺ Neu synchronisieren'}
          </button>
        </span>
      </div>

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
                  <button
                    onClick={() => void cancelJobs(q.name)}
                    disabled={cancelingQueue === q.name}
                    title="Alle offenen Jobs für diese Queue abbrechen (stuck jobs)"
                    style={{ marginRight: '0.3rem', fontSize: '0.8rem', color: 'var(--color-warning, #a60)' }}
                  >
                    {cancelingQueue === q.name ? '…' : '✕ Jobs'}
                  </button>
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
                placeholder="usb://Brother/QL-800?serial=… oder ipps://192.168.1.x/ipp/print"
                style={{ flex: 1 }}
                list="cups-devices-list"
              />
              <button
                type="button"
                onClick={() => void detectDevices()}
                disabled={loadingDevices}
                style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}
              >
                {loadingDevices ? '…' : 'Erkennen'}
              </button>
            </div>
            {devices.length > 0 && (
              <datalist id="cups-devices-list">
                {devices.map((d) => <option key={d.uri} value={d.uri} />)}
              </datalist>
            )}
            <DetectionFeedback />
          </label>

          <label>
            <span style={{ fontSize: '0.875rem' }}>PPD-Modell</span>
            <input
              type="text"
              value={form.ppd_model}
              onChange={(e) => setForm((f) => ({ ...f, ppd_model: e.target.value }))}
              placeholder="lsb/usr/Brother/…ppd — oder: everywhere (IPP-Netzwerkdrucker)"
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
              list="cups-media-list"
            />
            <datalist id="cups-media-list">
              {MEDIA_SUGGESTIONS.map((s) => (
                <option key={s.value} value={s.value} label={s.label} />
              ))}
            </datalist>
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

      <details style={{ marginTop: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>
          CUPS-Diagnose
          {' '}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); void fetchDiagnostics(); }}
            disabled={loadingDiag}
            style={{ fontSize: '0.75rem', marginLeft: '0.5rem' }}
          >
            {loadingDiag ? '…' : 'Aktualisieren'}
          </button>
        </summary>
        {diagnostics && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', fontFamily: 'monospace' }}>
            {(['printers', 'devices', 'jobs'] as const).map((key) => (
              diagnostics[key] != null && (
                <div key={key} style={{ marginBottom: '0.75rem' }}>
                  <strong style={{ fontFamily: 'sans-serif', fontSize: '0.8rem' }}>
                    {key === 'printers' ? 'Drucker (lpstat -p -l)' : key === 'devices' ? 'Device URIs (lpstat -v)' : 'Jobs (lpstat -o)'}
                  </strong>
                  <pre style={{ margin: '0.2rem 0 0', padding: '0.4rem 0.5rem', background: 'var(--bg-alt, #f5f5f5)', borderRadius: '3px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {diagnostics[key] || '(leer)'}
                  </pre>
                </div>
              )
            ))}
            {diagnostics['devicesCache'] != null && (
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontFamily: 'sans-serif', fontSize: '0.8rem' }}>USB-Cache (devices.txt)</strong>
                <pre style={{ margin: '0.2rem 0 0', padding: '0.4rem 0.5rem', background: 'var(--bg-alt, #f5f5f5)', borderRadius: '3px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {diagnostics['devicesCache'] || '(leer — kein USB-Gerät oder Passthrough fehlt)'}
                </pre>
              </div>
            )}
            {diagnostics['error'] && (
              <p style={{ color: 'var(--color-error, #c00)', margin: 0 }}>{diagnostics['error']}</p>
            )}
          </div>
        )}
        {!diagnostics && !loadingDiag && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-muted, #555)' }}>
            Klick auf «Aktualisieren» um den aktuellen CUPS-Zustand zu laden.
          </p>
        )}
      </details>

      <details style={{ marginTop: '0.5rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}>Einrichtungshilfe</summary>
        <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
          <ol style={{ paddingLeft: '1.25rem', margin: '0 0 0.75rem' }}>
            <li>
              <strong>USB-Drucker anschliessen</strong> — Stack mit USB-Passthrough starten:{' '}
              <code>docker compose -f docker-compose.yml -f docker-compose.usb.yml up -d</code>
            </li>
            <li>
              <strong>Device URI ermitteln</strong>:{' '}
              <code>docker compose exec cups lpinfo -v</code>
              {' '}→ URI in das Feld «Device URI» kopieren oder per Autocomplete wählen.
            </li>
            <li>
              <strong>Treiber prüfen</strong>:{' '}
              <code>docker compose exec cups lpinfo -m</code>
              {' '}→ passenden Eintrag ins Feld «PPD-Modell» eintragen.
              <div style={{ marginTop: '0.2rem', color: 'var(--color-muted, #555)' }}>
                Treiber fehlen? <code>.deb</code>-Dateien von Brother in <code>cups/drivers/</code> ablegen, dann:{' '}
                <code>docker compose up --build cups</code>
              </div>
            </li>
            <li>
              <strong>Queue konfigurieren</strong> — «Erkennen» klickt Autocomplete vor.
              Queue-Name frei wählbar (z.B. <code>QL550_box</code>).
              Mediengrösse leer lassen = CUPS-Standard (PPD-Vorgabe), oder explizit setzen (z.B. <code>w62</code>).
            </li>
            <li>
              <strong>Label-Typen zuweisen</strong> — Drucker-Einstellungen-Karte: Queue-Namen den Label-Typen
              (Box, Artikel, Regal …) zuweisen.
            </li>
            <li>
              <strong>Netzwerkdrucker (A4/IPP)</strong> — Device URI: <code>ipps://IP/ipp/print</code>,
              PPD-Modell: <code>everywhere</code>. Kein Treiber-Rebuild nötig.
            </li>
            <li>
              <strong>Benutzerdefinierte Mediengrössen</strong> — angepasste PPD (z.B. mit 62×8 mm-Eintrag)
              nach <code>cups/ppds/</code> committen (Dateiname identisch zum installierten PPD), dann{' '}
              <code>docker compose up --build cups</code>.
            </li>
          </ol>
          <strong>Häufige Probleme:</strong>
          <dl style={{ margin: '0.4rem 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.75rem' }}>
            <dt style={{ color: 'var(--color-error, #c00)' }}>«Unauthorized»</dt>
            <dd style={{ margin: 0 }}>
              cups-Container neu bauen: <code>docker compose up --build cups</code>
              {' '}(AuthType None muss in cupsd.conf aktiv sein)
            </dd>
            <dt style={{ color: 'var(--color-error, #c00)' }}>«printer_not_ready»</dt>
            <dd style={{ margin: 0 }}>
              <code>docker compose exec cups lpstat -p</code> — Queue-Status prüfen
            </dd>
            <dt style={{ color: 'var(--color-error, #c00)' }}>Keine Geräte erkannt</dt>
            <dd style={{ margin: 0 }}>
              <code>docker compose exec cups ls /dev/bus/usb/</code> — USB-Passthrough prüfen;
              ggf. mit <code>docker-compose.usb.yml</code> starten
            </dd>
          </dl>
        </div>
      </details>
    </div>
  );
}
