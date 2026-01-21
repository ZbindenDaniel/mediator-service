import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateItemCard from './RelocateItemCard';
// TODO(agent): Validate instance navigation UX once instance detail reload behavior is reviewed.
// TODO(agent): Align default relocation hints with backend-provided data to avoid drift from canonical locations.
// TODO(agent): Confirm instance inventory ordering requirements once detail UI feedback arrives.
// TODO(agentic-run-delete): Validate the agentic deletion UX against backend guarantees once the reset API stabilizes.
// TODO(agentic-close): Confirm close action copy and endpoint payload once backend wiring lands.
// TODO(agentic-edit-lock): Confirm messaging for edit restrictions while agentic runs are active.
import type { Item, EventLog, AgenticRun, ItemDetailResponse, ItemInstanceSummary } from '../../../models';
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
  AGENTIC_RUN_STATUSES,
  AGENTIC_RUN_TERMINAL_STATUSES,
  ItemEinheit,
  isItemEinheit,
  normalizeItemEinheit,
  normalizeAgenticRunStatus
} from '../../../models';
import { describeQuality, QUALITY_DEFAULT } from '../../../models/quality';
import { formatDateTime } from '../lib/format';
import { ensureUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';
import { filterVisibleEvents } from '../utils/eventLogTopics';
import { buildItemCategoryLookups } from '../lib/categoryLookup';
import {
  describeAgenticFailureReason,
  extractAgenticFailureReason,
  persistAgenticRunClose,
  persistAgenticRunCancellation,
  persistAgenticRunDeletion,
  triggerAgenticRun
} from '../lib/agentic';
import { parseLangtext } from '../lib/langtext';
import {
  buildItemListQueryParams,
  getDefaultItemListFilters,
  loadItemListFilters
} from '../lib/itemListFiltersStorage';
import { logger, logError } from '../utils/logger';
import { filterAndSortItems } from './ItemListPage';

// TODO(agentic-start-flow): Consolidate agentic start and restart handling into a shared helper once UI confirms the UX.

// TODO(agentic-failure-reason): Ensure agentic restart errors expose backend reasons in UI.
// TODO(markdown-langtext): Extract markdown rendering into a shared component when additional fields use Markdown content.
import type { AgenticRunTriggerPayload } from '../lib/agentic';
import ItemMediaGallery from './ItemMediaGallery';
import { dialogService, useDialog } from './dialog';
import LoadingPage from './LoadingPage';
import QualityBadge from './QualityBadge';

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
const ITEM_LIST_DEFAULT_FILTERS = getDefaultItemListFilters();

// TODO(agent): Validate the reference vs. instance row grouping once product owners review the split detail cards.
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

// TODO(agent): Confirm quantity row hiding behavior stays aligned with bulk item expectations.
function resolveQuantityEinheit(value: unknown, itemId: string): ItemEinheit | null {
  try {
    const normalized = normalizeItemEinheit(value);
    if (!normalized) {
      logger.warn?.('ItemDetail: Einheit missing or invalid; hiding quantity row.', {
        itemId,
        provided: value
      });
      return null;
    }
    return normalized;
  } catch (error) {
    logError('ItemDetail: Failed to normalize Einheit for quantity row', error, {
      itemId,
      provided: value
    });
    return null;
  }
}

export interface AgenticStatusCardProps {
  status: AgenticStatusDisplay;
  rows: [string, React.ReactNode][];
  actionPending: boolean;
  reviewIntent: 'approved' | 'rejected' | null;
  error: string | null;
  needsReview: boolean;
  searchTerm?: string;
  searchTermError?: string | null;
  onSearchTermChange?: (value: string) => void;
  canCancel: boolean;
  canClose: boolean;
  canStart: boolean;
  canRestart: boolean;
  canDelete: boolean;
  isInProgress: boolean;
  startLabel?: string;
  onStart?: () => void | Promise<void>;
  onRestart: () => void | Promise<void>;
  onReview: (decision: 'approved' | 'rejected') => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onClose?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
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
  searchTerm,
  searchTermError,
  onSearchTermChange,
  canCancel,
  canClose,
  canStart,
  canRestart,
  canDelete,
  isInProgress,
  startLabel,
  onStart,
  onRestart,
  onReview,
  onCancel,
  onClose,
  onDelete
}: AgenticStatusCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const contentId = useMemo(() => `agentic-status-panel-${Math.random().toString(36).slice(2)}`, []);
  const startHandler = onStart ?? onRestart;
  const startText = typeof startLabel === 'string' && startLabel.trim() ? startLabel : 'Starten';
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
          {!needsReview && (canStart || canRestart) ? (
            <div className="row">
              <label className="agentic-status-card__search" htmlFor={`${contentId}-search`}>
                Suchbegriff
                <input
                  id={`${contentId}-search`}
                  type="text"
                  value={searchTerm ?? ''}
                  onChange={(event) => onSearchTermChange?.(event.target.value)}
                  disabled={actionPending}
                />
              </label>
              {searchTermError ? (
                <p className="muted" style={{ color: '#a30000' }}>{searchTermError}</p>
              ) : null}
            </div>
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
          {canClose && onClose ? (
            <div className='row'>
              <button type="button" className="btn" disabled={actionPending} onClick={onClose}>
                Ki Suche abschliessen
              </button>
            </div>
          ) : null}
          {!needsReview && (canStart || canRestart) ? (
            <div className='row'>
              {canStart && startHandler ? (
                <button type="button" className="btn" disabled={actionPending} onClick={startHandler}>
                  {startText}
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
          {canDelete && onDelete ? (
            <div className='row'>
              <button type="button" className="btn danger" disabled={actionPending} onClick={onDelete}>
                Lauf löschen
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
      description: 'Es liegen keine KI Ergebnisse vor.',
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
        description: 'Der KI Durchlauf wurde noch nicht gestartet.',
        variant: 'info',
        needsReviewBadge: false,
        isTerminal: true
      };
      break;
    case AGENTIC_RUN_STATUS_FAILED:
      base = {
        label: 'Fehlgeschlagen',
        description: 'Der KI Durchlauf ist fehlgeschlagen.',
        variant: 'error',
        needsReviewBadge: false,
        isTerminal: true
      };
      break;
    case AGENTIC_RUN_STATUS_RUNNING:
      base = {
        label: 'In Arbeit',
        description: 'Der KI Durchlauf läuft derzeit.',
        variant: 'info',
        needsReviewBadge: false,
        isTerminal: false
      };
      break;
    case AGENTIC_RUN_STATUS_QUEUED:
      base = {
        label: 'Wartet',
        description: 'Der KI Durchlauf wartet auf Ausführung.',
        variant: 'pending',
        needsReviewBadge: false,
        isTerminal: false
      };
      break;
    case AGENTIC_RUN_STATUS_CANCELLED:
      base = {
        label: 'Abgebrochen',
        description: 'Der KI Durchlauf wurde abgebrochen.',
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

function resolveAgenticSearchTerm(run: AgenticRun | null, item: Item | null): string {
  try {
    const candidates = [run?.SearchQuery, item?.Artikelbeschreibung, item?.Artikel_Nummer];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  } catch (error) {
    console.error('Failed to resolve agentic search term', error);
  }

  return '';
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
  // TODO(agentic-search-term): Align editable agentic search term handling with backend suggestions once available.
  const [agenticSearchTerm, setAgenticSearchTerm] = useState<string>('');
  const [agenticSearchError, setAgenticSearchError] = useState<string | null>(null);
  const [mediaAssets, setMediaAssets] = useState<string[]>([]);
  const [instances, setInstances] = useState<ItemInstanceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [neighborIds, setNeighborIds] = useState<{ previousId: string | null; nextId: string | null }>({
    previousId: null,
    nextId: null
  });
  const [neighborsLoading, setNeighborsLoading] = useState(false);
  const [neighborSource, setNeighborSource] = useState<'query' | 'fetch' | 'storage' | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dialog = useDialog();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const categoryLookups = useMemo(() => buildItemCategoryLookups(), []);

  const qualitySummary = useMemo(() => describeQuality(item?.Quality ?? QUALITY_DEFAULT), [item?.Quality]);

  const { unter: unterCategoryLookup } = categoryLookups;

  const neighborContext = useMemo(() => {
    // TODO(filter-aware-navigation): Validate filter-aware neighbor resolution against list pagination once it lands.
    // TODO(navigation-context): Move adjacent navigation derivation into a shared list-aware provider once pagination is available.
    const normalized = {
      previousId: null as string | null,
      nextId: null as string | null,
      source: null as 'query' | null
    };

    const sequenceParam = searchParams.get('ids');
    if (sequenceParam) {
      const sequence = sequenceParam
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const currentIndex = sequence.indexOf(itemId);
      if (currentIndex >= 0) {
        normalized.previousId = sequence[currentIndex - 1] ?? null;
        normalized.nextId = sequence[currentIndex + 1] ?? null;
        normalized.source = 'query';
        return normalized;
      }
    }

    const previousParam = searchParams.get('prev');
    const nextParam = searchParams.get('next');
    if ((previousParam && previousParam.trim()) || (nextParam && nextParam.trim())) {
      normalized.previousId = previousParam?.trim() || null;
      normalized.nextId = nextParam?.trim() || null;
      normalized.source = 'query';
    }

    return normalized;
  }, [itemId, searchParams]);

  useEffect(() => {
    let cancelled = false;

    setNeighborSource(neighborContext.source);
    setNeighborIds({ previousId: neighborContext.previousId, nextId: neighborContext.nextId });

    const shouldFetchNeighbors = neighborContext.source !== 'query'
      || !neighborContext.previousId
      || !neighborContext.nextId;

    if (!shouldFetchNeighbors) {
      return undefined;
    }

    const fetchNeighbors = async () => {
      setNeighborsLoading(true);
      const storedFilters = neighborContext.source !== 'query'
        ? loadItemListFilters(ITEM_LIST_DEFAULT_FILTERS, logger)
        : null;
      const effectiveFilters = storedFilters ?? ITEM_LIST_DEFAULT_FILTERS;
      const resolvedSource = storedFilters ? 'storage' : 'fetch';

      try {
        logger.info?.('ItemDetail: Fetching adjacent items', {
          itemId,
          source: neighborContext.source ?? resolvedSource
        });
      } catch (logError) {
        console.error('ItemDetail: Failed to log adjacent fetch start', logError);
      }

      try {
        const query = buildItemListQueryParams(effectiveFilters);
        const response = await fetch(`/api/items?${query.toString()}`);
        if (!response.ok) {
          if (!cancelled) {
            console.error('ItemDetail: Failed to fetch filtered items', response.status);
          }
          try {
            const problem = await response.json();
            if (!cancelled) {
              console.error('ItemDetail: Filtered items fetch returned error payload', problem);
            }
          } catch (jsonErr) {
            if (!cancelled) {
              console.error('ItemDetail: Failed to parse filtered items error response', jsonErr);
            }
          }
          return;
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        const items: Item[] = Array.isArray(data.items) ? data.items : [];
        const filtered = filterAndSortItems({
          items,
          showUnplaced: effectiveFilters.showUnplaced,
          normalizedSearch: effectiveFilters.searchTerm.trim().toLowerCase(),
          normalizedSubcategoryFilter: effectiveFilters.subcategoryFilter.trim().toLowerCase(),
          normalizedBoxFilter: effectiveFilters.boxFilter.trim().toLowerCase(),
          stockFilter: 'any',
          normalizedAgenticFilter: effectiveFilters.agenticStatusFilter === 'any'
            ? null
            : effectiveFilters.agenticStatusFilter,
          sortKey: effectiveFilters.sortKey,
          sortDirection: effectiveFilters.sortDirection,
          qualityThreshold: effectiveFilters.qualityThreshold
        });

        const currentIndex = filtered.findIndex((entry) => entry.summary.representativeItemId === itemId);
        if (currentIndex === -1) {
          logger.warn?.('ItemDetail: Current item missing from filtered list', {
            itemId,
            total: filtered.length,
            source: resolvedSource
          });
        }

        const fetchedPrevious = currentIndex > 0 ? filtered[currentIndex - 1]?.summary.representativeItemId ?? null : null;
        const fetchedNext = currentIndex >= 0 ? filtered[currentIndex + 1]?.summary.representativeItemId ?? null : null;

        setNeighborIds({
          previousId: neighborContext.previousId ?? fetchedPrevious,
          nextId: neighborContext.nextId ?? fetchedNext
        });
        setNeighborSource(neighborContext.source ?? resolvedSource);
      } catch (error) {
        if (!cancelled) {
          logError('ItemDetail: Failed to load filtered adjacent items', error, { itemId });
        }
      } finally {
        if (!cancelled) {
          setNeighborsLoading(false);
        }
      }
    };

    void fetchNeighbors();

    return () => {
      cancelled = true;
    };
  }, [itemId, neighborContext]);

  useEffect(() => {
    try {
      const resolved = resolveAgenticSearchTerm(agentic, item);
      setAgenticSearchTerm((prev) => {
        if (prev && prev.trim()) {
          return prev;
        }
        return resolved;
      });
    } catch (error) {
      console.error('ItemDetail: Failed to sync agentic search term state', error);
    }
  }, [agentic, item]);

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

  const handleNeighborNavigation = useCallback(
    (direction: 'previous' | 'next') => {
      const targetId = direction === 'previous' ? neighborIds.previousId : neighborIds.nextId;
      if (!targetId) {
        console.warn('ItemDetail: Neighbor navigation attempted without target', { direction, itemId });
        return;
      }

      try {
        console.info('ItemDetail: Navigating to neighbor item', {
          direction,
          targetId,
          itemId,
          source: neighborSource
        });
      } catch (logError) {
        console.error('ItemDetail: Failed to log neighbor navigation', logError);
      }

      const search = window.location.search || '';
      navigate(`/items/${encodeURIComponent(targetId)}${search}`);
    },
    [itemId, navigate, neighborIds.nextId, neighborIds.previousId, neighborSource]
  );

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const start = touchStartRef.current;
      const touch = event.changedTouches[0];
      touchStartRef.current = null;

      if (!start || !touch) {
        return;
      }

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;

      if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) {
        return;
      }

      if (deltaX > 0 && neighborIds.previousId) {
        handleNeighborNavigation('previous');
      } else if (deltaX < 0 && neighborIds.nextId) {
        handleNeighborNavigation('next');
      }
    },
    [handleNeighborNavigation, neighborIds.nextId, neighborIds.previousId]
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
        return;
      }

      if (event.key === 'ArrowLeft' && neighborIds.previousId) {
        event.preventDefault();
        handleNeighborNavigation('previous');
      } else if (event.key === 'ArrowRight' && neighborIds.nextId) {
        event.preventDefault();
        handleNeighborNavigation('next');
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleNeighborNavigation, neighborIds.nextId, neighborIds.previousId]);

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
      // ['Erstellt von', creator],
      ['ItemUUID', item.ItemUUID ?? null],
      ['Artikelbeschreibung', item.Artikelbeschreibung ?? null],
      ['Artikelnummer', item.Artikel_Nummer ?? null],
      [
        'Behälter',
        item.BoxID ? <Link to={`/boxes/${encodeURIComponent(String(item.BoxID))}`}>{item.BoxID}</Link> : null
      ],
      ['Kurzbeschreibung', item.Kurzbeschreibung ?? null],
      ['Kategorie', resolveUnterkategorieLabel(item.Unterkategorien_A)],
      ['Qualität', qualitySummary.label],
      ['Ki Status', agenticStatusDisplay(agentic).label]
    ];

    const quantityEinheit = resolveQuantityEinheit(item.Einheit, item.ItemUUID);
    if (quantityEinheit === ItemEinheit.Menge) {
      rows.push(['Menge', item.Auf_Lager ?? null]);
    }

    const unterkategorieB = resolveUnterkategorieLabel(item.Unterkategorien_B);
    if (unterkategorieB !== null) {
      rows.push(['Unterkategorie B', unterkategorieB]);
    }


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

    rows.push(
      ['Erfasst am', item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : null],
      ['Aktualisiert am', item.UpdatedAt ? formatDateTime(item.UpdatedAt) : null],
      ['Verkaufspreis', item.Verkaufspreis ?? null]
    );

    return rows;
  }, [agentic, events, item, langtextRows, qualitySummary.label, resolveUnterkategorieLabel]);

  const { referenceDetailRows, instanceDetailRows } = useMemo(() => {
    const referenceRows: [string, React.ReactNode][] = [];
    const instanceRows: [string, React.ReactNode][] = [];
    try {
      const instanceKeys = new Set([
        'ItemUUID',
        'Behälter',
        'Qualität',
        'Ki Status',
        'Erfasst am',
        'Aktualisiert am'
      ]);
      for (const row of detailRows) {
        if (instanceKeys.has(row[0])) {
          instanceRows.push(row);
        } else {
          referenceRows.push(row);
        }
      }
    } catch (error) {
      logError('ItemDetail: Failed to partition detail rows', error, {
        rowCount: detailRows.length
      });
      return {
        referenceDetailRows: detailRows,
        instanceDetailRows: []
      };
    }
    return { referenceDetailRows: referenceRows, instanceDetailRows: instanceRows };
  }, [detailRows]);

  const instanceRows = useMemo(() => {
    return instances.map((instance) => {
      const qualityLabel =
        typeof instance.Quality === 'number' ? describeQuality(instance.Quality).label : null;
      const agenticStatus = instance.AgenticStatus ?? AGENTIC_RUN_STATUS_NOT_STARTED;
      return {
        id: instance.ItemUUID,
        quality: qualityLabel,
        agenticStatus: describeAgenticStatus(agenticStatus),
        location: instance.Location ?? null,
        updatedAt: instance.UpdatedAt ? formatDateTime(instance.UpdatedAt) : null,
        createdAt: instance.Datum_erfasst ? formatDateTime(instance.Datum_erfasst) : null
      };
    });
  }, [instances]);

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

  const handleAgenticSearchTermChange = useCallback((value: string) => {
    try {
      setAgenticSearchTerm(value);
      if (value.trim()) {
        setAgenticSearchError(null);
      }
    } catch (error) {
      console.error('ItemDetail: Failed to update agentic search term input', error);
      setAgenticError('Suchbegriff konnte nicht aktualisiert werden.');
    }
  }, []);

  const getNormalizedAgenticSearchTerm = useCallback((): string => {
    try {
      const normalized = (agenticSearchTerm ?? '').trim();
      if (!normalized) {
        setAgenticSearchError('Suchbegriff darf nicht leer sein.');
        console.warn('Agentic search term validation failed: empty input');
        return '';
      }
      setAgenticSearchError(null);
      return normalized;
    } catch (error) {
      console.error('Failed to normalize agentic search term input', error);
      setAgenticError('Suchbegriff konnte nicht verarbeitet werden.');
      return '';
    }
  }, [agenticSearchTerm]);

  const agenticRows: [string, React.ReactNode][] = [];
  // TODO(agentic-transcript-ui): Keep the transcript link visible regardless of agentic run state once backend exposes it.
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
  if (agentic?.TranscriptUrl) {
    agenticRows.push([
      'Agenten-Transkript',
      <a href={agentic.TranscriptUrl} target="_blank" rel="noreferrer">Protokoll öffnen</a>
    ]);
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
  }
  if (agentic?.ReviewedBy) {
    agenticRows.push(['Geprüft von', agentic.ReviewedBy]);
  }
  if (latestAgenticReviewNote) {
    agenticRows.push(['Kommentar', latestAgenticReviewNote]);
  }

  const normalizeInstanceList = useCallback(
    (payload: ItemDetailResponse['instances'] | unknown): ItemInstanceSummary[] => {
      try {
        if (!Array.isArray(payload)) {
          logger.warn?.('ItemDetail: Instances payload missing or invalid', {
            itemId,
            payloadType: typeof payload
          });
          return [];
        }

        const normalized: ItemInstanceSummary[] = [];
        payload.forEach((entry, index) => {
          const itemUUID = typeof (entry as ItemInstanceSummary)?.ItemUUID === 'string'
            ? (entry as ItemInstanceSummary).ItemUUID.trim()
            : '';
          if (!itemUUID) {
            logger.warn?.('ItemDetail: Instance entry missing ItemUUID', { itemId, index });
            return;
          }

          const qualityRaw = (entry as ItemInstanceSummary)?.Quality;
          const parsedQuality =
            typeof qualityRaw === 'number'
              ? qualityRaw
              : typeof qualityRaw === 'string'
                ? Number(qualityRaw)
                : null;
          const rawAgenticStatus = (entry as ItemInstanceSummary)?.AgenticStatus;
          const parsedAgenticStatus =
            typeof rawAgenticStatus === 'string'
              && AGENTIC_RUN_STATUSES.includes(rawAgenticStatus as (typeof AGENTIC_RUN_STATUSES)[number])
              ? rawAgenticStatus
              : null;

          normalized.push({
            ItemUUID: itemUUID,
            AgenticStatus: parsedAgenticStatus,
            Quality: Number.isNaN(parsedQuality ?? NaN) ? null : parsedQuality,
            Location: (entry as ItemInstanceSummary)?.Location ?? null,
            BoxID: (entry as ItemInstanceSummary)?.BoxID ?? null,
            UpdatedAt: (entry as ItemInstanceSummary)?.UpdatedAt ?? null,
            Datum_erfasst: (entry as ItemInstanceSummary)?.Datum_erfasst ?? null
          });
        });

        return normalized;
      } catch (error) {
        logError('ItemDetail: Failed to normalize instance list payload', error, { itemId });
        return [];
      }
    },
    [itemId]
  );

  const load = useCallback(async ({ showSpinner = false }: { showSpinner?: boolean } = {}) => {
    if (showSpinner) {
      setIsLoading(true);
    }
    setLoadError(null);
    console.info('Loading item details', { itemId, showSpinner });
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
      if (res.ok) {
        const data = (await res.json()) as ItemDetailResponse;
        setItem(data.item);
        setEvents(Array.isArray(data.events) ? filterVisibleEvents(data.events) : []);
        setAgentic(data.agentic ?? null);
        const media = Array.isArray(data.media)
          ? data.media.filter((src: unknown): src is string => typeof src === 'string' && src.trim() !== '')
          : [];
        setMediaAssets(media);
        setInstances(normalizeInstanceList(data.instances));
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
        setInstances([]);
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
      setInstances([]);
      setAgenticReviewIntent(null);
      setLoadError('Artikel konnte nicht geladen werden.');
    } finally {
      if (showSpinner) {
        setIsLoading(false);
      }
    }
  }, [itemId]);

  const handleInstanceNavigation = useCallback(
    async (targetItemId: string | null) => {
      if (!targetItemId) {
        logError('ItemDetail: Missing ItemUUID for instance navigation', undefined, { itemId });
        return;
      }
      if (targetItemId === itemId) {
        try {
          await load({ showSpinner: true });
        } catch (error) {
          logError('ItemDetail: Failed to reload current instance detail', error, {
            itemId,
            targetItemId
          });
        }
        return;
      }
      try {
        navigate(`/items/${encodeURIComponent(targetItemId)}`);
      } catch (error) {
        logError('ItemDetail: Failed to navigate to instance detail', error, {
          itemId,
          targetItemId
        });
      }
    },
    [itemId, load, navigate]
  );

  const refreshAgenticStatus = useCallback(
    async (targetItemId: string): Promise<AgenticRun | null> => {
      try {
        const response = await fetch(`/api/items/${encodeURIComponent(targetItemId)}/agentic`, {
          method: 'GET',
          cache: 'reload'
        });
        if (!response.ok) {
          console.warn('Failed to refresh agentic status', { status: response.status, targetItemId });
          return null;
        }
        const payload = await response
          .json()
          .catch((parseErr) => {
            console.error('Failed to parse refreshed agentic status payload', parseErr);
            return null;
          });
        const refreshedRun: AgenticRun | null = payload?.agentic ?? null;
        setAgentic(refreshedRun);
        return refreshedRun;
      } catch (error) {
        console.error('Failed to reload agentic status', error);
        return null;
      }
    },
    []
  );

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
  const agenticHasRun = Boolean(agentic);
  const agenticCanStart = !agenticHasRun || normalizedAgenticStatus === AGENTIC_RUN_STATUS_NOT_STARTED;
  const agenticCanCancel = normalizedAgenticStatus
    ? AGENTIC_RUN_ACTIVE_STATUSES.has(normalizedAgenticStatus)
    : false;
  // TODO(agentic-close-not-started): Confirm manual close remains available for not-started runs after import/export sync.
  // TODO(agentic-close-running): Reconfirm close affordance rules once running-state copy is finalized.
  const agenticCanClose = Boolean(
    agenticHasRun &&
    normalizedAgenticStatus &&
    normalizedAgenticStatus !== AGENTIC_RUN_STATUS_RUNNING
  );
  const agenticCanDelete = Boolean(
    agenticHasRun && normalizedAgenticStatus !== AGENTIC_RUN_STATUS_NOT_STARTED
  );

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

  async function promptAgenticCloseNote(): Promise<string | null> {
    let promptResult: string | null;
    try {
      promptResult = await dialogService.prompt({
        title: 'Abschluss-Notiz',
        message: 'Optional eine Notiz für den Abschluss hinzufügen.',
        confirmLabel: 'Speichern',
        cancelLabel: 'Ohne Notiz',
        placeholder: 'Notiz (optional)',
        defaultValue: ''
      });
    } catch (error) {
      console.error('Failed to prompt for agentic close note', error);
      return null;
    }

    if (promptResult === null) {
      return '';
    }

    return promptResult.trim();
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
        ? 'KIs Ergebnis freigeben?'
        : 'KIs Ergebnis ablehnen?';
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

  async function handleAgenticStart() {
    if (!item) {
      console.warn('Agentic start requested without loaded item data');
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
        console.error('Failed to display agentic start user alert', error);
      }
      return;
    }

    const searchTerm = getNormalizedAgenticSearchTerm();
    if (!searchTerm) {
      console.warn('Agentic start skipped due to missing or invalid search term', { itemId: item.ItemUUID });
      setAgenticError('Ki-Lauf konnte nicht gestartet werden (fehlender Suchbegriff).');
      setAgenticSearchTerm('');
      return;
    }

    setAgenticSearchTerm(searchTerm);

    setAgenticActionPending(true);
    setAgenticError(null);
    setAgenticReviewIntent(null);

    try {
      const triggerResult = await triggerAgenticRun({
        payload: { itemId: item.ItemUUID, artikelbeschreibung: searchTerm, actor },
        context: 'item detail start'
      });

      if (triggerResult.outcome === 'skipped') {
        console.warn('Agentic start was skipped by trigger logic', triggerResult);
        setAgenticError('Ki-Lauf konnte nicht gestartet werden (fehlende Angaben).');
        return;
      }

      if (triggerResult.outcome === 'failed') {
        const failureCode =
          extractAgenticFailureReason(triggerResult.error) ?? triggerResult.reason ?? null;
        const failureDescription = describeAgenticFailureReason(failureCode);
        const failureMessage = failureDescription
          ? `Ki-Lauf konnte nicht gestartet werden. Grund: ${failureDescription}`
          : 'Ki-Lauf konnte nicht gestartet werden.';
        setAgenticError(failureMessage);
        return;
      }

      const refreshed = triggerResult.agentic
        ? triggerResult.agentic
        : await refreshAgenticStatus(item.ItemUUID);
      const nextRun = refreshed ?? agentic;
      if (nextRun) {
        setAgentic({ ...nextRun, SearchQuery: searchTerm });
      } else {
        setAgentic(nextRun);
      }
      setAgenticError(null);
    } catch (err) {
      console.error('Ki-Start request failed', err);
      setAgenticError('Ki-Lauf konnte nicht gestartet werden.');
    } finally {
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

    const baseSearchTerm = getNormalizedAgenticSearchTerm();
    if (!baseSearchTerm) {
      console.warn('Agentic restart skipped due to missing search term', { itemId: item.ItemUUID });
      setAgenticError('Ki-Neustart konnte nicht ausgelöst werden (fehlender Suchbegriff).');
      setAgenticSearchTerm('');
      return;
    }

    setAgenticSearchTerm(baseSearchTerm);

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
      if (refreshedRun) {
        setAgentic({ ...refreshedRun, SearchQuery: baseSearchTerm });
      } else {
        setAgentic(refreshedRun);
      }

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
      setAgenticError('Kein KI Durchlauf vorhanden.');
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
        title: 'KI Durchlauf abbrechen',
        message: 'KI Durchlauf abbrechen?',
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

  async function handleAgenticClose() {
    if (!agentic) {
      console.warn('Agentic close requested without run data');
      setAgenticError('Kein KI Durchlauf vorhanden.');
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
        console.error('Failed to display agentic close user alert', error);
      }
      return;
    }

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'KI Suche abschliessen',
        message: 'KI Suche abschliessen und als freigegeben markieren?',
        confirmLabel: 'Abschliessen',
        cancelLabel: 'Zurück'
      });
    } catch (error) {
      console.error('Failed to confirm agentic close', error);
      return;
    }

    if (!confirmed) {
      return;
    }

    const noteInput = await promptAgenticCloseNote();
    if (noteInput === null) {
      return;
    }

    setAgenticActionPending(true);
    setAgenticReviewIntent(null);
    setAgenticError(null);

    try {
      const closeResult = await persistAgenticRunClose({
        itemId: agentic.ItemUUID,
        actor,
        notes: noteInput,
        context: 'item detail close'
      });

      if (closeResult.ok) {
        if (closeResult.agentic) {
          setAgentic(closeResult.agentic);
        }
        setAgenticError(null);
      } else {
        const fallbackMessage =
          closeResult.status === 404
            ? 'Kein KI Durchlauf gefunden.'
            : 'Ki-Suche konnte nicht abgeschlossen werden.';
        setAgenticError(closeResult.message ?? fallbackMessage);
      }
    } catch (err) {
      console.error('Ki-Abschlussanfrage fehlgeschlagen', err);
      setAgenticError('Ki-Suche konnte nicht abgeschlossen werden.');
    } finally {
      setAgenticActionPending(false);
    }
  }

  async function handleAgenticDelete() {
    if (!agentic) {
      console.warn('Agentic delete requested without run data');
      setAgenticError('Kein KI Durchlauf vorhanden.');
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
        console.error('Failed to display agentic delete user alert', error);
      }
      return;
    }

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'KI-Lauf löschen',
        message: 'Aktuellen KI-Lauf löschen und zurücksetzen?',
        confirmLabel: 'Löschen',
        cancelLabel: 'Zurück'
      });
    } catch (error) {
      console.error('Failed to confirm agentic deletion', error);
      return;
    }

    if (!confirmed) {
      return;
    }

    let secondConfirmation = false;
    try {
      secondConfirmation = await dialogService.confirm({
        title: 'Löschung bestätigen',
        message:
          'Der aktuelle KI-Lauf wird entfernt und auf "Nicht gestartet" gesetzt. Protokolle bleiben bestehen.',
        confirmLabel: 'Ja, löschen',
        cancelLabel: 'Abbrechen'
      });
    } catch (error) {
      console.error('Failed to confirm agentic deletion final step', error);
      return;
    }

    if (!secondConfirmation) {
      return;
    }

    setAgenticActionPending(true);
    setAgenticReviewIntent(null);
    setAgenticError(null);

    try {
      const deletionResult = await persistAgenticRunDeletion({
        itemId: agentic.ItemUUID,
        actor,
        reason: 'User requested agentic run reset',
        context: 'item detail delete'
      });

      if (deletionResult.ok) {
        if (deletionResult.agentic) {
          console.info('Agentic run deleted; resetting state to not started', {
            itemId: deletionResult.agentic.ItemUUID,
            status: deletionResult.agentic.Status
          });
        }
        setAgentic(null);
        setAgenticError(null);
      } else {
        const deletionErrorMessage = deletionResult.reason === 'not-found'
          ? 'Kein KI Durchlauf gefunden.'
          : 'Ki-Lauf konnte nicht gelöscht werden.';
        setAgenticError(deletionErrorMessage);
      }
    } catch (err) {
      console.error('Ki-Lauf-Löschung fehlgeschlagen', err);
      setAgenticError('Ki-Lauf konnte nicht gelöscht werden.');
    } finally {
      setAgenticActionPending(false);
    }
  }

  const agenticStartHandler = !agenticHasRun ? handleAgenticStart : handleAgenticRestart;
  const agenticStartLabel = agenticHasRun ? 'Starten' : 'Start KI-Lauf';
  const agenticStatus = agenticStatusDisplay(agentic);
  const agenticIsInProgress = isAgenticRunInProgress(agentic);

  // TODO(agent): Confirm action placement after UX feedback on reference/instance sections.
  async function handleEdit() {
    if (!item) {
      return;
    }
    if (agenticIsInProgress) {
      logger.info?.('Blocking item edit because agentic run is active', {
        itemId: item.ItemUUID,
        status: agentic?.Status ?? null
      });
      try {
        await dialogService.alert({
          title: 'Bearbeiten nicht möglich',
          message: 'Während eines laufenden KI-Laufs kann der Artikel nicht bearbeitet werden.'
        });
      } catch (error) {
        console.error('Failed to display agentic edit block alert', error);
      }
      return;
    }
    navigate(`/items/${encodeURIComponent(item.ItemUUID)}/edit`);
  }

  return (
    <div
      className="container item"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="grid landing-grid">
        {item ? (
          <>
            <div className="card grid-span-row-2">
              <div className='top-row'>
                <button
                  type="button"
                  className="sml-btn btn"
                  disabled={!neighborIds.previousId || neighborsLoading}
                  onClick={() => handleNeighborNavigation('previous')}
                  aria-label="Vorheriger Artikel"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="sml-btn btn"
                  disabled={!neighborIds.nextId || neighborsLoading}
                  onClick={() => handleNeighborNavigation('next')}
                  aria-label="Nächster Artikel"
                >
                  →
                </button>
              </div>

              <h2 className="item-detail__title">
                Artikel <span className="muted">({item.ItemUUID})</span>
                <span style={{ marginLeft: '8px' }}>
                  <QualityBadge compact value={qualitySummary.value} />
                </span>
              </h2>
              <h3>Referenz</h3>
              {referenceDetailRows.length > 0 ? (
                <table className="details">
                  <tbody>
                    {referenceDetailRows.map(([k, v], idx) => {
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
              ) : (
                <p className="muted">Keine Referenzdaten vorhanden.</p>
              )}
              <div className="row">
                <button type="button" className="btn" onClick={handleEdit}>Bearbeiten</button>
              </div>
            </div>

            <div className="card grid-span-row-2">
              <h3>Fotos</h3>
              <section className="item-media-section">
                <ItemMediaGallery
                  itemId={item.ItemUUID}
                  grafikname={item.Grafikname}
                  mediaAssets={mediaAssets}
                  className="item-media-gallery--stacked"
                />
              </section>
            </div>

            <div className="card">
              <h3>dieser Artikel</h3>
              <div className="row">
                {instanceDetailRows.length > 0 ? (
                  <table className="details">
                    <tbody>
                      {instanceDetailRows.map(([k, v], idx) => {
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
                ) : (
                  <p className="muted">Keine Instanzdaten vorhanden.</p>
                )}
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
              </div>
            </div>

            <RelocateItemCard
              itemId={item.ItemUUID}
              onRelocated={() => load({ showSpinner: false })}
            />

            <div className="card grid-span-2">
              <h3>Vorrat</h3>
              {instanceRows.length > 0 ? (
                <table className="details">
                  <thead>
                    <tr>
                      <th>UUID</th>
                      <th>Qualität</th>
                      <th>Ki</th>
                      <th>Standort</th>
                      <th>Aktualisiert</th>
                      <th>Erfasst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instanceRows.map((row) => {
                      const qualityCell = normalizeDetailValue(row.quality);
                      const agenticCell = normalizeDetailValue(row.agenticStatus);
                      const locationCell = normalizeDetailValue(row.location);
                      const updatedCell = normalizeDetailValue(row.updatedAt);
                      const createdCell = normalizeDetailValue(row.createdAt);
                      const navigationLabel = `Instanz ${row.id} öffnen`;
                      const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void handleInstanceNavigation(row.id);
                        }
                      };
                      return (
                        <tr
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => void handleInstanceNavigation(row.id)}
                          onKeyDown={handleRowKeyDown}
                          aria-label={navigationLabel}
                        >
                          <td>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleInstanceNavigation(row.id);
                              }}
                              aria-label={navigationLabel}
                            >
                              {row.id}
                            </button>
                          </td>
                          <td className={qualityCell.isPlaceholder ? 'is-placeholder' : undefined}>
                            {qualityCell.content}
                          </td>
                          <td className={agenticCell.isPlaceholder ? 'is-placeholder' : undefined}>
                            {agenticCell.content}
                          </td>
                          <td className={locationCell.isPlaceholder ? 'is-placeholder' : undefined}>
                            {locationCell.content}
                          </td>
                          <td className={updatedCell.isPlaceholder ? 'is-placeholder' : undefined}>
                            {updatedCell.content}
                          </td>
                          <td className={createdCell.isPlaceholder ? 'is-placeholder' : undefined}>
                            {createdCell.content}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Keine Instanzen vorhanden.</p>
              )}
            </div>

            <AgenticStatusCard
              status={agenticStatus}
              rows={agenticRows}
              actionPending={agenticActionPending}
              reviewIntent={agenticReviewIntent}
              error={agenticError}
              needsReview={agenticNeedsReview}
              searchTerm={agenticSearchTerm}
              searchTermError={agenticSearchError}
              onSearchTermChange={handleAgenticSearchTermChange}
              canCancel={agenticCanCancel}
              canClose={agenticCanClose}
              canStart={agenticCanStart}
              canRestart={agenticCanRestart}
              canDelete={agenticCanDelete}
              startLabel={agenticStartLabel}
              isInProgress={agenticIsInProgress}
              onStart={agenticCanStart ? agenticStartHandler : undefined}
              onRestart={handleAgenticRestart}
              onReview={handleAgenticReview}
              onCancel={handleAgenticCancel}
              onClose={agenticCanClose ? handleAgenticClose : undefined}
              onDelete={agenticCanDelete ? handleAgenticDelete : undefined}
            />


            <PrintLabelButton itemId={item.ItemUUID} />

            <div className="card grid-span-2">
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
