import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Item } from '../../../models';
import BoxColorTag from './BoxColorTag';

// TODO: Replace plain table layout with a virtualized list for better performance on large datasets.

interface Props {
  items: Item[];
  selectedItemIds: Set<string>;
  onToggleItem: (itemId: string, nextValue: boolean) => void;
  onToggleAll: (nextValue: boolean) => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
}

function shouldIgnoreInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveSelector = 'button, input, select, textarea, label, a';
  return Boolean(target.closest(interactiveSelector));
}

export default function ItemList({
  items,
  selectedItemIds,
  onToggleItem,
  onToggleAll,
  allVisibleSelected,
  someVisibleSelected
}: Props) {
  const safeItems = items ?? [];
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const navigateToItemDetail = useCallback((itemId: string, source: 'click' | 'keyboard') => {
    try {
      console.info('Navigating to item detail from item list row', { itemId, source });
      navigate(`/items/${encodeURIComponent(itemId)}`);
    } catch (navigationError) {
      console.error('Failed to navigate to item detail from item list row', {
        itemId,
        source,
        navigationError
      });
    }
  }, [navigate]);
  const headerLabel = useMemo(() => {
    if (allVisibleSelected) {
      return 'Alle sichtbaren Artikel abwählen';
    }
    if (someVisibleSelected) {
      return 'Sichtbare Auswahl zurücksetzen';
    }
    return 'Alle sichtbaren Artikel auswählen';
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allVisibleSelected && someVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  return (
    <div className="item-list-wrapper">
      <table className="item-list">
        <thead>
          <tr className="item-list-header">
            <th className="col-id" style={{ display: 'none' }}>Id</th>
            <th className="col-select">
              <input
                aria-label={headerLabel}
                checked={allVisibleSelected}
                onChange={(event) => onToggleAll(event.target.checked)}
                ref={selectAllRef}
                type="checkbox"
              />
            </th>
            <th className="col-number">Artikel-nummer</th>
            <th className="col-desc">Artikel</th>
            <th className="col-box">Behälter</th>
            <th className="col-location">Lagerort</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.map(it => {
            const locationKey = it.Location?.trim() || it.BoxID?.trim() || undefined;
            const boxLabel = it.BoxID?.trim() || 'Unbekannter Behälter';
            const boxLinkTarget = it.BoxID
              ? `/boxes/${encodeURIComponent(it.BoxID)}`
              : '/boxes';
            const isSelected = selectedItemIds.has(it.ItemUUID);
            const checkboxLabel = it.Artikelbeschreibung?.trim()
              ? `Artikel ${it.Artikelbeschreibung} auswählen`
              : `Artikel ${it.ItemUUID} auswählen`;
            const rowLabel = it.Artikelbeschreibung?.trim()
              ? `Details für ${it.Artikelbeschreibung} öffnen`
              : `Details für Artikel ${it.ItemUUID} öffnen`;

            return (
              <tr
                key={it.ItemUUID}
                data-item-uuid={it.ItemUUID}
                className="item-list-row"
                role="button"
                tabIndex={0}
                aria-label={rowLabel}
                onClick={(event) => {
                  if (shouldIgnoreInteractiveTarget(event.target)) {
                    return;
                  }
                  event.preventDefault();
                  navigateToItemDetail(it.ItemUUID, 'click');
                }}
                onKeyDown={(event) => {
                  if (shouldIgnoreInteractiveTarget(event.target)) {
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                    event.preventDefault();
                    navigateToItemDetail(it.ItemUUID, 'keyboard');
                  }
                }}
              >
                <td className="col-id" style={{ display: 'none' }}>{it.ItemUUID}</td>
                <td className="col-select">
                  <input
                    aria-label={checkboxLabel}
                    checked={isSelected}
                    onChange={(event) => onToggleItem(it.ItemUUID, event.target.checked)}
                    type="checkbox"
                  />
                </td>
                <td className="col-number">{it.Artikel_Nummer?.trim() || '—'}</td>
                <td className="col-desc">{it.Artikelbeschreibung}</td>
                <td className="col-box">
                  <Link to={boxLinkTarget}>
                    {boxLabel}
                  </Link>
                </td>
                <td className="col-location">
                  <BoxColorTag locationKey={locationKey} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
