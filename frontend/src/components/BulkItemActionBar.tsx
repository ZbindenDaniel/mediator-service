import React, { useMemo, useState } from 'react';
import { GoMoveToEnd, GoPackageDependents, GoSync, GoTrash, GoXCircle } from 'react-icons/go';
import type { Item } from '../../../models';
import BoxSearchInput, { BoxSuggestion } from './BoxSearchInput';
import { dialogService } from './dialog';
import { createBoxForRelocation, ensureActorOrAlert } from './relocation/relocationHelpers';
import { ensureUser } from '../lib/user';
import { logger } from '../utils/logger';

// TODO(agentic): Introduce bulk agentic trigger entry point alongside relocation actions.
// TODO(agent): Fold ERP sync UX into shared bulk action helpers once backend status polling exists.

interface BulkItemActionBarProps {
  selectedIds: string[];
  selectedItems?: Item[];
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
  selectedItems = [],
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

  async function handleBulkAgenticStart(): Promise<void> {
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für die Aktion ausgewählt.' });
      return;
    }

    setFeedback(null);
    // TODO(agentic-bulk): Ensure bulk agentic triggers only use Artikel_Nummer once list payloads always include it.
    const itemMap = new Map<string, Item>();
    selectedItems.forEach((item) => {
      if (item?.ItemUUID) {
        itemMap.set(item.ItemUUID, item);
      }
    });

