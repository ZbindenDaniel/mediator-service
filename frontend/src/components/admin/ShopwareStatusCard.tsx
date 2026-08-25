import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

interface Props {
  authToken?: string;
  onAuthFailure?: () => void;
}

interface ConfigSummary {
  enabled: boolean;
  baseUrl: string | null;
  salesChannelConfigured: boolean;
  credentialMode: 'client_credentials' | 'access_token_only' | 'none';
  requestTimeoutMs: number;
  issues: string[];
  checkSupported: boolean;
}

interface QueueCounts {
  total: number;
  queued: number;
  processing: number;
  succeeded: number;
  failed: number;
  oldestQueuedAt: string | null;
}

interface ConnectionStep {
  name: 'auth' | 'search';
  ok: boolean;
  status: number | null;
  durationMs: number;
  error?: string;
}

interface CheckResult {
  ok?: boolean;
  reason?: string;
  message?: string;
  steps?: ConnectionStep[];
  productSampleCount?: number | null;
  checkedAt?: string;
}

const STEP_LABEL: Record<string, string> = { auth: 'Admin-Token (OAuth)', search: 'Store-API Suche' };
const REASON_LABEL: Record<string, string> = {
  disabled: 'Shopware ist deaktiviert (SHOPWARE_ENABLED=false).',
  no_credentials: 'Keine Zugangsdaten konfiguriert.',
  access_token_unsupported: 'Nur ein Access-Token gesetzt — der Such-Client benötigt CLIENT_ID + CLIENT_SECRET.',
  config_error: 'Konfigurationsfehler beim Erstellen des Clients.'
};

export default function ShopwareStatusCard({ authToken, onAuthFailure }: Props) {
  const [config, setConfig] = useState<ConfigSummary | null>(null);
  const [queue, setQueue] = useState<QueueCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders: Record<string, string> = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/shopware/status', { headers: authHeaders });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok) { setError('Fehler beim Laden'); return; }
      const data = await res.json() as { config: ConfigSummary; queue: QueueCounts };
      setConfig(data.config);
      setQueue(data.queue);
    } catch (err) {
      logError('Failed to load Shopware status', err);
      setError('Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  async function runCheck() {
    try {
      setChecking(true);
      setError(null);
      setResult(null);
      const res = await fetch('/api/admin/shopware/check', { method: 'POST', headers: authHeaders });
      if (res.status === 401) { onAuthFailure?.(); return; }
      if (!res.ok) { setError('Verbindungstest fehlgeschlagen'); return; }
      setResult(await res.json() as CheckResult);
    } catch (err) {
      logError('Shopware connection check failed', err);
      setError('Verbindungstest fehlgeschlagen');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="card">
      <h2>Shopware-Verbindung</h2>

      {loading ? (
        <p className="muted">Lade…</p>
      ) : config ? (
        <>
          <div className="admin-status-row">
            <span>Status:</span>
            {config.enabled
              ? <span className="status-badge status-badge--ok">Aktiviert</span>
              : <span className="status-badge status-badge--error">Deaktiviert</span>}
          </div>

          <ul className="muted" style={{ margin: '8px 0', paddingLeft: 18, fontSize: '0.85em', lineHeight: 1.6 }}>
            <li>Basis-URL: <strong>{config.baseUrl || '—'}</strong></li>
            <li>Sales-Channel-Key: <strong>{config.salesChannelConfigured ? 'gesetzt' : 'fehlt'}</strong></li>
            <li>Zugangsart: <strong>{config.credentialMode}</strong></li>
          </ul>

          {config.issues.length > 0 && (
            <div className="alert alert-error" style={{ fontSize: '0.85em' }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {config.issues.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          )}

          <div className="admin-status-row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => void runCheck()}
              disabled={checking || !config.checkSupported}
              title={config.checkSupported ? undefined : 'Verbindungstest benötigt SHOPWARE_ENABLED=true und Client-Zugangsdaten'}
            >
              {checking ? 'Teste…' : 'Verbindung testen'}
            </button>
          </div>

          {result && (
            <div style={{ marginTop: 8, fontSize: '0.85em' }}>
              <div className="admin-status-row">
                <span>Ergebnis:</span>
                {result.ok
                  ? <span className="status-badge status-badge--ok">Verbunden</span>
                  : <span className="status-badge status-badge--error">Fehlgeschlagen</span>}
              </div>
              {result.reason && (
                <p className="muted" style={{ marginTop: 4 }}>
                  {REASON_LABEL[result.reason] ?? result.reason}{result.message ? ` (${result.message})` : ''}
                </p>
              )}
              {result.steps && result.steps.length > 0 && (
                <ul style={{ margin: '4px 0', paddingLeft: 18, lineHeight: 1.6 }}>
                  {result.steps.map((s) => (
                    <li key={s.name}>
                      {s.ok ? '✓' : '✗'} {STEP_LABEL[s.name] ?? s.name}
                      {' — '}{s.durationMs} ms
                      {s.status != null ? `, HTTP ${s.status}` : ''}
                      {s.error ? `: ${s.error}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {result.ok && typeof result.productSampleCount === 'number' && (
                <p className="muted">Store-API erreichbar ({result.productSampleCount} Treffer auf Testabfrage).</p>
              )}
            </div>
          )}

          {queue && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border, #ddd)', paddingTop: 8 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '0.9em' }}>Sync-Warteschlange</p>
              <p className="muted" style={{ margin: 0, fontSize: '0.85em' }}>
                Offen: <strong>{queue.queued}</strong> · In Arbeit: {queue.processing} ·
                {' '}Erledigt: {queue.succeeded} · Fehler: {queue.failed} · Gesamt: {queue.total}
              </p>
              {queue.queued > 0 && queue.succeeded === 0 && queue.processing === 0 && (
                <p className="muted" style={{ marginTop: 4, fontSize: '0.8em' }}>
                  Hinweis: Jobs sammeln sich an, werden aber nicht versendet — der Dispatcher ist noch nicht implementiert.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="muted">Keine Daten.</p>
      )}

      {error && <p className="alert alert-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
