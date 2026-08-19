import React from 'react';
import type { AgenticRunSnapshot, AgenticSnapshotFields } from '../../../models';
import { buildAgenticItemRefPath } from '../lib/agentic';
import { formatDateTime } from '../lib/format';
import { dialogService } from './dialog';

// Fields shown in the diff, in display order. Langtext is diffed key-by-key (it holds the specs).
const TOP_LEVEL_FIELDS: Array<{ key: keyof AgenticSnapshotFields; label: string }> = [
  { key: 'Artikelbeschreibung', label: 'Artikelbeschreibung' },
  { key: 'Kurzbeschreibung', label: 'Kurzbeschreibung' },
  { key: 'Hersteller', label: 'Hersteller' },
  { key: 'Verkaufspreis', label: 'Verkaufspreis' },
  { key: 'Länge_mm', label: 'Länge (mm)' },
  { key: 'Breite_mm', label: 'Breite (mm)' },
  { key: 'Höhe_mm', label: 'Höhe (mm)' },
  { key: 'Gewicht_kg', label: 'Gewicht (kg)' },
  { key: 'Hauptkategorien_A', label: 'Hauptkategorie A' },
  { key: 'Unterkategorien_A', label: 'Unterkategorie A' },
  { key: 'Hauptkategorien_B', label: 'Hauptkategorie B' },
  { key: 'Unterkategorien_B', label: 'Unterkategorie B' }
];