    const previewEntries = selectedIds.slice(0, 3).map((itemId) => {
      const record = itemMap.get(itemId);
      return record?.Artikelbeschreibung || record?.Artikel_Nummer || itemId;
    });

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Ki starten',
        message: (
          <div className="bulk-item-action-bar__confirm-content">
            <p>Sollen KI Läufe für die Auswahl gestartet werden?</p>
            <ul>
              <li>{selectionLabel}</li>
              {previewEntries.map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
              {selectedIds.length > previewEntries.length ? (
                <li>…und weitere {selectedIds.length - previewEntries.length}</li>
              ) : null}
            </ul>
          </div>
        ),
        confirmLabel: 'Starten',
        cancelLabel: 'Abbrechen'
      });
      console.info('Bulk agentic confirmation resolved', {
        confirmed,
        selectionCount: selectedCount
      });
    } catch (dialogError) {
      console.error('Bulk agentic confirmation dialog failed', dialogError);
      setFeedback({ type: 'error', message: 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.' });
      return;
    }

    if (!confirmed) {
      console.info('Bulk agentic start cancelled via dialog', { selectionCount: selectedCount });
      return;
    }

    setIsProcessing(true);
    const failures: string[] = [];
    let successCount = 0;

    try {
      for (const itemId of selectedIds) {
        const detail = itemMap.get(itemId);
        const artikelbeschreibung = detail?.Artikelbeschreibung?.trim()
          || detail?.Artikel_Nummer?.trim()
          || itemId;

        if (!artikelbeschreibung) {
          failures.push(`${itemId}: fehlende Artikelbeschreibung`);
          continue;
        }

        let artikelNummer: string | null = null;
        try {
          if (typeof detail?.Artikel_Nummer === 'string') {
            const trimmedArtikelNummer = detail.Artikel_Nummer.trim();
            artikelNummer = trimmedArtikelNummer ? trimmedArtikelNummer : null;
          }
        } catch (normalizationError) {
          logger.warn?.('Bulk agentic Artikel_Nummer normalization failed', {
            itemId,
            error: normalizationError
          });
        }

        if (!artikelNummer) {
          logger.warn?.('Bulk agentic skipped: Artikel_Nummer missing', {
            itemId
          });
          failures.push(`${itemId}: fehlende Artikel_Nummer`);
          continue;
        }

        try {
          const response = await fetch('/api/agentic/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: 'item-list-bulk',
              payload: {
                artikelNummer,
                artikelbeschreibung
              }
            })
          });

          if (!response.ok) {
            const message = await readErrorMessage(response);
            console.error('Bulk agentic start failed', { itemId, status: response.status, message });
            failures.push(`${itemId}: ${message}`);
            continue;
          }

          successCount += 1;
          console.info('Bulk agentic start dispatched', { itemId, artikelbeschreibung });
        } catch (requestError) {
          console.error('Bulk agentic start request failed', { itemId, requestError });
          failures.push(`${itemId}: ${(requestError as Error).message || 'Request fehlgeschlagen'}`);
        }
      }

      if (successCount) {
        try {
          onClearSelection();
          if (onActionComplete) {
            await onActionComplete();
          }
        } catch (afterSuccessError) {
          console.error('Bulk agentic post-success handler failed', afterSuccessError);
        }
      }

      if (failures.length && successCount) {
        setFeedback({
          type: 'error',
          message: `${successCount} Läufe gestartet, ${failures.length} fehlgeschlagen: ${failures.slice(0, 3).join('; ')}`
        });
        return;
      }

      if (failures.length) {
        setFeedback({
          type: 'error',
          message: `Ki-Start fehlgeschlagen: ${failures.slice(0, 3).join('; ')}`
        });
        return;
      }

      setFeedback({
        type: 'info',
        message: `Ki-Läufe für ${successCount} Artikel gestartet.`
      });
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleBulkSyncToErp(): Promise<void> {
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für die Aktion ausgewählt.' });
      return;
    }

    setFeedback(null);

    let confirmed = false;
    try {
      dialogService.alert({
        title: 'Kivitendo Sync',
        message: (
          <div className="bulk-item-action-bar__confirm-content">
            <p>Diese Funktion ist zur Zeit nicht verfügbar!</p>
            <p>{selectionLabel}</p>
          </div>
        ),
      });
      // confirmed = await dialogService.confirm({
      //   title: 'Kivitendo Sync',
      //   message: (
      //     <div className="bulk-item-action-bar__confirm-content">
      //       <p>Sollen die ausgewählten Artikel an das ERP synchronisiert werden?</p>
      //       <p>{selectionLabel}</p>
      //     </div>
      //   ),
      //   confirmLabel: 'Sync starten',
      //   cancelLabel: 'Abbrechen'
      // });
      console.info('Bulk ERP sync confirmation resolved', {
        confirmed,
        selectionCount: selectedCount
      });
    } catch (dialogError) {
      console.error('Bulk ERP sync confirmation dialog failed', dialogError);
      setFeedback({ type: 'error', message: 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.' });
      return;
    }

    if (!confirmed) {
      console.info('Bulk ERP sync cancelled via dialog', { selectionCount: selectedCount });
      return;
    }

    setIsProcessing(true);
    try {
      const actor = await ensureActorOrAlert({
        context: 'bulk sync erp',
        resolveActor: effectiveResolveActor
      });
      if (!actor) {
        setFeedback({
          type: 'error',
          message: 'Aktion abgebrochen: Es wurde kein Benutzername angegeben.'
        });
        return;
      }

      console.log('Bulk ERP sync requested', {
        count: selectedCount,
        selectedIds
      });

      const response = await fetch('/api/sync/erp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actor,
          itemIds: selectedIds
        })
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        console.error('Bulk ERP sync failed', { status: response.status, message });
        setFeedback({ type: 'error', message });
        return;
      }

      let payload: any = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        console.warn('Bulk ERP sync response parsing failed', parseError);
      }

      console.info('Bulk ERP sync completed', {
        count: selectedCount,
        itemCount: payload?.itemCount ?? selectedCount,
        includeMedia: payload?.includeMedia
      });

      await handleAfterSuccess();
      setFeedback({
        type: 'info',
        message: `ERP-Sync für ${payload?.itemCount ?? selectedCount} Artikel ausgelöst.`
      });
    } catch (error) {
      console.error('Bulk ERP sync request failed', error);
      setFeedback({
        type: 'error',
        message: (error as Error).message || 'Unbekannter Fehler beim ERP Sync.'
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
    <div id="bulk-item-action-bar" className="card relocate-card bulk-item-action-bar" data-testid="bulk-item-action-bar">
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
          className="bulk-item-action-bar__button"
          disabled={isProcessing || !hasSelection}
          onClick={() => {
            void handleBulkAgenticStart();
          }}
          type="button"
        >
          <span>Ki starten</span>
        </button>

        <button
          className="bulk-item-action-bar__button"
          disabled={isProcessing || !hasSelection}
          onClick={() => {
            void handleBulkSyncToErp();
          }}
          type="button"
        >
          <GoSync aria-hidden="true" />
          <span>Sync to ERP</span>
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
