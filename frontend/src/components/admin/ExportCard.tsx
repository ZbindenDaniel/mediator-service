import React, { useState } from 'react';
import { logError } from '../../utils/logger';

const EXPORT_MODES = [
  { mode: 'backup', label: 'Backup', desc: 'Vollständiges Archiv aller Artikel und Behälter' },
  { mode: 'erp', label: 'ERP-Export', desc: 'ERP-kompatibles Format mit HTML-Langtext' },
  { mode: 'manual_import', label: 'Manuelle Übernahme', desc: 'Partner-CSV mit einfachem Langtext' },
  { mode: 'automatic_import', label: 'Automatischer Import', desc: 'ERP-Vertragsformat (schlüsselbasiert)' },
] as const;

export default function ExportCard() {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleExport(mode: string) {
    setLoading(mode);
    try {
      const res = await fetch(`/api/export/items?mode=${mode}`);
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
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card">
      <h2>Datenexport</h2>
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