export interface SnapshotDiffEntry {
  field: string;
  before: string;
  after: string;
  kind: 'added' | 'removed' | 'changed';
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((v) => displayValue(v)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function asLangtextObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function classify(before: string, after: string): SnapshotDiffEntry['kind'] {
  if (!before && after) return 'added';
  if (before && !after) return 'removed';
  return 'changed';
}

/**
 * Pure field-level diff between two enriched-state snapshots (or a snapshot and the current item).
 * Top-level fields are compared by display value; Langtext is compared key-by-key (that is where most
 * changes live). Only changed fields are returned.
 */
export function computeSnapshotDiff(
  before: AgenticSnapshotFields | null | undefined,
  after: AgenticSnapshotFields | null | undefined
): SnapshotDiffEntry[] {
  const beforeFields = before ?? {};
  const afterFields = after ?? {};
  const entries: SnapshotDiffEntry[] = [];

  for (const { key, label } of TOP_LEVEL_FIELDS) {
    const b = displayValue(beforeFields[key]);
    const a = displayValue(afterFields[key]);
    if (b !== a) {
      entries.push({ field: label, before: b, after: a, kind: classify(b, a) });
    }
  }

  const beforeLangtext = asLangtextObject(beforeFields.Langtext);
  const afterLangtext = asLangtextObject(afterFields.Langtext);
  const langtextKeys = Array.from(new Set([...Object.keys(beforeLangtext), ...Object.keys(afterLangtext)])).sort();
  for (const specKey of langtextKeys) {
    const b = displayValue(beforeLangtext[specKey]);
    const a = displayValue(afterLangtext[specKey]);
    if (b !== a) {
      entries.push({ field: `Langtext · ${specKey}`, before: b, after: a, kind: classify(b, a) });
    }
  }

  return entries;
}

const REASON_LABELS: Record<string, string> = {
  'pre-run': 'Vor KI-Lauf',
  'pre-rework': 'Vor Überarbeitung',
  restore: 'Wiederhergestellt'
};

function reviewStateLabel(state: string | null): string | null {
  if (!state) return null;
  const s = state.toLowerCase();
  if (s === 'approved') return 'Freigegeben';
  if (s === 'auto_approved') return 'Auto-freigegeben';
  if (s === 'rejected') return 'Abgelehnt';
  if (s === 'pending') return 'In Review';
  return null;
}

export interface AgenticSnapshotsPanelProps {
  artikelNummer: string;
  currentFields: AgenticSnapshotFields;
  onRestored?: () => void;
}

export function AgenticSnapshotsPanel({ artikelNummer, currentFields, onRestored }: AgenticSnapshotsPanelProps) {
  const [snapshots, setSnapshots] = React.useState<AgenticRunSnapshot[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!artikelNummer) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildAgenticItemRefPath(artikelNummer, 'snapshots'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list: AgenticRunSnapshot[] = Array.isArray(data?.snapshots) ? data.snapshots : [];
      setSnapshots(list);
      setSelectedId(list.length > 0 ? list[0].Id : null);
    } catch (err) {
      setError('Verlauf konnte nicht geladen werden.');
      console.error('Failed to load agentic snapshots', err);
    } finally {
      setLoading(false);
    }
  }, [artikelNummer]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = snapshots.find((s) => s.Id === selectedId) ?? snapshots[0] ?? null;
  // Diff the selected version against the item as it stands now — "what changed since this version".
  const diff = selected ? computeSnapshotDiff(selected.Fields, currentFields) : [];

  const handleRestore = React.useCallback(
    async (snapshot: AgenticRunSnapshot) => {
      const confirmed = await dialogService.confirm({
        title: 'Version wiederherstellen?',
        message:
          'Die KI-Felder werden auf diese Version zurückgesetzt. Der aktuelle Stand bleibt als neue Version im Verlauf erhalten.'
      });
      if (!confirmed) return;
      setRestoring(true);
      try {
        const res = await fetch(buildAgenticItemRefPath(artikelNummer, `snapshots/${snapshot.Id}/restore`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await load();
        onRestored?.();
      } catch (err) {
        console.error('Failed to restore agentic snapshot', err);
        await dialogService.alert({ title: 'Fehler', message: 'Wiederherstellung fehlgeschlagen.' });
      } finally {
        setRestoring(false);
      }
    },
    [artikelNummer, load, onRestored]
  );

  if (!artikelNummer) return null;
  if (loading && snapshots.length === 0) {
    return <p className="muted">Verlauf wird geladen…</p>;
  }
  if (error && snapshots.length === 0) {
    return <p className="muted">{error}</p>;
  }
  if (snapshots.length === 0) {
    return null;
  }

  return (
    <div className="agentic-snapshots card">
      <h4 className="agentic-snapshots__heading">KI-Verlauf ({snapshots.length})</h4>
      <ol className="agentic-snapshots__list">
        {snapshots.map((snapshot) => {
          const isSelected = selected?.Id === snapshot.Id;
          const reviewLabel = reviewStateLabel(snapshot.CapturedReviewState);
          return (
            <li
              key={snapshot.Id}
              className={`agentic-snapshots__item${isSelected ? ' is-selected' : ''}`}
            >
              <button
                type="button"
                className="agentic-snapshots__select"
                onClick={() => setSelectedId(snapshot.Id)}
                title="Änderungen seit dieser Version anzeigen"
              >
                <span className="agentic-snapshots__when">{formatDateTime(snapshot.CreatedAt)}</span>
                <span className="agentic-snapshots__reason">{REASON_LABELS[snapshot.Reason] ?? snapshot.Reason}</span>
                {reviewLabel ? <span className="agentic-snapshots__state">{reviewLabel}</span> : null}
              </button>
              <button
                type="button"
                className="btn agentic-snapshots__restore"
                disabled={restoring}
                onClick={() => void handleRestore(snapshot)}
              >
                Wiederherstellen
              </button>
            </li>
          );
        })}
      </ol>

      <div className="agentic-snapshots__diff">
        <p className="muted agentic-snapshots__diff-title">
          Änderungen seit der gewählten Version → aktueller Stand
        </p>
        {diff.length === 0 ? (
          <p className="muted">Keine Unterschiede zur gewählten Version.</p>
        ) : (
          <table className="details agentic-snapshots__diff-table">
            <tbody>
              {diff.map((entry) => (
                <tr key={entry.field} className={`responsive-row agentic-snapshots__diff-row is-${entry.kind}`}>
                  <th className="responsive-th">{entry.field}</th>
                  <td className="responsive-td">
                    <span className="agentic-snapshots__before">{entry.before || '—'}</span>
                    <span className="agentic-snapshots__arrow" aria-hidden="true"> → </span>
                    <span className="agentic-snapshots__after">{entry.after || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AgenticSnapshotsPanel;
