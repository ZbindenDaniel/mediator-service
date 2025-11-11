import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateItemCard from './RelocateItemCard';
import type { Item, EventLog, AgenticRun } from '../../../models';
import {
  AGENTIC_RUN_ACTIVE_STATUSES,
  AGENTIC_RUN_RESTARTABLE_STATUSES,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_TERMINAL_STATUSES,
  ItemEinheit,
  isItemEinheit,
  normalizeAgenticRunStatus
} from '../../../models';
import { formatDateTime } from '../lib/format';
import { ensureUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import { filterAllowedEvents } from '../utils/eventLogLevels';
import { buildItemCategoryLookups } from '../lib/categoryLookup';
import {
  describeAgenticFailureReason,
  extractAgenticFailureReason,
  persistAgenticRunCancellation,
  triggerAgenticRun
} from '../lib/agentic';
import { parseLangtext } from '../lib/langtext';

// TODO(agentic-failure-reason): Ensure agentic restart errors expose backend reasons in UI.
// TODO(markdown-langtext): Extract markdown rendering into a shared component when additional fields use Markdown content.
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemMediaGallery from './ItemMediaGallery';
import { dialogService, useDialog } from './dialog';
import LoadingPage from './LoadingPage';

interface Props {
  itemId: string;
}

export type AgenticBadgeVariant = 'info' | 'success' | 'error' | 'pending' | 'warning';

export interface AgenticStatusDisplay {
  label: string;
  className: string;
  description: string;
  variant: AgenticBadgeVariant;
  needsReviewBadge: boolean;
  isTerminal: boolean;
}

const DEFAULT_DETAIL_EINHEIT: ItemEinheit = ItemEinheit.Stk;

function resolveDetailEinheit(value: unknown): ItemEinheit {
  try {
    if (isItemEinheit(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (isItemEinheit(trimmed)) {
        return trimmed;
      }
      if (trimmed.length > 0) {
        console.warn('ItemDetail: Invalid Einheit encountered, reverting to default.', {
          provided: trimmed
        });
      }
    } else if (value !== null && value !== undefined) {
      console.warn('ItemDetail: Unexpected Einheit type encountered, reverting to default.', {
        providedType: typeof value
      });
    }
  } catch (error) {
    console.error('ItemDetail: Failed to resolve Einheit value, using default.', error);
  }
  return DEFAULT_DETAIL_EINHEIT;
}

export interface AgenticStatusCardProps {
  status: AgenticStatusDisplay;
  rows: [string, React.ReactNode][];
  actionPending: boolean;
  reviewIntent: 'approved' | 'rejected' | null;
  error: string | null;
  needsReview: boolean;
  canCancel: boolean;
  canStart: boolean;
  canRestart: boolean;
  isInProgress: boolean;
  onRestart: () => void | Promise<void>;
  onReview: (decision: 'approved' | 'rejected') => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

interface NormalizedDetailValue {
  content: React.ReactNode;
  isPlaceholder: boolean;
}

const DETAIL_PLACEHOLDER_TEXT = '-';

function buildPlaceholder(): NormalizedDetailValue {
  return {
    content: <span className="details-placeholder">{DETAIL_PLACEHOLDER_TEXT}</span>,
    isPlaceholder: true
  };
}

function normalizeDetailValue(value: React.ReactNode): NormalizedDetailValue {
  if (value === null || value === undefined) {
    return buildPlaceholder();
  }

  if (typeof value === 'boolean') {
    return {
      content: value ? 'Ja' : 'Nein',
      isPlaceholder: false
    };
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return buildPlaceholder();
    }
    return { content: value, isPlaceholder: false };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return buildPlaceholder();
    }
    return { content: trimmed, isPlaceholder: false };
  }

  if (Array.isArray(value)) {
    return { content: value, isPlaceholder: false };
  }

  if (React.isValidElement(value)) {
    return { content: value, isPlaceholder: false };
  }

  return { content: value, isPlaceholder: false };
}

function humanizeCategoryLabel(label: string): string {
  try {
    return label.replace(/_/g, ' ');
  } catch (error) {
    console.error('Failed to humanize category label', { label }, error);
    return label;
  }
}

function renderLangtextInlineSegments(
  text: string,
  counters: { bold: number },
  keyBase: string
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    counters.bold += 1;
    nodes.push(
      <strong key={`${keyBase}-bold-${counters.bold}`}>{match[1]}</strong>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  if (nodes.length === 0) {
    return text;
  }

  return nodes;
}

function buildLangtextMarkdown(raw: string): React.ReactNode | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  let normalizedText = trimmed.replace(/\r\n/g, '\n');
  if (normalizedText.trim().startsWith('- ') && normalizedText.includes(' - **')) {
    normalizedText = normalizedText.replace(/\s+-\s+(?=\*\*)/g, '\n- ');
  }

  const lines = normalizedText.split('\n');
  if (lines.length === 0) {
    return trimmed;
  }

  const blocks: React.ReactNode[] = [];
  const counters = { bold: 0 };
  let pendingList: React.ReactNode[] = [];

  const flushList = () => {
    if (pendingList.length > 0) {
      const listKey = `langtext-ul-${blocks.length}`;
      blocks.push(<ul key={listKey}>{pendingList}</ul>);
      pendingList = [];
    }
  };

  lines.forEach((line, index) => {
    const value = line.trim();
    if (!value) {
      flushList();
      return;
    }

    if (value.startsWith('- ')) {
      const itemContent = value.slice(2).trim();
      const inline = renderLangtextInlineSegments(itemContent, counters, `li-${index}`);
      pendingList.push(<li key={`langtext-li-${index}`}>{inline}</li>);
      return;
    }

    flushList();
    const inline = renderLangtextInlineSegments(value, counters, `p-${index}`);
    blocks.push(
      <p key={`langtext-p-${index}`}>{inline}</p>
    );
  });

  flushList();

  if (blocks.length === 0) {
    return trimmed;
  }

  return <div className="item-detail__langtext">{blocks}</div>;
}

export function AgenticStatusCard({
  status,
  rows,
  actionPending,
  reviewIntent,
  error,
  needsReview,
  canCancel,
  canStart,
  canRestart,
  isInProgress,
  onRestart,
  onReview,
  onCancel
}: AgenticStatusCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const contentId = useMemo(() => `agentic-status-panel-${Math.random().toString(36).slice(2)}`, []);
  const handleToggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        console.info('Toggled agentic status card', { collapsed: next });
      } catch (logError) {
        console.error('Failed to log agentic status card toggle', logError);
      }
      return next;
    });
  }, []);

  return (
    <div className={`card agentic-status-card${isCollapsed ? ' agentic-status-card--collapsed' : ''}`}>
      <h3 className="agentic-status-card__heading">
        <button
          type="button"
          className="agentic-status-card__toggle"
          onClick={handleToggle}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          <span className="agentic-status-card__title">Ki Status</span>
          <span className={`agentic-status-card__summary ${status.className}`}>{status.label}</span>
          <span className="agentic-status-card__chevron" aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
        </button>
      </h3>
      {!isCollapsed ? (
        <div className="agentic-status-card__content" id={contentId}>
          <div className="row status-row">
            <span className={status.className}>{status.label}</span>
            {isInProgress ? <span className="status-spinner" aria-hidden="true" /> : null}
          </div>
          <p className="muted">{status.description}</p>
          {rows.length > 0 ? (
            <table className="details">
              <tbody>
                {rows.map(([k, v], idx) => (
                  (() => {
                    const cell = normalizeDetailValue(v);
                    return (
                      <tr key={`${k}-${idx}`} className="responsive-row">
                        <th className="responsive-th">{k}</th>
                        <td className={`responsive-td${cell.isPlaceholder ? ' is-placeholder' : ''}`}>
                          {cell.content}
                        </td>
                      </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          ) : null}
          {actionPending ? <p className="muted">Ki-Aktion wird ausgeführt…</p> : null}
          {reviewIntent ? (
            <p className="muted">
              Review-Aktion "{reviewIntent === 'approved' ? 'Freigeben' : 'Ablehnen'}" vorbereitet.
            </p>
          ) : null}
          {error ? (
            <p className="muted" style={{ color: '#a30000' }}>{error}</p>
          ) : null}
          {canCancel ? (
            <div className='row'>
              <button type="button" className="btn" disabled={actionPending} onClick={onCancel}>
                Abbrechen
              </button>
            </div>
          ) : null}
          {!needsReview && (canStart || canRestart) ? (
            <div className='row'>
              {canStart ? (
                <button type="button" className="btn" disabled={actionPending} onClick={onRestart}>
                  Starten
                </button>
              ) : null}
              {canRestart ? (
                <button type="button" className="btn" disabled={actionPending} onClick={onRestart}>
                  Wiederholen
                </button>
              ) : null}
            </div>
          ) : null}
          {needsReview ? (
            <div className='row'>
              <button type="button" className="btn" disabled={actionPending} onClick={() => onReview('approved')}>
                Freigeben
              </button>
              <button type="button" className="btn danger" disabled={actionPending} onClick={() => onReview('rejected')}>
                Ablehnen
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function resolveActorName(actor?: string | null): string {
  return actor && actor.trim() ? actor : 'System';
}

export interface AgenticRestartRequestInput {
  actor: string;
  search: string | null;
  reviewDecision?: string | null;
  reviewNotes?: string | null;
  reviewedBy?: string | null;
}

export function buildAgenticRestartRequestPayload({
  actor,
  search,
  reviewDecision,
  reviewNotes,
  reviewedBy
}: AgenticRestartRequestInput): Record<string, unknown> {
  const trimmedActor = actor.trim();
  const trimmedSearch = (search ?? '').trim();
  const payload: Record<string, unknown> = {
    actor: trimmedActor,
    search: trimmedSearch
  };

  const decisionNormalized = reviewDecision && reviewDecision.trim() ? reviewDecision.trim().toLowerCase() : null;
  const notesNormalized = reviewNotes && reviewNotes.trim() ? reviewNotes.trim() : null;
  const reviewedByNormalized = reviewedBy && reviewedBy.trim() ? reviewedBy.trim() : null;

  if (decisionNormalized || notesNormalized || reviewedByNormalized) {
    payload.review = {
      decision: decisionNormalized,
      notes: notesNormalized,
      reviewedBy: reviewedByNormalized
    };
  }

  return payload;
}

export interface ItemDetailAgenticCancelRequest {
  agentic: AgenticRun;
  actor: string;
  persistCancellation: typeof persistAgenticRunCancellation;
  logger?: Pick<typeof console, 'warn' | 'error' | 'info'>;
}

export interface ItemDetailAgenticCancelResult {
  updatedRun: AgenticRun | null;
  error: string | null;
}

export async function performItemDetailAgenticCancel({
  agentic,
  actor,
  persistCancellation,
  logger = console
}: ItemDetailAgenticCancelRequest): Promise<ItemDetailAgenticCancelResult> {
  let updatedRun: AgenticRun | null = agentic;
  let finalError: string | null = null;

  const persistence = await persistCancellation({
    itemId: agentic.ItemUUID,
    actor,
    context: 'item detail cancel persistence'
  });

  if (persistence.ok) {
    if (persistence.agentic) {
      updatedRun = persistence.agentic;
    }
    logger.info?.('Persisted agentic cancellation via mediator API', {
      itemId: agentic.ItemUUID,
      status: persistence.status
    });
  } else if (persistence.status === 404) {
    finalError = 'Kein laufender Ki-Durchlauf gefunden.';
    logger.warn?.('Agentic cancellation skipped because run was not found', {
      itemId: agentic.ItemUUID
    });
  } else if (persistence.status === 0) {
    finalError = 'Ki-Abbruch fehlgeschlagen.';
    logger.error?.('Agentic cancellation failed due to network error', {
      itemId: agentic.ItemUUID
    });
  } else {
    finalError = 'Ki-Abbruch konnte nicht gespeichert werden.';
    logger.error?.('Agentic cancellation failed to persist via mediator API', {
      itemId: agentic.ItemUUID,
      status: persistence.status
    });
  }

  return { updatedRun, error: finalError };
}

export function agenticStatusDisplay(run: AgenticRun | null): AgenticStatusDisplay {
  if (!run) {
    return {
      label: 'Keine Daten',
      className: 'pill status status-info',
      description: 'Es liegen keine agentischen Ergebnisse vor.',
      variant: 'info',
      needsReviewBadge: false,
      isTerminal: false
    };
  }

  const normalizedStatus = normalizeAgenticRunStatus(run.Status);
  const normalizedReview = (run.ReviewState || '').trim().toLowerCase();
  const defaultLabel = run.Status && run.Status.trim() ? run.Status.trim() : 'Unbekannt';

  let base: Omit<AgenticStatusDisplay, 'className'> = {
    label: defaultLabel,
    description: `Status: ${defaultLabel}`,
    variant: 'info',
    needsReviewBadge: false,
    isTerminal: AGENTIC_RUN_TERMINAL_STATUSES.has(normalizedStatus)
  };

  switch (normalizedStatus) {
    case AGENTIC_RUN_STATUS_NOT_STARTED:
      base = {
        label: 'Nicht gestartet',
        description: 'Der agentische Durchlauf wurde noch nicht gestartet.',
        variant: 'info',
        needsReviewBadge: false,
        isTerminal: true
      };
      break;
    case AGENTIC_RUN_STATUS_FAILED:
      base = {
        label: 'Fehlgeschlagen',
        description: 'Der agentische Durchlauf ist fehlgeschlagen.',
        variant: 'error',
        needsReviewBadge: false,
        isTerminal: true
      };
      break;
    case AGENTIC_RUN_STATUS_RUNNING:
      base = {
        label: 'In Arbeit',
        description: 'Der agentische Durchlauf läuft derzeit.',
        variant: 'info',
        needsReviewBadge: false,
        isTerminal: false
      };
      break;
    case AGENTIC_RUN_STATUS_QUEUED:
      base = {
        label: 'Wartet',
        description: 'Der agentische Durchlauf wartet auf Ausführung.',
        variant: 'pending',
        needsReviewBadge: false,
        isTerminal: false
      };
      break;
    case AGENTIC_RUN_STATUS_CANCELLED:
      base = {
        label: 'Abgebrochen',
        description: 'Der agentische Durchlauf wurde abgebrochen.',
        variant: 'info',
        needsReviewBadge: false,
        isTerminal: true
      };
      break;
    case AGENTIC_RUN_STATUS_REVIEW:
      base = {
        label: 'Review ausstehend',
        description: 'Das Ergebnis wartet auf Freigabe.',
        variant: 'pending',
        needsReviewBadge: true,
        isTerminal: false
      };
      break;
    case AGENTIC_RUN_STATUS_APPROVED:
      base = {
        label: 'Freigegeben',
        description: 'Das Ergebnis wurde freigegeben.',
        variant: 'success',
        needsReviewBadge: false,
        isTerminal: true
      };
      break;
    case AGENTIC_RUN_STATUS_REJECTED:
      base = {
        label: 'Abgelehnt',
        description: 'Das Ergebnis wurde abgelehnt.',
        variant: 'error',
        needsReviewBadge: false,
        isTerminal: true
      };
      break;
    default:
      break;
  }

  let finalMeta = base;
  if (normalizedReview === 'pending') {
    finalMeta = {
      label: 'Review ausstehend',
      description: 'Das Ergebnis wartet auf Freigabe.',
      variant: 'pending',
      needsReviewBadge: true,
      isTerminal: false
    };
  } else if (normalizedReview === 'approved') {
    finalMeta = {
      label: 'Freigegeben',
      description: 'Das Ergebnis wurde freigegeben.',
      variant: 'success',
      needsReviewBadge: false,
      isTerminal: true
    };
  } else if (normalizedReview === 'rejected') {
    finalMeta = {
      label: 'Abgelehnt',
      description: 'Das Ergebnis wurde abgelehnt.',
      variant: 'error',
      needsReviewBadge: false,
      isTerminal: true
    };
  }

  return {
    ...finalMeta,
    className: `pill status status-${finalMeta.variant}`
  };
}

export function isAgenticRunInProgress(run: AgenticRun | null): boolean {
  if (!run) {
    return false;
  }

  const normalizedStatus = normalizeAgenticRunStatus(run.Status);
  return AGENTIC_RUN_ACTIVE_STATUSES.has(normalizedStatus);
}

export default function ItemDetail({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [agentic, setAgentic] = useState<AgenticRun | null>(null);
  const [agenticError, setAgenticError] = useState<string | null>(null);
  const [agenticActionPending, setAgenticActionPending] = useState(false);
  const [agenticReviewIntent, setAgenticReviewIntent] = useState<'approved' | 'rejected' | null>(null);
  const [mediaAssets, setMediaAssets] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();
  const dialog = useDialog();

  const categoryLookups = useMemo(() => buildItemCategoryLookups(), []);

  const { unter: unterCategoryLookup } = categoryLookups;

  const langtextRows = useMemo<[string, React.ReactNode][]>(() => {
    if (!item) {
      return [];
    }

    const parsed = parseLangtext(item.Langtext ?? '');
    if (parsed.kind === 'json') {
      if (parsed.entries.length === 0) {
        return [];
      }

      return parsed.entries.map<[string, React.ReactNode]>((entry) => {
        const trimmedValue = entry.value.trim();
        if (!trimmedValue) {
          return [entry.key, null];
        }

        try {
          const rendered = buildLangtextMarkdown(entry.value);
          if (rendered) {
            return [entry.key, rendered];
          }
          return [entry.key, entry.value];
        } catch (error) {
          console.error('ItemDetail: Failed to render Langtext JSON markdown', {
            error,
            key: entry.key
          });
          return [entry.key, entry.value];
        }
      });
    }

    const legacyText = parsed.text;
    if (!legacyText || !legacyText.trim()) {
      return [];
    }

    try {
      const rendered = buildLangtextMarkdown(legacyText);
      if (!rendered) {
        return [];
      }
      return [['Langtext', rendered]];
    } catch (error) {
      console.error('ItemDetail: Failed to render Langtext markdown', {
        error,
        value: legacyText
      });
      return [['Langtext', legacyText]];
    }
  }, [item?.Langtext]);

  const resolveUnterkategorieLabel = useCallback(
    (code?: number | null): React.ReactNode => {
      if (typeof code !== 'number' || Number.isNaN(code)) {
        return null;
      }

      const subCategory = unterCategoryLookup.get(code);
      if (!subCategory) {
        console.warn('Missing Unterkategorie mapping for item detail view', { code });
        return `Unbekannte Unterkategorie (${code})`;
      }

      const label = humanizeCategoryLabel(subCategory.label);
      const parentLabel = humanizeCategoryLabel(subCategory.parentLabel);

      return (
        <span className="details-category" aria-label={`${parentLabel} > ${label} (${subCategory.code})`}>
          <span className="details-category__name">
            {parentLabel ? `${parentLabel} – ${label}` : label}
          </span>
          <span className="details-category__code">({subCategory.code})</span>
        </span>
      );
    },
    [unterCategoryLookup]
  );

  // TODO: Replace client-side slicing once the activities page provides pagination.
  const displayedEvents = useMemo(() => events.slice(0, 5), [events]);

  // TODO: Revisit optional category rendering once backend schema clarifies optional Haupt-/Unterkategorien fields.
  const detailRows = useMemo<[string, React.ReactNode][]>(() => {
    if (!item) {
      return [];
    }

    const creator = resolveActorName(events.length ? events[events.length - 1].Actor : null);

    const createdDisplay = item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : null;
    let updatedDisplay: React.ReactNode = null;
    if (item.UpdatedAt) {
      let showUpdated = true;
      if (item.Datum_erfasst) {
        try {
          const createdTime = Date.parse(String(item.Datum_erfasst));
          const updatedTime = Date.parse(String(item.UpdatedAt));
          if (!Number.isNaN(createdTime) && !Number.isNaN(updatedTime)) {
            showUpdated = updatedTime !== createdTime;
          } else if (item.Datum_erfasst === item.UpdatedAt) {
            showUpdated = false;
          }
        } catch (error) {
          console.warn('ItemDetail: Failed to compare timestamps', {
            created: item.Datum_erfasst,
            updated: item.UpdatedAt,
            error
          });
        }
      }
      if (showUpdated) {
        updatedDisplay = formatDateTime(item.UpdatedAt);
      }
    }

    const rows: [string, React.ReactNode][] = [
      ['Erstellt von', creator],
      ['Artikelbeschreibung', item.Artikelbeschreibung ?? null],
      ['Artikelnummer', item.Artikel_Nummer ?? null],
      ['Anzahl', item.Auf_Lager ?? null],
      [
        'Behälter',
        item.BoxID ? <Link to={`/boxes/${encodeURIComponent(String(item.BoxID))}`}>{item.BoxID}</Link> : null
      ],
      ['Kurzbeschreibung', item.Kurzbeschreibung ?? null],
      ['Unterkategorie A', resolveUnterkategorieLabel(item.Unterkategorien_A)]
    ];

    const unterkategorieB = resolveUnterkategorieLabel(item.Unterkategorien_B);
    if (unterkategorieB !== null) {
      rows.push(['Unterkategorie B', unterkategorieB]);
    }

    rows.push(
      ['Erfasst am', item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : null],
      ['Aktualisiert am', item.UpdatedAt ? formatDateTime(item.UpdatedAt) : null],
      ['Verkaufspreis', item.Verkaufspreis ?? null]
    );

    if (langtextRows.length > 0) {
      rows.push(...langtextRows);
    }

    rows.push(
      ['Hersteller', item.Hersteller ?? null],
      ['Länge (mm)', item.Länge_mm ?? null],
      ['Breite (mm)', item.Breite_mm ?? null],
      ['Höhe (mm)', item.Höhe_mm ?? null],
      ['Gewicht (kg)', item.Gewicht_kg ?? null],
      ['Einheit', resolveDetailEinheit(item.Einheit)]
    );

    return rows;
  }, [events, item, langtextRows, resolveUnterkategorieLabel]);

  const latestAgenticReviewNote = useMemo(() => {
    let latestNote: string | null = null;
    let latestTimestamp = -Infinity;

    for (const ev of events) {
      if (ev.Event !== 'AgenticReviewApproved' && ev.Event !== 'AgenticReviewRejected') {
        continue;
      }
      const rawMeta = typeof ev.Meta === 'string' ? ev.Meta.trim() : '';
      if (!rawMeta) {
        continue;
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(rawMeta);
      } catch (parseError) {
        console.error('Failed to parse agentic review meta for note display', parseError);
        continue;
      }

      const candidate = typeof parsed.notes === 'string' ? parsed.notes.trim() : '';
      if (!candidate) {
        continue;
      }

      const createdAt = Date.parse(ev.CreatedAt);
      const timestamp = Number.isNaN(createdAt) ? Date.now() : createdAt;
      if (timestamp >= latestTimestamp) {
        latestTimestamp = timestamp;
        latestNote = candidate;
      }
    }

    return latestNote;
  }, [events]);

  const agenticRows: [string, React.ReactNode][] = [];
  if (agentic?.SearchQuery) {
    agenticRows.push(['Suchbegriff', agentic.SearchQuery]);
  }
  if (agentic?.LastModified) {
    agenticRows.push(['Zuletzt aktualisiert', formatDateTime(agentic.LastModified)]);
  }
  if (typeof agentic?.RetryCount === 'number') {
    agenticRows.push(['Anzahl Versuche', agentic.RetryCount]);
  }
  if (agentic?.LastAttemptAt) {
    agenticRows.push(['Letzter Versuch', formatDateTime(agentic.LastAttemptAt)]);
  }
  if (agentic?.NextRetryAt) {
    agenticRows.push(['Nächster Versuch geplant', formatDateTime(agentic.NextRetryAt)]);
  }
  if (agentic?.LastError) {
    agenticRows.push(['Letzter Fehler', agentic.LastError]);
  }
  if (agentic?.ReviewState) {
    const reviewStateNormalized = agentic.ReviewState.toLowerCase();
    let reviewLabel = 'Nicht erforderlich';
    if (reviewStateNormalized === 'pending') reviewLabel = 'Ausstehend';
    else if (reviewStateNormalized === 'approved') reviewLabel = 'Freigegeben';
    else if (reviewStateNormalized === 'rejected') reviewLabel = 'Abgelehnt';
    else if (reviewStateNormalized && reviewStateNormalized !== 'not_required') {
      reviewLabel = agentic.ReviewState;
    }
    agenticRows.push(['Review-Status', reviewLabel]);
  }
  if (agentic?.ReviewedBy) {
    agenticRows.push(['Geprüft von', agentic.ReviewedBy]);
  }
  if (latestAgenticReviewNote) {
    agenticRows.push(['Kommentar', latestAgenticReviewNote]);
  }

  const load = useCallback(async ({ showSpinner = false }: { showSpinner?: boolean } = {}) => {
    if (showSpinner) {
      setIsLoading(true);
    }
    setLoadError(null);
    console.info('Loading item details', { itemId, showSpinner });
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
        setEvents(Array.isArray(data.events) ? filterAllowedEvents(data.events) : []);
        setAgentic(data.agentic ?? null);
        const media = Array.isArray(data.media)
          ? data.media.filter((src: unknown): src is string => typeof src === 'string' && src.trim() !== '')
          : [];
        setMediaAssets(media);
        setAgenticError(null);
        setAgenticReviewIntent(null);
        setLoadError(null);
      } else {
        console.error('Failed to fetch item', res.status);
        setItem(null);
        setEvents([]);
        setAgentic(null);
        setAgenticError('Ki-Status konnte nicht geladen werden.');
        setMediaAssets([]);
        setAgenticReviewIntent(null);
        setLoadError(res.status === 404 ? 'Artikel wurde nicht gefunden.' : 'Artikel konnte nicht geladen werden.');
      }
    } catch (err) {
      console.error('Failed to fetch item', err);
      setItem(null);
      setEvents([]);
      setAgentic(null);
      setAgenticError('Ki-Status konnte nicht geladen werden.');
      setMediaAssets([]);
      setAgenticReviewIntent(null);
      setLoadError('Artikel konnte nicht geladen werden.');
    } finally {
      if (showSpinner) {
        setIsLoading(false);
      }
    }
  }, [itemId]);

  useEffect(() => {
    void load({ showSpinner: true });
  }, [load]);

  if (isLoading) {
    return <LoadingPage message="Artikel wird geladen…" />;
  }

  if (loadError && !item) {
    // TODO: Replace basic retry UI with shared error boundary once available.
    return (
      <div className="container item">
        <div className="grid landing-grid">
          <div className="card">
            <h2>Fehler beim Laden</h2>
            <p className="muted">{loadError}</p>
            <div className='row'>
              <button type="button" className="btn" onClick={() => void load({ showSpinner: true })}>
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const normalizedAgenticStatus = agentic ? normalizeAgenticRunStatus(agentic.Status) : null;
  const normalizedAgenticReview = agentic ? (agentic.ReviewState || '').trim().toLowerCase() : null;
  const agenticNeedsReview = Boolean(
    normalizedAgenticStatus === AGENTIC_RUN_STATUS_REVIEW || normalizedAgenticReview === 'pending'
  );
  const agenticCanRestart = normalizedAgenticStatus
    ? AGENTIC_RUN_RESTARTABLE_STATUSES.has(normalizedAgenticStatus)
    : false;
  const agenticCanStart = normalizedAgenticStatus === AGENTIC_RUN_STATUS_NOT_STARTED;
  const agenticCanCancel = normalizedAgenticStatus
    ? AGENTIC_RUN_ACTIVE_STATUSES.has(normalizedAgenticStatus)
    : false;

  async function promptAgenticReviewNote(
    decision: 'approved' | 'rejected'
  ): Promise<string | null> {
    while (true) {
      let promptResult: string | null;
      try {
        promptResult = await dialogService.prompt({
          title: 'Review-Notiz',
          message:
            decision === 'approved'
              ? 'Bitte eine Notiz für die Freigabe hinzufügen (optional).'
              : 'Bitte eine Notiz für die Ablehnung hinzufügen (optional).',
          confirmLabel: 'Speichern',
          cancelLabel: 'Ohne Notiz',
          placeholder: 'Notiz (optional)',
          defaultValue: ''
        });
      } catch (error) {
        console.error('Failed to prompt for agentic review note', error);
        return null;
      }

      if (promptResult === null) {
        return '';
      }

      const trimmed = promptResult.trim();
      if (trimmed.length === 0) {
        let proceedWithoutNote = false;
        try {
          proceedWithoutNote = await dialogService.confirm({
            title: 'Leere Notiz',
            message: 'Ohne Notiz fortfahren?',
            confirmLabel: 'Ohne Notiz',
            cancelLabel: 'Zurück'
          });
        } catch (error) {
          console.error('Failed to confirm empty agentic review note', error);
          return null;
        }

        if (proceedWithoutNote) {
          return '';
        }

        continue;
      }

      return trimmed;
    }
  }

  

  async function handleAgenticReview(decision: 'approved' | 'rejected') {
    if (!agentic) return;
    const actor = await ensureUser();
    if (!actor) {
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display agentic review user alert', error);
      }
      return;
    }
    const confirmMessage =
      decision === 'approved'
        ? 'Agentisches Ergebnis freigeben?'
        : 'Agentisches Ergebnis ablehnen?';
    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Review bestätigen',
        message: confirmMessage,
        confirmLabel: decision === 'approved' ? 'Freigeben' : 'Ablehnen',
        cancelLabel: 'Abbrechen'
      });
    } catch (error) {
      console.error('Failed to confirm agentic review decision', error);
      return;
    }

    if (!confirmed) {
      return;
    }

    const noteInput = await promptAgenticReviewNote(decision);
    if (noteInput === null) {
      return;
    }
    setAgenticActionPending(true);
    setAgenticError(null);
    setAgenticReviewIntent(decision);
    try {
      const res = await fetch(
        `/api/items/${encodeURIComponent(agentic.ItemUUID)}/agentic/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor, decision, notes: noteInput })
        }
      );
      if (res.ok) {
        const data = await res.json();
        setAgentic(data.agentic ?? null);
        setAgenticError(null);
      } else {
        console.error('Agentic review update failed', res.status);
        setAgenticError('Review konnte nicht gespeichert werden.');
      }
    } catch (err) {
      console.error('Agentic review request failed', err);
      setAgenticError('Review-Anfrage fehlgeschlagen.');
    } finally {
      setAgenticReviewIntent(null);
      setAgenticActionPending(false);
    }
  }

  async function handleAgenticRestart() {
    if (!item) {
      console.warn('Agentic restart requested without loaded item data');
      setAgenticError('Artikel konnte nicht geladen werden.');
      return;
    }

    const actor = await ensureUser();
    if (!actor) {
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display agentic restart user alert', error);
      }
      return;
    }

    const baseSearchTerm = (agentic?.SearchQuery || item.Artikelbeschreibung || '').trim();

    const restartRequestPayload = buildAgenticRestartRequestPayload({
      actor,
      search: baseSearchTerm,
      reviewDecision: agentic?.LastReviewDecision ?? null,
      reviewNotes: agentic?.LastReviewNotes ?? null,
      reviewedBy: agentic?.ReviewedBy ?? null
    });

    setAgenticActionPending(true);
    setAgenticError(null);
    setAgenticReviewIntent(null);

    try {
      const restartResponse = await fetch(
        `/api/items/${encodeURIComponent(item.ItemUUID)}/agentic/restart`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(restartRequestPayload)
        }
      );

      if (!restartResponse.ok) {
        console.error('Agentic restart failed', restartResponse.status);
        setAgenticError('Ki-Neustart fehlgeschlagen.');
        return;
      }

      const body = await restartResponse
        .json()
        .catch((err) => {
          console.error('Failed to parse agentic restart response', err);
          return null;
        });

      const refreshedRun: AgenticRun | null = body?.agentic ?? null;
      setAgentic(refreshedRun);

      if (!refreshedRun) {
        console.warn('Agentic restart succeeded without returning a run');
        setAgenticError('Ki-Neustart lieferte keine Daten.');
        return;
      }

      const searchTerm =
        (refreshedRun.SearchQuery ?? '').trim() ||
        baseSearchTerm ||
        item.Artikelbeschreibung ||
        '';
      if (!searchTerm) {
        console.warn('Agentic restart skipped: missing search term');
        setAgenticError('Ki-Neustart konnte nicht ausgelöst werden (fehlender Suchbegriff).');
        return;
      }
      const triggerPayload: AgenticRunTriggerPayload = {
        itemId: refreshedRun.ItemUUID || item.ItemUUID,
        artikelbeschreibung: searchTerm
      };
      const reviewForTrigger = {
        decision: refreshedRun.LastReviewDecision ?? agentic?.LastReviewDecision ?? null,
        notes: refreshedRun.LastReviewNotes ?? agentic?.LastReviewNotes ?? null,
        reviewedBy: refreshedRun.ReviewedBy ?? agentic?.ReviewedBy ?? null
      };
      if (
        (reviewForTrigger.decision && reviewForTrigger.decision.trim()) ||
        (reviewForTrigger.notes && reviewForTrigger.notes.trim()) ||
        (reviewForTrigger.reviewedBy && reviewForTrigger.reviewedBy.trim())
      ) {
        triggerPayload.review = reviewForTrigger;
      }
      const triggerResult = await triggerAgenticRun({
        payload: triggerPayload,
        context: 'item detail restart'
      });
      if (triggerResult.outcome !== 'triggered') {
        console.warn('Agentic restart did not trigger run; auto-cancelling', triggerResult);
        let failureReasonCode: string | null = null;
        if (triggerResult.outcome === 'skipped') {
          failureReasonCode = triggerResult.reason;
        } else if (triggerResult.outcome === 'failed') {
          failureReasonCode =
            extractAgenticFailureReason(triggerResult.error) ?? triggerResult.reason ?? null;
          if (!failureReasonCode && typeof triggerResult.status === 'number' && triggerResult.status === 0) {
            failureReasonCode = 'network-error';
          }
        }
        const failureReasonDescription = describeAgenticFailureReason(failureReasonCode);
        const cancelResult = await persistAgenticRunCancellation({
          itemId: refreshedRun.ItemUUID || item.ItemUUID,
          actor,
          context: 'item detail restart auto-cancel'
        });
        if (cancelResult.ok && cancelResult.agentic) {
          setAgentic(cancelResult.agentic);
        }
        const baseMessage =
          triggerResult.outcome === 'skipped'
            ? 'Ki-Neustart konnte nicht gestartet werden (fehlende Angaben).'
            : 'Ki-Neustart konnte nicht gestartet werden. Durchlauf wurde abgebrochen.';
        const detailedMessage = failureReasonDescription
          ? `${baseMessage} (Grund: ${failureReasonDescription})`
          : baseMessage;
        if (!cancelResult.ok) {
          setAgenticError(`${detailedMessage} (Abbruch konnte nicht gespeichert werden.)`);
        } else {
          setAgenticError(detailedMessage);
        }
        return;
      }
    } catch (err) {
      console.error('Ki-Neustart request failed', err);
      setAgenticError('Ki-Neustart fehlgeschlagen.');
    } finally {
      setAgenticReviewIntent(null);
      setAgenticActionPending(false);
    }
  }

  async function handleAgenticCancel() {
    if (!agentic) {
      console.warn('Agentic cancel requested without run data');
      setAgenticError('Kein agentischer Durchlauf vorhanden.');
      return;
    }

    const actor = await ensureUser();
    if (!actor) {
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display agentic cancel user alert', error);
      }
      return;
    }

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Agentischen Durchlauf abbrechen',
        message: 'Agentischen Durchlauf abbrechen?',
        confirmLabel: 'Abbrechen',
        cancelLabel: 'Zurück'
      });
    } catch (error) {
      console.error('Failed to confirm agentic cancellation', error);
      return;
    }

    if (!confirmed) {
      return;
    }

    console.info('Agentic action cancellation requested', agentic.ItemUUID);

    setAgenticActionPending(true);
    setAgenticReviewIntent(null);
    setAgenticError(null);

    const { updatedRun, error: finalError } = await performItemDetailAgenticCancel({
      agentic,
      actor,
      persistCancellation: persistAgenticRunCancellation,
      logger: console
    });

    if (updatedRun) {
      setAgentic(updatedRun);
    }
    setAgenticReviewIntent(null);
    setAgenticError(finalError);
    setAgenticActionPending(false);
  }

  const agenticStatus = agenticStatusDisplay(agentic);
  const agenticIsInProgress = isAgenticRunInProgress(agentic);

  async function handleDelete() {
    if (!item) return;
    let confirmed = false;
    const actor = await ensureUser();
    if (!actor) {
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display agentic cancel user alert', error);
      }
      return;
    }
    try {
      confirmed = await dialogService.confirm({
        title: 'Artikel löschen',
        message: 'Item wirklich löschen?',
        confirmLabel: 'Löschen',
        cancelLabel: 'Abbrechen'
      });
    } catch (error) {
      console.error('Failed to confirm item deletion', error);
      return;
    }

    if (!confirmed) {
      return;
    }
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor, confirm: true })
      });
      if (res.ok) {
        if (item.BoxID) {
          navigate(`/boxes/${encodeURIComponent(String(item.BoxID))}`);
        } else {
          navigate('/');
        }
      } else {
        console.error('Failed to delete item', res.status);
      }
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  }

  return (
    <div className="container item">
      <div className="grid landing-grid">
        {item ? (
          <>
            <div className="card">
              <h2>Artikel <span className="muted">({item.ItemUUID})</span></h2>
              <section className="item-media-section">
                <h3>Medien</h3>
                <ItemMediaGallery
                  itemId={item.ItemUUID}
                  grafikname={item.Grafikname}
                  mediaAssets={mediaAssets}
                />
              </section>
              <div className='row'>
                <table className="details">
                  <tbody>
                    {detailRows.map(([k, v], idx) => {
                      const cell = normalizeDetailValue(v);
                      return (
                        <tr key={`${k}-${idx}`} className="responsive-row">
                          <th className="responsive-th">{k}</th>
                          <td className={`responsive-td${cell.isPlaceholder ? ' is-placeholder' : ''}`}>
                            {cell.content}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className='row'>
                <button type="button" className="btn" onClick={() => navigate(`/items/${encodeURIComponent(item.ItemUUID)}/edit`)}>Bearbeiten</button>
                <button type="button" className="btn" onClick={async () => {
                  let confirmed = false;
                  const actor = await ensureUser();
                  if (!actor) {
                    try {
                      await dialogService.alert({
                        title: 'Aktion nicht möglich',
                        message: 'Bitte zuerst oben den Benutzer setzen.'
                      });
                    } catch (error) {
                      console.error('Failed to display agentic cancel user alert', error);
                    }
                    return;
                  }
                  try {
                    confirmed = await dialogService.confirm({
                      title: 'Artikel entnehmen',
                      message: 'Entnehmen?',
                      confirmLabel: 'Entnehmen',
                      cancelLabel: 'Abbrechen'
                    });
                  } catch (error) {
                    console.error('Failed to confirm inline item removal', error);
                    return;
                  }
                  try {
                    const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/remove`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ actor })
                    });
                    if (res.ok) {
                      const j = await res.json();
                      setItem({ ...item, Auf_Lager: j.quantity, BoxID: j.boxId });
                      console.log('Item entnommen', item.ItemUUID);
                    } else {
                      console.error('Failed to remove item', res.status);
                    }
                  } catch (err) {
                    console.error('Entnahme fehlgeschlagen', err);
                  }
                }}
                >
                  Entnehmen
                </button>
                <button type="button" className="btn danger" onClick={handleDelete}>Löschen</button>
              </div>
            </div>

            <AgenticStatusCard
              status={agenticStatus}
              rows={agenticRows}
              actionPending={agenticActionPending}
              reviewIntent={agenticReviewIntent}
              error={agenticError}
              needsReview={agenticNeedsReview}
              canCancel={agenticCanCancel}
              canStart={agenticCanStart}
              canRestart={agenticCanRestart}
              isInProgress={agenticIsInProgress}
              onRestart={handleAgenticRestart}
              onReview={handleAgenticReview}
              onCancel={handleAgenticCancel}
            />

            <RelocateItemCard itemId={item.ItemUUID} onRelocated={() => load({ showSpinner: false })} />

            <PrintLabelButton itemId={item.ItemUUID} />

            <div className="card">
              <h3>Aktivitäten</h3>
              <ul className="events">
                {displayedEvents.map((ev) => (
                  <li key={ev.Id}>
                    <span className="muted">[{formatDateTime(ev.CreatedAt)}]</span>{' '}
                    {resolveActorName(ev.Actor)}{': ' + eventLabel(ev.Event)}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className="muted">Artikel steht nicht zur Verfügung.</p>
        )}
      </div>
    </div>
  );
}
