import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

interface SettingValue {
  value: string;
  source: 'db' | 'env';
}

interface PrinterSettings {
  server: SettingValue;
  queueDefault: SettingValue;
  queueBox: SettingValue;
  queueItem: SettingValue;
  queueItemSmall: SettingValue;
  queueShelf: SettingValue;
  queueMarketing: SettingValue;
}

interface Props {
  authToken?: string;
  onAuthFailure?: () => void;
}

const FIELD_LABELS: Array<{ field: keyof PrinterSettings; label: string }> = [
  { field: 'server',        label: 'CUPS Server (leer = Docker-Socket)' },
  { field: 'queueDefault',  label: 'Standard-Queue (Fallback)' },
  { field: 'queueBox',      label: 'Box-Etiketten' },
  { field: 'queueItem',     label: 'Artikel-Etiketten' },
  { field: 'queueItemSmall',label: 'Artikel klein' },
  { field: 'queueShelf',    label: 'Regal (A4)' },
  { field: 'queueMarketing',label: 'Produktblatt (A4)' },
];

export default function PrinterSettingsCard({ authToken, onAuthFailure }: Props) {
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const headers = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  });

  async function load() {
    try {
      const res = await fetch('/api/admin/printer-settings', { headers: headers() });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (res.ok) {
        const data = await res.json() as PrinterSettings;
        setSettings(data);
        const d: Record<string, string> = {};
        for (const { field } of FIELD_LABELS) {
          d[field] = data[field]?.value ?? '';
        }
        setDraft(d);
      }
    } catch (err) {
      logError('Failed to load printer settings', err);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const body: Record<string, string | null> = {};
      for (const { field } of FIELD_LABELS) {
        // empty string → clear override (revert to env default)
        body[field] = draft[field] ?? null;
      }
      const res = await fetch('/api/admin/printer-settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (res.ok) {
        const data = await res.json() as PrinterSettings;
        setSettings(data);
        setMessage('Gespeichert');
      } else {
        setMessage('Fehler beim Speichern');
      }
    } catch (err) {
      logError('Failed to save printer settings', err);
      setMessage('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <div className="card">
      <h2>Drucker-Einstellungen</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Leer lassen = Compose-Standard verwenden. Änderungen gelten sofort ohne Neustart.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {FIELD_LABELS.map(({ field, label }) => (
            <tr key={field} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
              <td style={{ padding: '0.4rem 0.5rem 0.4rem 0', whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                {label}
              </td>
              <td style={{ padding: '0.3rem 0.5rem' }}>
                <input
                  type="text"
                  value={draft[field] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                  placeholder={settings[field]?.source === 'env' ? `env: ${settings[field].value}` : ''}
                  style={{ width: '100%', fontSize: '0.875rem' }}
                />
              </td>
              <td style={{ padding: '0.3rem 0', whiteSpace: 'nowrap' }}>
                {settings[field]?.source === 'db' && (
                  <span className="status-badge status-badge--ok" style={{ fontSize: '0.75rem' }}>DB</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button onClick={() => void save()} disabled={saving} className="btn btn--primary">
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
        {message && <span className="muted">{message}</span>}
      </div>
    </div>
  );
}
