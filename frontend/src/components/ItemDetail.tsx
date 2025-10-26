import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateItemCard from './RelocateItemCard';
import type { Item, EventLog, AgenticRun } from '../../../models';
import { formatDateTime } from '../lib/format';
import { ensureUser } from '../lib/user';
import { eventLabel } from '../../../models/event-labels';
import { itemCategories } from '../data/itemCategories';
import type {
  ItemCategoryDefinition,
  ItemSubcategoryDefinition
} from '../data/itemCategories';
import {
  buildAgenticCancelUrl,
  cancelAgenticRun,
  persistAgenticRunCancellation,
  resolveAgenticApiBase,
  triggerAgenticRun
} from '../lib/agentic';
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

const AGENTIC_FAILURE_STATUSES = new Set([
  'failed',
  'error',
  'errored',
  'failure',
  'timeout',
  'timed_out'
]);

const AGENTIC_RUNNING_STATUSES = new Set([
  'running',
  'processing',
  'in_progress',
  'active',
  'executing'
]);

const AGENTIC_PENDING_STATUSES = new Set([
  'pending',
  'queued',
  'created',
  'requested',
  'waiting',
  'scheduled',
  'initializing'
]);

const AGENTIC_CANCELLED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'aborted',
  'stopped',
  'terminated'
]);

const AGENTIC_SUCCESS_STATUSES = new Set([
  'completed',
  'done',
  'success',
  'succeeded',
  'finished',
  'resolved'
]);

const AGENTIC_REVIEW_PENDING_STATUSES = new Set([
  'pending_review',
  'review_pending',
  'review_needed',
  'needs_review',
  'awaiting_review',
  'awaiting_approval',
  'ready_for_review',
  'requires_review',
  'waiting_for_review'
]);

const AGENTIC_REVIEW_APPROVED_STATUSES = new Set(['approved', 'accepted', 'published', 'released']);

const AGENTIC_REVIEW_REJECTED_STATUSES = new Set(['rejected', 'declined', 'denied']);

