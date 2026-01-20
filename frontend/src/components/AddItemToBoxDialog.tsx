import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Item } from '../../../models';
import { ensureUser } from '../lib/user';
import { logger } from '../utils/logger';
import { dialogService } from './dialog';
import { DialogButtons, DialogContent, DialogOverlay } from './dialog/presentational';
import { GoSearch } from 'react-icons/go';

// TODO: Evaluate migrating this dialog into the shared dialog queue for automated focus management.
// TODO(deep-search): Add an opt-in toggle so users can choose deep search in this dialog.

interface Props {
  boxId: string;
  onAdded: () => void;
  onClose: () => void;
}

export const SEARCH_PROMPT_MESSAGE = 'Gib einen Suchbegriff ein, um Artikel zu finden.';
export const NO_RESULTS_MESSAGE = 'Keine Ergebnisse gefunden.';
export const FILTERED_RESULTS_HIDDEN_MESSAGE =
  'Alle gefundenen Artikel sind bereits einem Behälter zugeordnet. Filter deaktivieren, um sie anzuzeigen.';

export function filterSearchResults(items: Item[], hidePlaced: boolean): Item[] {
  if (!hidePlaced) {
    return items;
  }

  return items.filter(item => !item.BoxID);
}

export interface EmptyStateOptions {
  hasSearched: boolean;
  totalResults: number;
  visibleResults: number;
  hidePlaced: boolean;
  hiddenResultCount: number;
}

export function getEmptyStateMessage({
  hasSearched,
  totalResults,
  visibleResults,
  hidePlaced,
  hiddenResultCount
}: EmptyStateOptions): string {
  if (!hasSearched) {
    return SEARCH_PROMPT_MESSAGE;
  }

  if (visibleResults > 0) {
    return '';
  }

  if (hidePlaced && totalResults > 0 && hiddenResultCount === totalResults) {
    return FILTERED_RESULTS_HIDDEN_MESSAGE;
  }

  return NO_RESULTS_MESSAGE;
}

export async function confirmItemRelocationIfNecessary(item: Item, targetBoxId: string) {
  if (!item.BoxID || item.BoxID === targetBoxId) {
    return true;
  }

  return dialogService.confirm({
    title: 'Artikel verschieben',
    message: `Artikel ist bereits in Behälter ${item.BoxID}. Verschieben?`,
    confirmLabel: 'Verschieben',
    cancelLabel: 'Abbrechen'
  });
}

