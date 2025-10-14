import React, { useMemo, useState } from 'react';
import { GoArrowRight, GoTrash, GoXCircle } from 'react-icons/go';
import BoxSearchInput, { BoxSuggestion } from './BoxSearchInput';
import { dialogService } from './dialog';
import { ensureUser } from '../lib/user';

interface BulkItemActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
  onActionComplete?: () => Promise<void> | void;
  resolveActor?: () => Promise<string>;
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

export default function BulkItemActionBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
  resolveActor
}: BulkItemActionBarProps) {
  const [targetBoxId, setTargetBoxId] = useState('');
  const [selectedBoxSuggestion, setSelectedBoxSuggestion] = useState<BoxSuggestion | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleBulkMove(): Promise<void> {
    const trimmedTarget = targetBoxId.trim();
    if (!trimmedTarget) {
      setError('Bitte geben Sie eine Ziel-Box-ID an.');
      return;
    }
    if (!hasSelection) {
      setError('Keine Artikel für die Aktion ausgewählt.');
      return;
    }

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Artikel verschieben',
        message: (
          <div className="bulk-item-action-bar__confirm-content">
            <p>Möchten Sie die Auswahl verschieben?</p>
            <ul>
              <li>{selectionLabel}</li>
              <li>
                Zielbehälter: <strong>{trimmedTarget}</strong>
                {selectedBoxSuggestion?.Location ? (
                  <span className="muted"> ({selectedBoxSuggestion.Location})</span>
                ) : null}
              </li>
            </ul>
          </div>
        ),
        confirmLabel: 'Verschieben',
        cancelLabel: 'Abbrechen'
      });
      console.info('Bulk move confirmation resolved', {
        confirmed,
        toBoxId: trimmedTarget,
        selectionCount: selectedCount,
        selectedSuggestion: selectedBoxSuggestion
      });
    } catch (dialogError) {
      console.error('Bulk move confirmation dialog failed', dialogError);
      setError('Bestätigung fehlgeschlagen. Bitte erneut versuchen.');
      return;
    }

    if (!confirmed) {
      console.info('Bulk move cancelled via dialog', {
        toBoxId: trimmedTarget,
        selectionCount: selectedCount
      });
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const actor = (await effectiveResolveActor())?.trim();
      if (!actor) {
        setError('Aktion abgebrochen: Es wurde kein Benutzername angegeben.');
        return;
      }
      console.log('bulk move requested', {
        count: selectedCount,
        toBoxId: trimmedTarget,
        selectedSuggestion: selectedBoxSuggestion
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
          toBoxId: trimmedTarget
        });
        setError(message);
        return;
      }
      console.log('Bulk move completed', {
        count: selectedCount,
        toBoxId: trimmedTarget,
        selectedSuggestion: selectedBoxSuggestion
      });
      await handleAfterSuccess();
    } catch (err) {
      console.error('Bulk move request failed', err);
      setError((err as Error).message || 'Unbekannter Fehler beim Verschieben.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleBulkDelete(): Promise<void> {
    if (!hasSelection) {
      setError('Keine Artikel für die Aktion ausgewählt.');
      return;
    }

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
      setError('Bestätigung fehlgeschlagen. Bitte erneut versuchen.');
      return;
    }

    if (!confirmed) {
      console.info('Bulk delete cancelled via dialog', {
        selectionCount: selectedCount
      });
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const actor = (await effectiveResolveActor())?.trim();
      if (!actor) {
        setError('Aktion abgebrochen: Es wurde kein Benutzername angegeben.');
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
        setError(message);
        return;
      }
      console.log('Bulk delete completed', {
        count: selectedCount,
        selectedSuggestion: selectedBoxSuggestion
      });
      await handleAfterSuccess();
    } catch (err) {
      console.error('Bulk delete request failed', err);
      setError((err as Error).message || 'Unbekannter Fehler beim Löschen.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="bulk-item-action-bar" data-testid="bulk-item-action-bar">
      <div className="bulk-item-action-bar__summary">
        <strong>{selectionLabel}</strong>
        {isProcessing ? <span className="muted"> Verarbeitung…</span> : null}
      </div>
      <div className="bulk-item-action-bar__actions">
        <BoxSearchInput
          value={targetBoxId}
          onValueChange={setTargetBoxId}
          onSuggestionSelected={setSelectedBoxSuggestion}
          placeholder="Box-ID für Verschiebung"
          label="Ziel-Box"
          disabled={isProcessing}
          allowCreate={false}
          className="bulk-item-action-bar__target"
          inputClassName="bulk-item-action-bar__target-input"
        />
        <div className="bulk-item-action-bar__buttons">
          <button
            className="bulk-item-action-bar__icon-button bulk-item-action-bar__icon-button--primary"
            disabled={isProcessing || !hasSelection}
            onClick={() => { void handleBulkMove(); }}
            type="button"
            title="Ausgewählte Artikel verschieben"
            aria-label="Ausgewählte Artikel verschieben"
          >
            <GoArrowRight aria-hidden="true" />
          </button>
          <button
            className="bulk-item-action-bar__icon-button bulk-item-action-bar__icon-button--danger"
            disabled={isProcessing || !hasSelection}
            onClick={() => { void handleBulkDelete(); }}
            type="button"
            title="Bestand für Auswahl entfernen"
            aria-label="Bestand für Auswahl entfernen"
          >
            <GoTrash aria-hidden="true" />
          </button>
          <button
            className="bulk-item-action-bar__icon-button"
            disabled={isProcessing}
            onClick={onClearSelection}
            type="button"
            title="Auswahl aufheben"
            aria-label="Auswahl aufheben"
          >
            <GoXCircle aria-hidden="true" />
          </button>
        </div>
      </div>
      {error ? (
        <div aria-live="assertive" className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