export interface AgenticStatusCardProps {
  status: AgenticStatusDisplay;
  rows: [string, React.ReactNode][];
  actionPending: boolean;
  reviewIntent: 'approved' | 'rejected' | null;
  error: string | null;
  needsReview: boolean;
  hasFailure: boolean;
  isInProgress: boolean;
  onRestart: () => void | Promise<void>;
  onReview: (decision: 'approved' | 'rejected') => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

interface NormalizedDetailValue {
  content: React.ReactNode;
  isPlaceholder: boolean;
}

const DETAIL_PLACEHOLDER_TEXT = 'Nicht gesetzt';

interface ItemSubcategoryWithParent extends ItemSubcategoryDefinition {
  parentCode: number;
  parentLabel: string;
}

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

export function AgenticStatusCard({
  status,
  rows,
  actionPending,
  reviewIntent,
  error,
  needsReview,
  hasFailure,
  isInProgress,
  onRestart,
  onReview,
  onCancel
}: AgenticStatusCardProps) {
  return (
    <div className="card">
      <h3>Ki Status</h3>
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
      {actionPending ? <p className="muted">Agentic-Aktion wird ausgeführt…</p> : null}
      {reviewIntent ? (
        <p className="muted">
          Review-Aktion "{reviewIntent === 'approved' ? 'Freigeben' : 'Ablehnen'}" vorbereitet.
        </p>
      ) : null}
      {error ? (
        <p className="muted" style={{ color: '#a30000' }}>{error}</p>
      ) : null}
      {!status.isTerminal && isInProgress ? (
        <div className='row'>
          <button type="button" className="btn" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      ) : null}
      {!needsReview && hasFailure ? (
        <div className='row'>
          <button type="button" className="btn" disabled={actionPending} onClick={onRestart}>
            Wiederholen
          </button>
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
  );
}

function resolveActorName(actor?: string | null): string {
  return actor && actor.trim() ? actor : 'System';
}

export interface ItemDetailAgenticCancelRequest {
  agentic: AgenticRun;
  actor: string;
  agenticCancelUrl: string | null;
  persistCancellation: typeof persistAgenticRunCancellation;
  cancelExternalRun: typeof cancelAgenticRun;
  logger?: Pick<typeof console, 'warn' | 'error'>;
}

export interface ItemDetailAgenticCancelResult {
  updatedRun: AgenticRun | null;
  error: string | null;
}

export async function performItemDetailAgenticCancel({
  agentic,
  actor,
  agenticCancelUrl,
  persistCancellation,
  cancelExternalRun,
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
  } else if (persistence.status === 404) {
    finalError = 'Kein laufender agentischer Durchlauf gefunden.';
  } else if (persistence.status === 0) {
    finalError = 'Agentic-Abbruch fehlgeschlagen.';
  } else {
    finalError = 'Agentic-Abbruch konnte nicht gespeichert werden.';
  }

  if (agenticCancelUrl) {
    try {
      await cancelExternalRun({
        cancelUrl: agenticCancelUrl,
        itemId: agentic.ItemUUID,
        actor,
        context: 'item detail cancel'
      });
    } catch (err) {
      logger.error('Agentic external cancel failed', err);
      if (!finalError) {
        finalError = 'Agentic-Abbruch konnte extern nicht gestoppt werden.';
      }
    }
  } else {
    logger.warn('Agentic cancel URL not configured; external cancellation skipped.');
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
  const normalizedStatus = (run.Status || '').trim().toLowerCase();
  const normalizedReview = (run.ReviewState || '').trim().toLowerCase();

  const defaultLabel = run.Status && run.Status.trim() ? run.Status : 'Unbekannt';

  let base: Omit<AgenticStatusDisplay, 'className'> = {
    label: defaultLabel,
    description: `Status: ${defaultLabel}`,
    variant: 'info',
    needsReviewBadge: false,
    isTerminal: false
  };

  if (normalizedStatus) {
    if (AGENTIC_FAILURE_STATUSES.has(normalizedStatus) || normalizedStatus.startsWith('error')) {
      base = {
        label: 'Fehler',
        description: 'Der agentische Durchlauf ist fehlgeschlagen.',
        variant: 'error',
        needsReviewBadge: false,
        isTerminal: true
      };
    } else if (AGENTIC_RUNNING_STATUSES.has(normalizedStatus)) {
      base = {
        label: 'In Arbeit',
        description: 'Der agentische Durchlauf läuft derzeit.',
        variant: 'info',
        needsReviewBadge: false,
        isTerminal: false
      };
    } else if (AGENTIC_PENDING_STATUSES.has(normalizedStatus)) {
      base = {
        label: 'Wartet',
        description: 'Der agentische Durchlauf wartet auf Ausführung.',
        variant: 'pending',
        needsReviewBadge: false,
        isTerminal: false
      };
    } else if (AGENTIC_CANCELLED_STATUSES.has(normalizedStatus)) {
      base = {
        label: 'Abgebrochen',
        description: 'Der agentische Durchlauf wurde abgebrochen.',
        variant: 'info',
        needsReviewBadge: false,
        isTerminal: true
      };
    } else if (AGENTIC_SUCCESS_STATUSES.has(normalizedStatus)) {
      base = {
        label: 'Fertig',
        description: 'Der agentische Durchlauf wurde abgeschlossen.',
        variant: 'success',
        needsReviewBadge: false,
        isTerminal: true
      };
    } else if (AGENTIC_REVIEW_PENDING_STATUSES.has(normalizedStatus)) {
      base = {
        label: 'Review ausstehend',
        description: 'Das Ergebnis wartet auf Freigabe.',
        variant: 'pending',
        needsReviewBadge: true,
        isTerminal: false
      };
    } else if (AGENTIC_REVIEW_APPROVED_STATUSES.has(normalizedStatus)) {
      base = {
        label: 'Freigegeben',
        description: 'Das Ergebnis wurde freigegeben.',
        variant: 'success',
        needsReviewBadge: false,
        isTerminal: true
      };
    } else if (AGENTIC_REVIEW_REJECTED_STATUSES.has(normalizedStatus)) {
      base = {
        label: 'Abgelehnt',
        description: 'Das Ergebnis wurde abgelehnt.',
        variant: 'error',
        needsReviewBadge: false,
        isTerminal: true
      };
    }
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

  const normalizedStatus = (run.Status || '').trim().toLowerCase();
  const normalizedReview = (run.ReviewState || '').trim().toLowerCase();

  if (normalizedReview === 'approved' || normalizedReview === 'rejected' || normalizedReview === 'not_required') {
    return false;
  }

  if (
    AGENTIC_SUCCESS_STATUSES.has(normalizedStatus) ||
    AGENTIC_CANCELLED_STATUSES.has(normalizedStatus) ||
    AGENTIC_REVIEW_APPROVED_STATUSES.has(normalizedStatus) ||
    AGENTIC_REVIEW_REJECTED_STATUSES.has(normalizedStatus)
  ) {
    return false;
  }

  if (
    AGENTIC_RUNNING_STATUSES.has(normalizedStatus) ||
    AGENTIC_PENDING_STATUSES.has(normalizedStatus) ||
    AGENTIC_REVIEW_PENDING_STATUSES.has(normalizedStatus)
  ) {
    return true;
  }

  return normalizedReview === 'pending';
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

  const agenticApiBase = useMemo(resolveAgenticApiBase, []);
  const agenticRunUrl = '/api/agentic/run';
  const agenticCancelUrl = useMemo(() => buildAgenticCancelUrl(agenticApiBase), [agenticApiBase]);
  // TODO: Share category lookup building logic between item detail and forms.
  const categoryLookups = useMemo(() => {
    const haupt = new Map<number, ItemCategoryDefinition>();
    const unter = new Map<number, ItemSubcategoryWithParent>();
    try {
      for (const category of itemCategories) {
        if (haupt.has(category.code)) {
          console.warn('Duplicate Hauptkategorie code detected while building detail lookup', category.code);
        }
        haupt.set(category.code, category);
        for (const sub of category.subcategories) {
          if (unter.has(sub.code)) {
            console.warn('Duplicate Unterkategorie code detected while building detail lookup', sub.code);
          }
          unter.set(sub.code, {
            ...sub,
            parentCode: category.code,
            parentLabel: category.label
          });
        }
      }
    } catch (error) {
      console.error('Failed to build item detail category lookup maps', error);
    }
    return { haupt, unter };
  }, []);

  const { haupt: hauptCategoryLookup, unter: unterCategoryLookup } = categoryLookups;

  const resolveHauptkategorieLabel = useCallback(
    (code?: number | null): React.ReactNode => {
      if (typeof code !== 'number' || Number.isNaN(code)) {
        return null;
      }
      const category = hauptCategoryLookup.get(code);
      if (!category) {
        console.warn('Missing Hauptkategorie mapping for item detail view', { code });
        return `Unbekannte Kategorie (${code})`;
      }
      return `${humanizeCategoryLabel(category.label)} (${category.code})`;
    },
    [hauptCategoryLookup]
  );

  const resolveUnterkategorieLabel = useCallback(
    (code?: number | null): React.ReactNode => {
      if (typeof code !== 'number' || Number.isNaN(code)) {
        return null;
      }
      const subCategory = unterCategoryLookup.get(code);
      if (!subCategory) {
        console.warn('Missing Unterkategorie mapping for item detail view', { code });
        return `Unbekannte Kategorie (${code})`;
      }
      return `${humanizeCategoryLabel(subCategory.label)} (${subCategory.code})`;
    },
    [unterCategoryLookup]
  );
  // TODO: Replace client-side slicing once the activities page provides pagination.
  const displayedEvents = useMemo(() => events.slice(0, 5), [events]);

  const detailRows = useMemo<[string, React.ReactNode][]>(() => {
    if (!item) {
      return [];
    }

    const creator = resolveActorName(events.length ? events[events.length - 1].Actor : null);

    return [
      ['Erstellt von', creator],
      ['Artikelbeschreibung', item.Artikelbeschreibung ?? null],
      ['Artikelnummer', item.Artikel_Nummer ?? null],
      ['Anzahl', item.Auf_Lager ?? null],
      [
        'Behälter',
        item.BoxID ? <Link to={`/boxes/${encodeURIComponent(String(item.BoxID))}`}>{item.BoxID}</Link> : null
      ],
      ['Kurzbeschreibung', item.Kurzbeschreibung ?? null],
      ['Hauptkategorie A', resolveHauptkategorieLabel(item.Hauptkategorien_A)],
      ['Unterkategorie A', resolveUnterkategorieLabel(item.Unterkategorien_A)],
      ['Hauptkategorie B', resolveHauptkategorieLabel(item.Hauptkategorien_B)],
      ['Unterkategorie B', resolveUnterkategorieLabel(item.Unterkategorien_B)],
      ['Erfasst am', item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : null],
      ['Aktualisiert am', item.UpdatedAt ? formatDateTime(item.UpdatedAt) : null],
      ['Verkaufspreis', item.Verkaufspreis ?? null],
      ['Langtext', item.Langtext ?? null],
      ['Hersteller', item.Hersteller ?? null],
      ['Länge (mm)', item.Länge_mm ?? null],
      ['Breite (mm)', item.Breite_mm ?? null],
      ['Höhe (mm)', item.Höhe_mm ?? null],
      ['Gewicht (kg)', item.Gewicht_kg ?? null],
      ['Einheit', item.Einheit ?? null]
    ];
  }, [events, item, resolveHauptkategorieLabel, resolveUnterkategorieLabel]);

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
        setEvents(data.events || []);
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
        setAgenticError('Agentic-Status konnte nicht geladen werden.');
        setMediaAssets([]);
        setAgenticReviewIntent(null);
        setLoadError(res.status === 404 ? 'Artikel wurde nicht gefunden.' : 'Artikel konnte nicht geladen werden.');
      }
    } catch (err) {
      console.error('Failed to fetch item', err);
      setItem(null);
      setEvents([]);
      setAgentic(null);
      setAgenticError('Agentic-Status konnte nicht geladen werden.');
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

  const agenticNeedsReview = agentic ? (agentic.ReviewState || '').toLowerCase() === 'pending' : false;
  const normalizedAgenticStatus = (agentic?.Status || '').toLowerCase();
  const agenticHasFailure = !agentic
    ? true
    : ['failed', 'error', 'errored', 'cancelled', 'canceled'].includes(normalizedAgenticStatus);

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

    setAgenticActionPending(true);
    setAgenticError(null);
    setAgenticReviewIntent(null);

    try {
      const restartResponse = await fetch(
        `/api/items/${encodeURIComponent(item.ItemUUID)}/agentic/restart`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor, search: baseSearchTerm })
        }
      );

      if (!restartResponse.ok) {
        console.error('Agentic restart failed', restartResponse.status);
        setAgenticError('Agentic-Neustart fehlgeschlagen.');
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
        setAgenticError('Agentic-Neustart lieferte keine Daten.');
        return;
      }

      const searchTerm =
        (refreshedRun.SearchQuery ?? '').trim() ||
        baseSearchTerm ||
        item.Artikelbeschreibung ||
        '';
      if (!searchTerm) {
        console.warn('Agentic restart skipped: missing search term');
        setAgenticError('Agentic-Neustart konnte nicht ausgelöst werden (fehlender Suchbegriff).');
        return;
      }
      const triggerPayload: AgenticRunTriggerPayload = {
        itemId: refreshedRun.ItemUUID || item.ItemUUID,
        artikelbeschreibung: searchTerm
      };
      const triggerResult = await triggerAgenticRun({
        runUrl: agenticRunUrl,
        payload: triggerPayload,
        context: 'item detail restart'
      });
      if (triggerResult.outcome !== 'triggered') {
        console.warn('Agentic restart did not trigger run; auto-cancelling', triggerResult);
        const cancelResult = await persistAgenticRunCancellation({
          itemId: refreshedRun.ItemUUID || item.ItemUUID,
          actor,
          context: 'item detail restart auto-cancel'
        });
        if (cancelResult.ok && cancelResult.agentic) {
          setAgentic(cancelResult.agentic);
        }
        const baseMessage =
          triggerResult.outcome === 'skipped' && triggerResult.reason === 'run-url-missing'
            ? 'Agentic-Konfiguration fehlt. Durchlauf wurde abgebrochen.'
            : 'Agentic-Neustart konnte nicht gestartet werden. Durchlauf wurde abgebrochen.';
        if (!cancelResult.ok) {
          setAgenticError(`${baseMessage} (Abbruch konnte nicht gespeichert werden.)`);
        } else {
          setAgenticError(baseMessage);
        }
        return;
      }
    } catch (err) {
      console.error('Agentic restart request failed', err);
      setAgenticError('Agentic-Neustart fehlgeschlagen.');
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
      agenticCancelUrl,
      persistCancellation: persistAgenticRunCancellation,
      cancelExternalRun: cancelAgenticRun,
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
  const agenticRows: [string, React.ReactNode][] = [];
  if (agentic?.LastModified) {
    agenticRows.push(['Zuletzt aktualisiert', formatDateTime(agentic.LastModified)]);
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
              hasFailure={agenticHasFailure}
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
                    <span className='muted'>[{formatDateTime(ev.CreatedAt)}]</span> {resolveActorName(ev.Actor)}{': ' + eventLabel(ev.Event)}
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
