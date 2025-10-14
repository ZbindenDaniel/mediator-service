import React, { useMemo, useState } from 'react';
import { GoMoveToEnd, GoPackageDependents, GoTrash, GoXCircle } from 'react-icons/go';
import BoxSearchInput, { BoxSuggestion } from './BoxSearchInput';
import { dialogService } from './dialog';
import { createBoxForRelocation, ensureActorOrAlert } from './relocation/relocationHelpers';
import { ensureUser } from '../lib/user';

interface BulkItemActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete?: () => Promise<void> | void;
  resolveActor?: () => Promise<string>;
}

interface FeedbackState {
  type: 'error' | 'info';
  message: string;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data && typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch (jsonErr) {
    console.error('Failed to parse bulk action error payload', jsonErr);
  }
  try {
    const text = await response.text();
    if (text.trim()) {
      return text.trim();
    }
  } catch (textErr) {
    console.error('Failed to read bulk action error text', textErr);
  }
  return 'Unbekannter Fehler bei der Verarbeitung der Anfrage.';
}

type MoveContext = 'existing' | 'created';

export default function BulkItemActionBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
  resolveActor
}: BulkItemActionBarProps) {
  const [targetBoxId, setTargetBoxId] = useState('');
  const [selectedBoxSuggestion, setSelectedBoxSuggestion] = useState<BoxSuggestion | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const effectiveResolveActor = resolveActor ?? ensureUser;
  const selectedCount = selectedIds.length;
  const hasSelection = selectedCount > 0;

  const selectionLabel = useMemo(() => {
    if (!hasSelection) {
      return 'Keine Artikel ausgewählt';
    }
    if (selectedCount === 1) {
      return '1 Artikel ausgewählt';
    }
    return `${selectedCount} Artikel ausgewählt`;
  }, [hasSelection, selectedCount]);

  async function handleAfterSuccess(): Promise<void> {
    onClearSelection();
    if (onActionComplete) {
      await onActionComplete();
    }
  }

  function buildConfirmContent(toBoxId: string, suggestion: BoxSuggestion | null, context: MoveContext) {
    return (
      <div className="bulk-item-action-bar__confirm-content">
        <p>Möchten Sie die Auswahl verschieben?</p>
        <ul>
          <li>{selectionLabel}</li>
          <li>
            Zielbehälter: <strong>{toBoxId}</strong>
            {suggestion?.Location ? (
              <span className="muted"> ({suggestion.Location})</span>
            ) : null}
          </li>
          {context === 'created' ? <li>Der Behälter wurde gerade neu angelegt.</li> : null}
        </ul>
      </div>
    );
  }

  async function executeBulkMove({
    target,
    suggestion,
    actorOverride,
    context,
    manageProcessing = true
  }: {
    target: string;
    suggestion: BoxSuggestion | null;
    actorOverride?: string;
    context: MoveContext;
    manageProcessing?: boolean;
  }): Promise<'success' | 'cancelled' | 'error'> {
    const trimmedTarget = target.trim();
    if (!trimmedTarget) {
      setFeedback({ type: 'error', message: 'Bitte geben Sie eine Ziel-Box-ID an.' });
      return 'error';
    }
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für die Aktion ausgewählt.' });
      return 'error';
    }

    setFeedback(null);

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Artikel verschieben',
        message: buildConfirmContent(trimmedTarget, suggestion, context),
        confirmLabel: 'Verschieben',
        cancelLabel: 'Abbrechen'
      });
      console.info('Bulk move confirmation resolved', {
        confirmed,
        toBoxId: trimmedTarget,
        selectionCount: selectedCount,
        context,
        selectedSuggestion: suggestion
      });
    } catch (dialogError) {
      console.error('Bulk move confirmation dialog failed', dialogError);
      setFeedback({ type: 'error', message: 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.' });
      return 'error';
    }

    if (!confirmed) {
      console.info('Bulk move cancelled via dialog', {
        toBoxId: trimmedTarget,
        selectionCount: selectedCount,
        context
      });
      return 'cancelled';
    }

    if (manageProcessing) {
      setIsProcessing(true);
    }

    try {
      const actor = actorOverride ?? await ensureActorOrAlert({
        context: context === 'created' ? 'bulk move (neuer Behälter)' : 'bulk move',
        resolveActor: effectiveResolveActor
      });
      if (!actor) {
        setFeedback({
          type: 'error',
          message: 'Aktion abgebrochen: Es wurde kein Benutzername angegeben.'
        });
        return 'error';
      }

      console.log('bulk move requested', {
        count: selectedCount,
        toBoxId: trimmedTarget,
        selectedSuggestion: suggestion,
        context
      });

      const response = await fetch('/api/items/bulk/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          itemIds: selectedIds,
          toBoxId: trimmedTarget,
          actor,
          confirm: true
        })
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        console.error('Bulk move failed', {
          status: response.status,
          message,
          toBoxId: trimmedTarget,
          context
        });
        setFeedback({ type: 'error', message });
        return 'error';
      }

      console.log('Bulk move completed', {
        count: selectedCount,
        toBoxId: trimmedTarget,
        selectedSuggestion: suggestion,
        context
      });
      await handleAfterSuccess();
      return 'success';
    } catch (err) {
      console.error('Bulk move request failed', err);
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'Unbekannter Fehler beim Verschieben.'
      });
      return 'error';
    } finally {
      if (manageProcessing) {
        setIsProcessing(false);
      }
    }
  }

  async function handleBulkMove(): Promise<void> {
    const result = await executeBulkMove({
      target: targetBoxId,
      suggestion: selectedBoxSuggestion,
      context: 'existing'
    });

    if (result === 'success') {
      setFeedback(null);
    }
  }

  async function handleCreateAndMove(): Promise<void> {
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für die Aktion ausgewählt.' });
      return;
    }

    setFeedback(null);
    setIsProcessing(true);

    try {
      const actor = await ensureActorOrAlert({
        context: 'bulk create+move',
        resolveActor: effectiveResolveActor
      });
      if (!actor) {
        setFeedback({
          type: 'error',
          message: 'Aktion abgebrochen: Es wurde kein Benutzername angegeben.'
        });
        return;
      }

      const creation = await createBoxForRelocation({
        actor,
        context: 'bulk create+move'
      });

      if (!creation.ok || !creation.boxId) {
        setFeedback({
          type: 'error',
          message: creation.message ?? 'Behälter anlegen fehlgeschlagen'
        });
        return;
      }

      setTargetBoxId(creation.boxId);
      setSelectedBoxSuggestion({ BoxID: creation.boxId });
      console.log('Bulk move container created', {
        boxId: creation.boxId,
        selectionCount: selectedCount
      });

      const moveResult = await executeBulkMove({
        target: creation.boxId,
        suggestion: { BoxID: creation.boxId },
        actorOverride: actor,
        context: 'created',
        manageProcessing: false
      });

      if (moveResult === 'cancelled') {
        setFeedback({
          type: 'info',
          message: `Verschieben abgebrochen. Neuer Behälter ${creation.boxId} wurde erstellt.`
        });
      }
    } catch (error) {
      console.error('Bulk move create+move flow failed', error);
      setFeedback({
        type: 'error',
        message: (error as Error).message || 'Unbekannter Fehler beim Verschieben.'
      });
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleBulkDelete(): Promise<void> {
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für die Aktion ausgewählt.' });
      return;
    }

    setFeedback(null);

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Bestand entfernen',
        message: (
          <div className="bulk-item-action-bar__confirm-content">
            <p>Soll der Bestand entfernt werden?</p>
            <p>{selectionLabel}</p>
          </div>
        ),
        confirmLabel: 'Entfernen',
        cancelLabel: 'Abbrechen'
      });
      console.info('Bulk delete confirmation resolved', {
        confirmed,
        selectionCount: selectedCount,
        selectedSuggestion: selectedBoxSuggestion
      });
    } catch (dialogError) {
      console.error('Bulk delete confirmation dialog failed', dialogError);
      setFeedback({ type: 'error', message: 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.' });
      return;
    }

    if (!confirmed) {
      console.info('Bulk delete cancelled via dialog', {
        selectionCount: selectedCount
      });
      return;
    }

    setIsProcessing(true);
    try {
      const actor = await ensureActorOrAlert({
        context: 'bulk delete',
        resolveActor: effectiveResolveActor
      });
      if (!actor) {
        setFeedback({
          type: 'error',
          message: 'Aktion abgebrochen: Es wurde kein Benutzername angegeben.'
        });
        return;
      }
      console.log('bulk delete requested', {
        count: selectedCount,
        selectedSuggestion: selectedBoxSuggestion
      });
      const response = await fetch('/api/items/bulk/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          itemIds: selectedIds,
          actor,
          confirm: true
        })
      });
      if (!response.ok) {
        const message = await readErrorMessage(response);
        console.error('Bulk delete failed', {
          status: response.status,
          message
        });
        setFeedback({ type: 'error', message });
        return;
      }
      console.log('Bulk delete completed', {
        count: selectedCount,
        selectedSuggestion: selectedBoxSuggestion
      });
      await handleAfterSuccess();
    } catch (err) {
      console.error('Bulk delete request failed', err);
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'Unbekannter Fehler beim Löschen.'
      });
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="card relocate-card bulk-item-action-bar" data-testid="bulk-item-action-bar">
      <div className="bulk-item-action-bar__summary">
        <strong>{selectionLabel}</strong>
        {isProcessing ? <span className="muted"> Verarbeitung…</span> : null}
      </div>
      <div className="bulk-item-action-bar__field row">
        <BoxSearchInput
          value={targetBoxId}
          onValueChange={setTargetBoxId}
          onSuggestionSelected={setSelectedBoxSuggestion}
          placeholder="Box-ID oder Standort suchen"
          label="Ziel Behälter-ID"
          disabled={isProcessing}
          allowCreate={false}
          className="bulk-item-action-bar__target"
          inputClassName="bulk-item-action-bar__target-input"
        />
      </div>
      <div className="bulk-item-action-bar__buttons row">
        <button
          className="bulk-item-action-bar__button bulk-item-action-bar__button--primary"
          disabled={isProcessing || !hasSelection}
          onClick={() => {
            void handleBulkMove();
          }}
          type="button"
        >
          <GoMoveToEnd aria-hidden="true" />
          <span>Verschieben</span>
        </button>
        <button
          className="bulk-item-action-bar__button"
          disabled={isProcessing || !hasSelection}
          onClick={() => {
            void handleCreateAndMove();
          }}
          type="button"
        >
          <GoPackageDependents aria-hidden="true" />
          <span>In neuen Behälter verschieben</span>
        </button>
        <button
          className="bulk-item-action-bar__button bulk-item-action-bar__button--danger"
          disabled={isProcessing || !hasSelection}
          onClick={() => {
            void handleBulkDelete();
          }}
          type="button"
        >
          <GoTrash aria-hidden="true" />
          <span>Bestand entfernen</span>
        </button>
        <button
          className="bulk-item-action-bar__button bulk-item-action-bar__button--ghost"
          disabled={isProcessing}
          onClick={onClearSelection}
          type="button"
        >
          <GoXCircle aria-hidden="true" />
          <span>Auswahl aufheben</span>
        </button>
      </div>
      {feedback ? (
        <div
          aria-live="assertive"
          className={`alert ${feedback.type === 'error' ? 'alert-error' : 'alert-info'}`}
          role="alert"
        >
          {feedback.message}
        </div>
      ) : null}
    </div>
  );
}
