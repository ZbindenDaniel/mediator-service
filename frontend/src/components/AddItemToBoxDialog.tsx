import React, { useCallback, useEffect, useState } from 'react';
import type { Item } from '../../../models';
import { ensureUser } from '../lib/user';
import { dialogService } from './dialog';
import { DialogButtons, DialogContent, DialogOverlay } from './dialog/presentational';

// TODO: Evaluate migrating this dialog into the shared dialog queue for automated focus management.

interface Props {
  boxId: string;
  onAdded: () => void;
  onClose: () => void;
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

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

  async function runSearch() {
    const term = query.trim();
    setResults([]);
    if (!term) {
      setHasSearched(false);
      return;
    }
    setHasSearched(true);
    try {
      console.log('Searching items for', term);
      const r = await fetch('/api/search?term=' + encodeURIComponent(term));
      if (!r.ok) {
        console.error('search failed', r.status);
        return;
      }
      const data = await r.json();
      setResults((data.items || []) as Item[]);
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
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                runSearch();
              }
            }}
            autoFocus
          />
          <button
            className="btn"
            onClick={runSearch}
            type="button"
            disabled={!query.trim()}
          >
            Suchen
          </button>
        </div>
        <div className="add-item-dialog__results" role="list">
          {results.length > 0 ? (
            results.map(it => (
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
              {hasSearched ? 'Keine Ergebnisse gefunden.' : 'Gib einen Suchbegriff ein, um Artikel zu finden.'}
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
