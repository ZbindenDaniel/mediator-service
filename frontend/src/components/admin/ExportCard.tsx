import React, { useState } from 'react';
import { logError } from '../../utils/logger';
import { ensureUser } from '../../lib/user';

const EXPORT_MODES = [
  { mode: 'backup', label: 'Backup', desc: 'Vollständiges, wiederherstellbares CSV-Archiv (Artikel, Behälter, KI-Läufe, Ereignisse) — Langtext als JSON, keine HTML-Zellen' },
  { mode: 'erp', label: 'ERP-Export', desc: 'ERP-kompatibles Format mit HTML-Langtext' },
  { mode: 'manual_import', label: 'Manuelle Übernahme', desc: 'Partner-CSV mit einfachem Langtext' },
  { mode: 'automatic_import', label: 'Automatischer Import', desc: 'ERP-Vertragsformat (schlüsselbasiert)' },
] as const;

export default function ExportCard() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(mode: string) {
    // The /api/export/items endpoint requires an `actor` (it logs an Exported event per item and
    // returns HTTP 400 without one) — omitting it made every download silently fail.
    const actor = (await ensureUser()).trim();
    if (!actor) {
      setError('Bitte zuerst einen Benutzernamen setzen.');
      return;
    }
    setError(null);
    setLoading(mode);
    try {
      // A "backup" must be a complete, restorable snapshot, so it routes through /api/export/data
      // (the only multi-entity export) and pulls items+boxes+agentic runs+events as CSV in one ZIP
      // — matching what /api/import can ingest. The ERP/partner modes stay on /api/export/items.
      const endpoint = mode === 'backup'
        ? '/api/export/data?format=zip&mode=backup&entities=items,boxes,agentic,events'
        : `/api/export/items?mode=${encodeURIComponent(mode)}&actor=${encodeURIComponent(actor)}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${mode}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logError('Export failed', err, { mode });
      setError('Export fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card">
      <h2>Datenexport</h2>
      {error ? <p className="alert alert-error">{error}</p> : null}
      {EXPORT_MODES.map(({ mode, label, desc }) => (
        <div key={mode} className="admin-export-row">
          <div>
            <strong>{label}</strong>
            <span className="muted"> — {desc}</span>
          </div>
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void handleExport(mode)}
          >
            {loading === mode ? 'Wird exportiert…' : 'Herunterladen'}
          </button>
        </div>
      ))}
    </div>
  );
}
