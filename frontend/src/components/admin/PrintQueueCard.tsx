import React, { useEffect, useState } from 'react';
import { logError } from '../../utils/logger';

interface LabelJob {
  Id: number;
  ItemUUID: string;
  CreatedAt: string;
  Error: string | null;
}

interface QueueData {
  pending: number;
  failed: number;
  recentFailed: LabelJob[];
}

export default function PrintQueueCard() {
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [printerReason, setPrinterReason] = useState('');

  async function load() {
    try {
      const [qRes, pRes] = await Promise.all([
        fetch('/api/admin/label-queue'),
        fetch('/api/printer/status'),
      ]);
      if (qRes.ok) setQueue(await qRes.json() as QueueData);
      if (pRes.ok) {
        const p = await pRes.json() as { ok?: boolean; reason?: string };
        setPrinterOk(Boolean(p.ok));
        setPrinterReason(p.reason ?? '');
      } else {
        setPrinterOk(false);
        setPrinterReason('Kein Drucker konfiguriert');
      }
    } catch (err) {
      logError('Failed to load print queue', err);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="card">
      <h2>Druckwarteschlange</h2>
      <div className="admin-status-row">
        <span>Drucker:</span>
        {printerOk === null
          ? <span className="muted">wird geprüft…</span>
          : printerOk
            ? <span className="status-badge status-badge--ok">Online</span>
            : <span className="status-badge status-badge--error">Offline{printerReason ? ` — ${printerReason}` : ''}</span>
        }
      </div>
      {queue !== null && (
        <>
          <div className="admin-status-row">
            <span>Ausstehend:</span>
            <strong>{queue.pending}</strong>
          </div>
          <div className="admin-status-row">
            <span>Fehlgeschlagen:</span>
            <strong>{queue.failed}</strong>
          </div>
          {queue.recentFailed.length > 0 && (
            <div>
              <p className="muted" style={{ margin: '8px 0 4px' }}>Letzte Fehler:</p>
              <ul style={{ margin: 0, paddingLeft: '16px' }}>
                {queue.recentFailed.map((job) => (
                  <li key={job.Id} style={{ fontSize: '13px' }}>
                    <span className="mono">{job.ItemUUID}</span>
                    <span className="muted"> — {job.Error ?? 'Unbekannter Fehler'} ({job.CreatedAt})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <button type="button" onClick={() => void load()} style={{ marginTop: '8px' }}>
        Aktualisieren
      </button>
    </div>
  );
}