export default function AddItemToBoxDialog({ boxId, onAdded, onClose }: Props) {
  const searchLimit = 50;
  const searchScope = 'instances';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  // TODO: Persist filter preferences for the add-item dialog per user session to reduce repetitive toggling.
  const [hidePlaced, setHidePlaced] = useState(true);

  const filteredResults = useMemo(() => filterSearchResults(results, hidePlaced), [results, hidePlaced]);
  const hiddenResultCount = hidePlaced ? results.length - filteredResults.length : 0;
  const emptyStateMessage = useMemo(
    () =>
      getEmptyStateMessage({
        hasSearched,
        totalResults: results.length,
        visibleResults: filteredResults.length,
        hidePlaced,
        hiddenResultCount
      }),
    [filteredResults.length, hasSearched, hidePlaced, hiddenResultCount, results.length]
  );

  const handleDismiss = useCallback(() => {
    try {
      onClose();
    } catch (error) {
      console.error('Failed to close add-item dialog', error);
    }
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDismiss]);

  useEffect(() => {
    if (!hasSearched) {
      return;
    }

    console.log(
      'AddItemToBoxDialog: displaying search results',
      {
        visible: filteredResults.length,
        total: results.length,
        hidePlaced,
        hidden: hiddenResultCount
      }
    );
  }, [filteredResults.length, hasSearched, hidePlaced, hiddenResultCount, results.length]);

  const handleHidePlacedChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const { checked } = event.target;
      console.log('AddItemToBoxDialog: hide placed items toggled', { hidePlaced: checked });
      setHidePlaced(checked);
    } catch (error) {
      console.error('Failed to toggle hide placed items filter', error);
    }
  }, []);

  async function runSearch() {
    const term = query.trim();
    setResults([]);
    if (!term) {
      setHasSearched(false);
      return;
    }
    setHasSearched(true);
    try {
      logger.info('AddItemToBoxDialog: running search', {
        term,
        limit: searchLimit,
        scope: searchScope
      });
      const params = new URLSearchParams({
        term,
        limit: String(searchLimit),
        scope: searchScope
      });
      const r = await fetch(`/api/search?${params.toString()}`);
      if (!r.ok) {
        console.error('search failed', r.status);
        return;
      }
      const data = await r.json();
      const items = (data.items || []) as Item[];
      console.log('AddItemToBoxDialog: raw search results received', { total: items.length });
      setResults(items);
    } catch (err) {
      console.error('search failed', err);
    }
  }

  async function addToBox(item: Item) {
    const actor = await ensureUser();
    if (!actor) {
      console.info('Add to box aborted: missing username.');
      try {
        await dialogService.alert({
          title: 'Aktion nicht möglich',
          message: 'Bitte zuerst oben den Benutzer setzen.'
        });
      } catch (error) {
        console.error('Failed to display missing user alert for add-to-box action', error);
      }
      return;
    }
    try {
      const confirmed = await confirmItemRelocationIfNecessary(item, boxId);
      if (!confirmed) {
        return;
      }
      const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toBoxId: boxId, actor })
      });
      if (res.ok) {
        console.log('Added item to box', item.ItemUUID, boxId);
        try {
          onAdded();
        } catch (callbackError) {
          console.error('Failed to run add-item success callback', callbackError);
        }
        handleDismiss();
      } else {
        console.error('add to box failed', res.status);
      }
    } catch (err) {
      console.error('add to box error', err);
    }
  }

  return (
    <DialogOverlay onDismiss={handleDismiss}>
      <DialogContent
        className="add-item-dialog"
        heading="Artikel suchen"
        message="Suche nach einem Artikel, um ihn in den Behälter zu legen."
      >
        <div className="add-item-dialog__search">
          <input
            id='item-search-input'
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                runSearch();
              }
            }}
            autoFocus
            aria-label="Artikel suchen"
          />
          <button
            className="btn"
            onClick={runSearch}
            type="button"
            disabled={!query.trim()}
          >
            <GoSearch />
          </button>
        </div>
        <div className="add-item-dialog__filters">
          <label htmlFor="hide-placed-items-toggle" className="add-item-dialog__filter-option">
            <input
              id="hide-placed-items-toggle"
              type="checkbox"
              checked={hidePlaced}
              onChange={handleHidePlacedChange}
            />
            Bereits zugeordnete Artikel ausblenden
          </label>
        </div>
        <div className="add-item-dialog__results" role="list">
          {filteredResults.length > 0 ? (
            filteredResults.map(it => (
              <div key={it.ItemUUID} className="add-item-dialog__result card" role="listitem">
                <div className="add-item-dialog__result-heading">
                  <strong>{it.Artikel_Nummer || it.ItemUUID}</strong>
                </div>
                <div className="add-item-dialog__result-description">{it.Artikelbeschreibung}</div>
                <button className="btn" onClick={() => addToBox(it)} type="button">Auswählen</button>
              </div>
            ))
          ) : (
            <p className="add-item-dialog__empty muted">
              {emptyStateMessage || NO_RESULTS_MESSAGE}
            </p>
          )}
        </div>
        <DialogButtons
          type="alert"
          confirmLabel="Abbrechen"
          onConfirm={handleDismiss}
          onCancel={handleDismiss}
        />
      </DialogContent>
    </DialogOverlay>
  );
}
