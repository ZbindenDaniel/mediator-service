import React from 'react';
import { formatDateTime } from '../lib/format';

// A stored agentic transcript is an array of per-stage sections (see backend flow/transcript.ts):
// { heading, timestamp, request?, response?, messages?, toolInvocations?, logLines?, errors? }.
interface TranscriptMessage { role?: string; content?: unknown }
interface TranscriptSection {
  heading?: string;
  timestamp?: string;
  request?: unknown;
  response?: unknown;
  messages?: TranscriptMessage[];
  toolInvocations?: unknown[];
  logLines?: unknown[];
  errors?: unknown[];
}

// Human labels for the known stage headings; unknown headings fall through verbatim.
const HEADING_LABELS: Record<string, string> = {
  'review-context': 'Review-Kontext',
  'search-planner': 'Such-Planung',
  search: 'Suche',
  extraction: 'Extraktion',
  supervisor: 'Supervisor (Prüfung)',
  categorizer: 'Kategorisierung',
  pricing: 'Preis',
  wording: 'Formulierung',
  shopware: 'Shopware'
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function Collapsible({ summary, children, open = false }: { summary: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="transcript-sub">
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

export interface TranscriptViewerProps {
  /** The run's TranscriptUrl (served JSON). Null/absent → nothing to show. */
  url?: string | null;
}

export function TranscriptViewer({ url }: TranscriptViewerProps) {
  const [sections, setSections] = React.useState<TranscriptSection[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSections(Array.isArray(data) ? data as TranscriptSection[] : []);
      setLoaded(true);
    } catch (err) {
      // A legacy run may have an .md/.html transcript rather than JSON — fall back to the raw link.
      console.error('Failed to load transcript', err);
      setError('Transkript konnte nicht als JSON geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [url]);

  if (!url) return null;

  return (
    <div className="transcript-viewer card">
      <div className="transcript-viewer__head">
        <h4 className="transcript-viewer__heading">Agenten-Transkript</h4>
        {!loaded && !loading ? (
          <button type="button" className="btn" onClick={() => void load()}>Anzeigen</button>
        ) : null}
        <a href={url} target="_blank" rel="noreferrer" className="transcript-viewer__raw">Rohdaten</a>
      </div>

      {loading ? <p className="muted">Lade…</p> : null}
      {error ? <p className="muted">{error} <a href={url} target="_blank" rel="noreferrer">Protokoll öffnen</a></p> : null}

      {sections && sections.length === 0 ? <p className="muted">Kein Transkript vorhanden.</p> : null}
      {sections && sections.length > 0 ? (
        <ol className="transcript-viewer__stages">
          {sections.map((s, i) => {
            const label = (s.heading && HEADING_LABELS[s.heading]) || s.heading || `Schritt ${i + 1}`;
            const when = s.timestamp ? formatDateTime(s.timestamp) : '';
            const response = asText(s.response);
            return (
              <li key={i} className="transcript-viewer__stage">
                <details open={i === sections.length - 1 /* last stage expanded by default */}>
                  <summary>
                    <span className="transcript-viewer__stage-name">{label}</span>
                    {when ? <span className="transcript-viewer__stage-when muted"> · {when}</span> : null}
                  </summary>
                  {response ? <pre className="transcript-viewer__response">{response}</pre> : <p className="muted">—</p>}
                  {s.request !== undefined ? <Collapsible summary="Eingabe / Kontext"><pre>{asText(s.request)}</pre></Collapsible> : null}
                  {s.messages?.length ? (
                    <Collapsible summary={`Nachrichten (${s.messages.length})`}>
                      <pre>{s.messages.map((m) => `[${m.role ?? '?'}]\n${asText(m.content)}`).join('\n\n')}</pre>
                    </Collapsible>
                  ) : null}
                  {s.toolInvocations?.length ? <Collapsible summary={`Tool-Aufrufe (${s.toolInvocations.length})`}><pre>{asText(s.toolInvocations)}</pre></Collapsible> : null}
                  {s.errors?.length ? <Collapsible summary={`Fehler (${s.errors.length})`} open><pre>{asText(s.errors)}</pre></Collapsible> : null}
                </details>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

export default TranscriptViewer;
