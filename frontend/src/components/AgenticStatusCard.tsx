import React, { useState, useMemo, useCallback } from 'react';
import {
  AGENTIC_RUN_ACTIVE_STATUSES,
  AGENTIC_RUN_STATUS_APPROVED,
  AGENTIC_RUN_STATUS_CANCELLED,
  AGENTIC_RUN_STATUS_FAILED,
  AGENTIC_RUN_STATUS_NOT_STARTED,
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_REJECTED,
  AGENTIC_RUN_STATUS_REVIEW,
  AGENTIC_RUN_STATUS_RUNNING,
  AGENTIC_RUN_TERMINAL_STATUSES,
  normalizeAgenticRunStatus
} from '../../../models';
import type { AgenticRun } from '../../../models';
import { normalizeDetailValue } from '../lib/itemDetailFormatting';

export type AgenticBadgeVariant = 'info' | 'success' | 'error' | 'pending' | 'warning';

export interface AgenticStatusDisplay {
  label: string;
  className: string;
  description: string;
  variant: AgenticBadgeVariant;
  needsReviewBadge: boolean;
  isTerminal: boolean;
}

export interface AgenticStatusCardProps {
  status: AgenticStatusDisplay;
  rows: [string, React.ReactNode][];
  actionPending: boolean;
  reviewIntent: 'review' | null;
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
  onReview: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onClose?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  initiallyExpanded?: boolean;
  /** Remove the collapse toggle; card is always expanded. Use in the KI tab where it is the primary content. */
  noCollapse?: boolean;
  /** Suppress inline Start/Cancel/Review buttons — they are shown in the action panel instead. */
  hideInlineActions?: boolean;
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
  onDelete,
  initiallyExpanded = false,
  noCollapse = false,
  hideInlineActions = false
}: AgenticStatusCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(!initiallyExpanded && !noCollapse);
  const contentId = useMemo(() => `agentic-status-panel-${Math.random().toString(36).slice(2)}`, []);
  const startHandler = onStart ?? onRestart;
  const startText = typeof startLabel === 'string' && startLabel.trim() ? startLabel : 'Starten';
  const handleToggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try { console.info('Toggled agentic status card', { collapsed: next }); }
      catch (logError) { console.error('Failed to log agentic status card toggle', logError); }
      return next;
    });
  }, []);

  const effectiveCollapsed = noCollapse ? false : isCollapsed;

  return (
    <div className={`card agentic-status-card${effectiveCollapsed ? ' agentic-status-card--collapsed' : ''}`}>
      <h3 className="agentic-status-card__heading">
        {noCollapse ? (
          <>
            <span className="agentic-status-card__title">Ki Status</span>
            <span className={`agentic-status-card__summary ${status.className}`}>{status.label}</span>
          </>
        ) : (
          <button
            type="button"
            className="agentic-status-card__toggle"
            onClick={handleToggle}
            aria-expanded={!effectiveCollapsed}
            aria-controls={contentId}
          >
            <span className="agentic-status-card__title">Ki Status</span>
            <span className={`agentic-status-card__summary ${status.className}`}>{status.label}</span>
            <span className="agentic-status-card__chevron" aria-hidden="true">{effectiveCollapsed ? '▸' : '▾'}</span>
          </button>
        )}
      </h3>
      {!effectiveCollapsed ? (
        <div className="agentic-status-card__content" id={contentId}>
          <div className="row status-row">
            {isInProgress ? <span className="status-spinner" aria-hidden="true" /> : null}
          </div>
          <p className="muted">{status.description}</p>
          {rows.length > 0 ? (
            <table className="details">
              <tbody>
                {rows.map(([k, v], idx) => {
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
          ) : null}
          {!hideInlineActions && !needsReview && (canStart || canRestart) ? (
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
          {reviewIntent ? <p className="muted">Review-Checkliste wird gesendet…</p> : null}
          {error ? <p className="muted" style={{ color: '#a30000' }}>{error}</p> : null}
          {!hideInlineActions && canCancel ? (
            <div className='row'>
              <button type="button" className="btn" disabled={actionPending} onClick={onCancel}>Abbrechen</button>
            </div>
          ) : null}
          {!hideInlineActions && !needsReview && (canStart || canRestart) ? (
            <div className='row'>
              {canStart && startHandler ? (
                <button type="button" className="btn" disabled={actionPending} onClick={startHandler}>{startText}</button>
              ) : null}
              {canRestart ? (
                <button type="button" className="btn" disabled={actionPending} onClick={onRestart}>Wiederholen</button>
              ) : null}
            </div>
          ) : null}
          {!hideInlineActions && needsReview ? (
            <div className='row'>
              <button type="button" className="btn" disabled={actionPending} onClick={onReview}>Review</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
      base = { label: 'Nicht gestartet', description: 'Der KI Durchlauf wurde noch nicht gestartet.', variant: 'info', needsReviewBadge: false, isTerminal: true };
      break;
    case AGENTIC_RUN_STATUS_FAILED:
      base = { label: 'Fehlgeschlagen', description: 'Der KI Durchlauf ist fehlgeschlagen.', variant: 'error', needsReviewBadge: false, isTerminal: true };
      break;
    case AGENTIC_RUN_STATUS_RUNNING:
      base = { label: 'In Arbeit', description: 'Der KI Durchlauf läuft derzeit.', variant: 'info', needsReviewBadge: false, isTerminal: false };
      break;
    case AGENTIC_RUN_STATUS_QUEUED:
      base = { label: 'Wartet', description: 'Der KI Durchlauf wartet auf Ausführung.', variant: 'pending', needsReviewBadge: false, isTerminal: false };
      break;
    case AGENTIC_RUN_STATUS_CANCELLED:
      base = { label: 'Abgebrochen', description: 'Der KI Durchlauf wurde abgebrochen.', variant: 'info', needsReviewBadge: false, isTerminal: true };
      break;
    case AGENTIC_RUN_STATUS_REVIEW:
      base = { label: 'Review ausstehend', description: 'Das Ergebnis wartet auf Freigabe.', variant: 'pending', needsReviewBadge: true, isTerminal: false };
      break;
    case AGENTIC_RUN_STATUS_APPROVED:
      base = { label: 'Freigegeben', description: 'Das Ergebnis wurde freigegeben.', variant: 'success', needsReviewBadge: false, isTerminal: true };
      break;
    case AGENTIC_RUN_STATUS_REJECTED:
      base = { label: 'Abgelehnt', description: 'Das Ergebnis wurde abgelehnt.', variant: 'error', needsReviewBadge: false, isTerminal: true };
      break;
    default:
      break;
  }

  let finalMeta = base;
  if (normalizedReview === 'pending') {
    finalMeta = { label: 'Review ausstehend', description: 'Das Ergebnis wartet auf Freigabe.', variant: 'pending', needsReviewBadge: true, isTerminal: false };
  } else if (normalizedReview === 'approved') {
    finalMeta = { label: 'Freigegeben', description: 'Das Ergebnis wurde freigegeben.', variant: 'success', needsReviewBadge: false, isTerminal: true };
  } else if (normalizedReview === 'rejected') {
    finalMeta = { label: 'Abgelehnt', description: 'Das Ergebnis wurde abgelehnt.', variant: 'error', needsReviewBadge: false, isTerminal: true };
  }

  return { ...finalMeta, className: `pill status status-${finalMeta.variant}` };
}

export function isAgenticRunInProgress(run: AgenticRun | null): boolean {
  if (!run) return false;
  const normalizedStatus = normalizeAgenticRunStatus(run.Status);
  return AGENTIC_RUN_ACTIVE_STATUSES.has(normalizedStatus);
}
