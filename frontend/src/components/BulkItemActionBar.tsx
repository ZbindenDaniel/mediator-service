import React, { useMemo, useRef, useState } from 'react';
import { GoCpu, GoDownload, GoMoveToEnd, GoPackageDependents, GoSync, GoTag, GoTrash, GoXCircle } from 'react-icons/go';
import type { Item } from '../../../models';
import {
  AGENTIC_RUN_STATUS_QUEUED,
  AGENTIC_RUN_STATUS_RUNNING
} from '../../../models';
import BoxSearchInput, { BoxSuggestion } from './BoxSearchInput';
import { dialogService } from './dialog';
import { createBoxForRelocation, ensureActorOrAlert } from './relocation/relocationHelpers';
import { ensureUser } from '../lib/user';
import { logger } from '../utils/logger';

// TODO(agentic): Introduce bulk agentic trigger entry point alongside relocation actions.
// TODO(agent): Fold ERP sync UX into shared bulk action helpers once backend status polling exists.
// TODO(agent): Show ERP sync availability from a dedicated status endpoint when available.
// TODO(item-list-export): Keep selection export column compact in the action bar and reuse this serialization helper for future bulk exports.

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

const FILTERED_ITEM_EXPORT_COLUMNS = [
  'ItemUUID',
  'Artikel_Nummer',
  'Artikelbeschreibung',
  'BoxID',
  'Location',
  'Menge',
  'Quality',
  'Shopartikel',
  'Veröffentlicht_Status',
  'Unterkategorien_A',
  'Datum_erfasst'
] as const;

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildFilteredItemsCsv(items: readonly Item[]): string {
  const headers = FILTERED_ITEM_EXPORT_COLUMNS.join(',');
  const rows = items.map((item) => (
    FILTERED_ITEM_EXPORT_COLUMNS
      .map((column) => escapeCsvValue(item[column]))
      .join(',')
  ));
  return [headers, ...rows].join('\n');
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

type KiAction = 'start' | 'stop';

interface KiActionFormProps {
  selectedItems: Item[];
  onChange: (action: KiAction) => void;
}

function KiActionForm({ selectedItems, onChange }: KiActionFormProps) {
  const [action, setAction] = useState<KiAction>('start');

  const startableCount = selectedItems.filter((item) =>
    item.AgenticStatus !== AGENTIC_RUN_STATUS_RUNNING
    && item.AgenticStatus !== AGENTIC_RUN_STATUS_QUEUED
  ).length;
  const stoppableCount = selectedItems.filter((item) =>
    item.AgenticStatus === AGENTIC_RUN_STATUS_RUNNING
  ).length;

  function select(a: KiAction) {
    setAction(a);
    onChange(a);
  }

  return (
    <div className="ki-action-form">
      <label className={`ki-action-form__option${action === 'start' ? ' ki-action-form__option--selected' : ''}`}>
        <input
          type="radio"
          name="ki-action"
          checked={action === 'start'}
          onChange={() => { select('start'); }}
        />
        <span className="ki-action-form__option-body">
          <span className="ki-action-form__label">Starten</span>
          <span className="ki-action-form__count">{startableCount} Artikel starten</span>
        </span>
      </label>
      {stoppableCount > 0 ? (
        <label className={`ki-action-form__option${action === 'stop' ? ' ki-action-form__option--selected' : ''}`}>
          <input
            type="radio"
            name="ki-action"
            checked={action === 'stop'}
            onChange={() => { select('stop'); }}
          />
          <span className="ki-action-form__option-body">
            <span className="ki-action-form__label">Stoppen</span>
            <span className="ki-action-form__count">{stoppableCount} laufende Artikel stoppen</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

interface ShopStatusValues {
  shopartikel: number | null;
  veröffentlicht: string | null;
  verkaufspreis: number | null;
}

interface ShopStatusFormProps {
  onChange: (values: ShopStatusValues) => void;
}

function ShopStatusForm({ onChange }: ShopStatusFormProps) {
  const [shopartikel, setShopartikel] = useState<number | null>(null);
  const [veröffentlicht, setVeröffentlicht] = useState<string | null>(null);
  const [verkaufspreis, setVerkaufspreis] = useState<number | null>(null);
  const [shopartikelEnabled, setShopartikelEnabled] = useState(false);
  const [veröffentlichtEnabled, setVeröffentlichtEnabled] = useState(false);
  const [verkaufspreisEnabled, setVerkaufspreisEnabled] = useState(false);

  function update(patch: Partial<ShopStatusValues>) {
    const next: ShopStatusValues = {
      shopartikel: patch.shopartikel !== undefined ? patch.shopartikel : shopartikel,
      veröffentlicht: patch.veröffentlicht !== undefined ? patch.veröffentlicht : veröffentlicht,
      verkaufspreis: patch.verkaufspreis !== undefined ? patch.verkaufspreis : verkaufspreis
    };
    onChange(next);
  }

  return (
    <div className="shop-status-form">
      <div className="shop-status-form__row">
        <label className="shop-status-form__enable">
          <input
            type="checkbox"
            checked={shopartikelEnabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setShopartikelEnabled(enabled);
              const val = enabled ? 1 : null;
              setShopartikel(val);
              update({ shopartikel: val });
            }}
          />
          <span>Shopartikel</span>
        </label>
        {shopartikelEnabled ? (
          <input
            type="checkbox"
            role="switch"
            className="item-form__binary-switch"
            checked={shopartikel === 1}
            onChange={(e) => {
              const val = e.target.checked ? 1 : 0;
              setShopartikel(val);
              update({ shopartikel: val });
            }}
          />
        ) : (
          <span className="muted shop-status-form__unchanged">nicht ändern</span>
        )}
      </div>

      <div className="shop-status-form__row">
        <label className="shop-status-form__enable">
          <input
            type="checkbox"
            checked={veröffentlichtEnabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setVeröffentlichtEnabled(enabled);
              const val = enabled ? 'yes' : null;
              setVeröffentlicht(val);
              update({ veröffentlicht: val });
            }}
          />
          <span>Veröffentlicht</span>
        </label>
        {veröffentlichtEnabled ? (
          <input
            type="checkbox"
            role="switch"
            className="item-form__binary-switch"
            checked={veröffentlicht === 'yes'}
            onChange={(e) => {
              const val = e.target.checked ? 'yes' : 'no';
              setVeröffentlicht(val);
              update({ veröffentlicht: val });
            }}
          />
        ) : (
          <span className="muted shop-status-form__unchanged">nicht ändern</span>
        )}
      </div>

      <div className="shop-status-form__row">
        <label className="shop-status-form__enable">
          <input
            type="checkbox"
            checked={verkaufspreisEnabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setVerkaufspreisEnabled(enabled);
              const val = enabled ? 0 : null;
              setVerkaufspreis(val);
              update({ verkaufspreis: val });
            }}
          />
          <span>Verkaufspreis (CHF)</span>
        </label>
        {verkaufspreisEnabled ? (
          <input
            type="number"
            step="0.01"
            min="0"
            className="shop-status-form__price-input"
            value={verkaufspreis ?? 0}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              const val = Number.isFinite(parsed) ? parsed : 0;
              setVerkaufspreis(val);
              update({ verkaufspreis: val });
            }}
          />
        ) : (
          <span className="muted shop-status-form__unchanged">nicht ändern</span>
        )}
      </div>
    </div>
  );
}

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
  const shopFormRef = useRef<ShopStatusValues>({ shopartikel: null, veröffentlicht: null, verkaufspreis: null });
  const kiActionRef = useRef<KiAction>('start');
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

  async function handleBulkKi(): Promise<void> {
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für die Aktion ausgewählt.' });
      return;
    }

    setFeedback(null);
    kiActionRef.current = 'start';

    // TODO(agentic-bulk): Ensure bulk agentic triggers only use Artikel_Nummer once list payloads always include it.
    const itemMap = new Map<string, Item>();
    selectedItems.forEach((item) => {
      if (item?.ItemUUID) {
        itemMap.set(item.ItemUUID, item);
      }
    });

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'KI',
        message: (
          <KiActionForm
            selectedItems={selectedItems}
            onChange={(action) => { kiActionRef.current = action; }}
          />
        ),
        confirmLabel: 'Ausführen',
        cancelLabel: 'Abbrechen'
      });
      console.info('Bulk KI action dialog resolved', {
        confirmed,
        action: kiActionRef.current,
        selectionCount: selectedCount
      });
    } catch (dialogError) {
      console.error('Bulk KI action dialog failed', dialogError);
      setFeedback({ type: 'error', message: 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.' });
      return;
    }

    if (!confirmed) {
      return;
    }

    if ((kiActionRef.current as KiAction) === 'stop') {
      // Stop: cancel only currently running runs; others are silently ignored.
      const actor = await ensureActorOrAlert({
        context: 'bulk agentic stop',
        resolveActor: effectiveResolveActor
      });
      if (!actor) {
        setFeedback({ type: 'error', message: 'Aktion abgebrochen: Es wurde kein Benutzername angegeben.' });
        return;
      }

      const runningItems = selectedItems.filter(
        (item) => item.AgenticStatus === AGENTIC_RUN_STATUS_RUNNING
      );

      if (runningItems.length === 0) {
        setFeedback({ type: 'info', message: 'Keine laufenden Artikel in der Auswahl.' });
        return;
      }

      setIsProcessing(true);
      const failures: string[] = [];
      let successCount = 0;

      try {
        for (const item of runningItems) {
          const artikelNummer = item.Artikel_Nummer?.trim();
          if (!artikelNummer) {
            failures.push(`${item.ItemUUID}: fehlende Artikel_Nummer`);
            continue;
          }
          try {
            const response = await fetch(`/api/item-refs/${encodeURIComponent(artikelNummer)}/agentic/cancel`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ actor, reason: 'bulk-stop' })
            });
            if (!response.ok) {
              const message = await readErrorMessage(response);
              console.error('Bulk agentic stop failed', { artikelNummer, status: response.status, message });
              failures.push(`${artikelNummer}: ${message}`);
              continue;
            }
            successCount += 1;
            console.info('Bulk agentic stop dispatched', { artikelNummer });
          } catch (requestError) {
            console.error('Bulk agentic stop request failed', { artikelNummer, requestError });
            failures.push(`${artikelNummer}: ${(requestError as Error).message || 'Request fehlgeschlagen'}`);
          }
        }

        if (successCount) {
          try {
            onClearSelection();
            if (onActionComplete) {
              await onActionComplete();
            }
          } catch (afterSuccessError) {
            console.error('Bulk agentic stop post-success handler failed', afterSuccessError);
          }
        }

        if (failures.length && successCount) {
          setFeedback({
            type: 'error',
            message: `${successCount} Läufe gestoppt, ${failures.length} fehlgeschlagen: ${failures.slice(0, 3).join('; ')}`
          });
          return;
        }
        if (failures.length) {
          setFeedback({ type: 'error', message: `Ki-Stop fehlgeschlagen: ${failures.slice(0, 3).join('; ')}` });
          return;
        }
        setFeedback({ type: 'info', message: `${successCount} KI-Läufe gestoppt.` });
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Start: queue new runs or re-queue finished/failed runs; already-active runs are ignored by the API.
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
          logger.warn?.('Bulk agentic skipped: Artikel_Nummer missing', { itemId });
          failures.push(`${itemId}: fehlende Artikel_Nummer`);
          continue;
        }

        try {
          const response = await fetch('/api/agentic/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: 'item-list-bulk',
              payload: { artikelNummer, artikelbeschreibung }
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
        setFeedback({ type: 'error', message: `Ki-Start fehlgeschlagen: ${failures.slice(0, 3).join('; ')}` });
        return;
      }
      setFeedback({ type: 'info', message: `Ki-Läufe für ${successCount} Artikel in die Warteschlange gestellt.` });
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
      confirmed = await dialogService.confirm({
        title: 'Kivitendo Sync',
        message: (
          <div className="bulk-item-action-bar__confirm-content">
            <p>Sollen die ausgewählten Artikel an das ERP synchronisiert werden?</p>
            <p>{selectionLabel}</p>
          </div>
        ),
        confirmLabel: 'Sync starten',
        cancelLabel: 'Abbrechen'
      });
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

  async function handleBulkUpdateShopStatus(): Promise<void> {
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für die Aktion ausgewählt.' });
      return;
    }

    setFeedback(null);
    shopFormRef.current = { shopartikel: null, veröffentlicht: null, verkaufspreis: null };

    let confirmed = false;
    try {
      confirmed = await dialogService.confirm({
        title: 'Shopstatus setzen',
        message: (
          <ShopStatusForm
            onChange={(values) => {
              shopFormRef.current = values;
            }}
          />
        ),
        confirmLabel: 'Setzen',
        cancelLabel: 'Abbrechen'
      });
    } catch (dialogError) {
      console.error('Shop status confirmation dialog failed', dialogError);
      setFeedback({ type: 'error', message: 'Bestätigung fehlgeschlagen. Bitte erneut versuchen.' });
      return;
    }

    if (!confirmed) {
      return;
    }

    const actor = await ensureActorOrAlert({
      context: 'bulk update shop status',
      resolveActor: effectiveResolveActor
    });
    if (!actor) {
      setFeedback({ type: 'error', message: 'Aktion abgebrochen: Es wurde kein Benutzername angegeben.' });
      return;
    }

    setIsProcessing(true);
    try {
      const { shopartikel, veröffentlicht, verkaufspreis } = shopFormRef.current;
      console.log('bulk update shop status requested', {
        count: selectedCount,
        shopartikel,
        veröffentlicht,
        verkaufspreis
      });

      const response = await fetch('/api/items/bulk/update-ref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: selectedIds,
          shopartikel,
          veröffentlicht,
          verkaufspreis,
          actor,
          confirm: true
        })
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        console.error('Bulk shop status update failed', { status: response.status, message });
        setFeedback({ type: 'error', message });
        return;
      }

      console.log('Bulk shop status update completed', { count: selectedCount });
      await handleAfterSuccess();
      setFeedback({ type: 'info', message: `Shopstatus für ${selectedCount} Artikel aktualisiert.` });
    } catch (err) {
      console.error('Bulk shop status update request failed', err);
      setFeedback({
        type: 'error',
        message: (err as Error).message || 'Unbekannter Fehler beim Setzen des Shopstatus.'
      });
    } finally {
      setIsProcessing(false);
    }
  }

  function handleExportSelection(): void {
    if (!hasSelection) {
      setFeedback({ type: 'error', message: 'Keine Artikel für den Export ausgewählt.' });
      return;
    }

    try {
      const selectedLookup = new Set(selectedIds);
      const selectedRows = selectedItems.filter((item) => selectedLookup.has(item.ItemUUID));
      const csv = buildFilteredItemsCsv(selectedRows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'filtered-items.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setFeedback({
        type: 'info',
        message: `${selectedRows.length} Artikel als filtered-items.csv exportiert.`
      });
      logger.info?.('Item list selection exported', {
        selectedCount,
        exportedCount: selectedRows.length,
        fileName: 'filtered-items.csv'
      });
    } catch (error) {
      logger.error?.('Failed to export selected items as CSV', {
        selectedCount,
        error
      });
      setFeedback({
        type: 'error',
        message: 'Export fehlgeschlagen. Bitte erneut versuchen.'
      });
    }
  }

  return (
    <div id="bulk-item-action-bar" className="card relocate-card bulk-item-action-bar" data-testid="bulk-item-action-bar">
      <div className="bulk-item-action-bar__summary">
        <strong>{selectionLabel}</strong>
        {isProcessing ? <span className="muted"> Verarbeitung…</span> : null}
      </div>
      <div className="bulk-item-action-bar__controls">
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
        </div>
      </div>

      <div className="bulk-item-action-bar__buttons row">

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
            void handleBulkKi();
          }}
          type="button"
        >
          <GoCpu aria-hidden="true" />
          <span>KI</span>
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
          <span>Kivi Sync 🥝</span>
        </button>

        <button
          className="bulk-item-action-bar__button"
          disabled={isProcessing || !hasSelection}
          onClick={() => {
            void handleBulkUpdateShopStatus();
          }}
          type="button"
        >
          <GoTag aria-hidden="true" />
          <span>Shopstatus</span>
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
          className="bulk-item-action-bar__button bulk-item-action-bar__button--export"
          disabled={isProcessing || !hasSelection}
          onClick={handleExportSelection}
          type="button"
        >
          <GoDownload aria-hidden="true" />
          <span>Export CSV</span>
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
