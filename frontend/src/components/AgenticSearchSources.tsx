import React from 'react';

export interface AgenticSearchSource {
  url: string;
  title?: string;
  description?: string;
}

// Stored shape written by both writers — the invoker (`serializeSearchSourcesForReuse`) and the
// result-handler (`normalizeSearchLinks`): an array of `{ url, title?, description? }`. Parse
// defensively: this is operator-facing evidence, so a malformed blob must degrade to "nothing to show"
// rather than throw and blank the KI tab.
export function parseAgenticSearchSources(json: string | null | undefined): AgenticSearchSource[] {
  if (!json || typeof json !== 'string') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const out: AgenticSearchSource[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!url) {
      continue;
    }
    const title =
      typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim() : undefined;
    const description =
      typeof candidate.description === 'string' && candidate.description.trim()
        ? candidate.description.trim()
        : undefined;
    out.push({ url, title, description });
  }
  return out;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface AgenticSearchSourcesProps {
  sources: AgenticSearchSource[];
  /** When provided, each source gets a remove control that curates the stored evidence by URL. */
  onDelete?: (url: string) => void;
  /** URL currently being removed — disables its control to prevent double-submits. */
  deletingUrl?: string | null;
  /** Disables every remove control (e.g. while another agentic action is running). */
  disabled?: boolean;
}

/**
 * Renders the stored search evidence for an agentic run (`agentic_runs.LastSearchLinksJson`). Operators
 * can see whether an item already had search evidence and, when `onDelete` is wired, remove a bad result
 * so it stops feeding the reuse/grounding path on the next run.
 */
export function AgenticSearchSources({ sources, onDelete, deletingUrl, disabled }: AgenticSearchSourcesProps) {
  if (!sources.length) {
    return null;
  }
  return (
    <div className="agentic-search-sources">
      <ul className="agentic-search-sources__list">
        {sources.map((source, index) => {
          const isDeleting = deletingUrl === source.url;
          return (
            <li key={`${source.url}-${index}`} className="agentic-search-sources__item">
              <a
                className="agentic-search-sources__link"
                href={source.url}
                target="_blank"
                rel="noreferrer"
                title={source.description ?? source.url}
              >
                {source.title ?? hostnameOf(source.url)}
              </a>
              <span className="agentic-search-sources__domain">{hostnameOf(source.url)}</span>
              {onDelete && (
                <button
                  type="button"
                  className="agentic-search-sources__remove"
                  onClick={() => onDelete(source.url)}
                  disabled={disabled || isDeleting}
                  title="Suchergebnis entfernen"
                  aria-label={`Suchergebnis entfernen: ${source.title ?? source.url}`}
                >
                  {isDeleting ? '…' : '×'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted agentic-search-sources__note">
        Gespeicherte Suchergebnisse — werden bei einem erneuten Lauf wiederverwendet, sofern keine
        gezielte Nachsuche nötig ist. Schlechte Treffer hier entfernen, damit sie die Pipeline nicht
        verfälschen.
      </p>
    </div>
  );
}

export default AgenticSearchSources;
