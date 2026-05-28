import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

interface AdminConfig {
  mediaStorageMode: string;
  erpSyncEnabled: boolean;
  erpImportIncludeMedia: boolean;
  erpImportConfigured: boolean;
  shopwareSyncEnabled: boolean;
  printerConfigured: boolean;
}

interface OverviewCounts {
  items: number;
  boxes: number;
}

interface Props {
  authToken?: string;
  onAuthFailure?: () => void;
}

export default function SystemStatusCard({ authToken, onAuthFailure }: Props) {
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [counts, setCounts] = useState<OverviewCounts | null>(null);
  const [co2, setCo2] = useState<number | null>(null);

  useEffect(() => {
    const authHeaders: Record<string, string> = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
    void Promise.all([
      fetch('/api/health')
        .then(r => setHealthOk(r.ok))
        .catch(() => setHealthOk(false)),
      fetch('/api/admin/config', { headers: authHeaders })
        .then(r => {
          if (r.status === 401) { onAuthFailure?.(); return null; }
          return r.ok ? r.json() as Promise<AdminConfig> : null;
        })
        .then(d => { if (d) setConfig(d); })
        .catch(err => logError('Failed to load admin config', err)),
      fetch('/api/overview')
        .then(r => r.ok ? r.json() : null)
        .then((d: any) => {
          if (!d) return;
          if (d.counts) setCounts({ items: d.counts.items ?? 0, boxes: d.counts.boxes ?? 0 });
          if (typeof d.totalCo2SavedKg === 'number') setCo2(d.totalCo2SavedKg);
        })
        .catch(err => logError('Failed to load overview for system status', err)),
    ]);
  }, [authToken, onAuthFailure]);

  return (
    <div className="card">
      <h2>Systemstatus</h2>
      <div className="admin-status-row">
        <span>API:</span>
        {healthOk === null
          ? <span className="muted">…</span>
          : healthOk
            ? <span className="status-badge status-badge--ok">OK</span>
            : <span className="status-badge status-badge--error">Fehler</span>
        }
      </div>
      {counts !== null && (
        <>
          <div className="admin-status-row">
            <span>Artikel:</span>
            <strong>{counts.items}</strong>
          </div>
          <div className="admin-status-row">
            <span>Behälter:</span>
            <strong>{counts.boxes}</strong>
          </div>
        </>
      )}
      {co2 !== null && (
        <div className="admin-status-row">
          <span>CO₂ eingespart:</span>
          <strong>{co2.toFixed(1)} kg</strong>
        </div>
      )}
      {config !== null && (
        <div style={{ marginTop: '12px' }}>
          <p className="muted" style={{ margin: '0 0 4px' }}>Konfiguration:</p>
          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '13px' }}>
            <li>Medienspeicher: <strong>{config.mediaStorageMode}</strong></li>
            <li>ERP-Sync: <strong>{config.erpSyncEnabled ? 'aktiv' : 'inaktiv'}</strong></li>
            <li>ERP konfiguriert: <strong>{config.erpImportConfigured ? 'ja' : 'nein'}</strong></li>
            <li>ERP Medien: <strong>{config.erpImportIncludeMedia ? 'aktiv' : 'inaktiv'}</strong></li>
            <li>Shopware: <strong>{config.shopwareSyncEnabled ? 'aktiv' : 'inaktiv'}</strong></li>
            <li>Drucker konfiguriert: <strong>{config.printerConfigured ? 'ja' : 'nein'}</strong></li>
          </ul>
        </div>
      )}
    </div>
  );
}
