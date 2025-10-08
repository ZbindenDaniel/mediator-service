import React, { useMemo, useState } from 'react';
import { GoArrowRight, GoTrash } from 'react-icons/go';
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
    if (!window.confirm(`Sollen ${selectionLabel} in den Behälter ${trimmedTarget} verschoben werden?`)) {
      console.info('Bulk move cancelled by user.');
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
      console.log('bulk move requested', { count: selectedCount, toBoxId: trimmedTarget });
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
        console.error('Bulk move failed', { status: response.status, message });
        setError(message);
        return;
      }
      console.log('Bulk move completed', { count: selectedCount, toBoxId: trimmedTarget });
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
    if (!window.confirm(`Soll der Bestand für ${selectionLabel} entfernt werden?`)) {
      console.info('Bulk delete cancelled by user.');
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
      console.log('bulk delete requested', { count: selectedCount });
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
        console.error('Bulk delete failed', { status: response.status, message });
        setError(message);
        return;
      }
      console.log('Bulk delete completed', { count: selectedCount });
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
        <label className="bulk-item-action-bar__target">
          <span>Ziel-Box</span>
          <input
            aria-label="Ziel-Box-ID"
            disabled={isProcessing}
            onChange={(event) => setTargetBoxId(event.target.value)}
            placeholder="Box-ID für Verschiebung"
            type="text"
            value={targetBoxId}
          />
        </label>
        <button
          className="btn btn-primary"
          disabled={isProcessing || !hasSelection}
          onClick={() => { void handleBulkMove(); }}
          type="button"
        >
          <GoArrowRight aria-hidden="true" />
          <span>Verschieben</span>
        </button>
        <button
          className="btn btn-danger"
          disabled={isProcessing || !hasSelection}
          onClick={() => { void handleBulkDelete(); }}
          type="button"
        >
          <GoTrash aria-hidden="true" />
          <span>Bestand entfernen</span>
        </button>
        <button
          className="btn"
          disabled={isProcessing}
          onClick={onClearSelection}
          type="button"
        >
          Auswahl aufheben
        </button>
      </div>
      {error ? (
        <div aria-live="assertive" className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {/* TODO: Replace window.confirm usage with shared dialog service for consistent UX. */}
    </div>
  );
}
