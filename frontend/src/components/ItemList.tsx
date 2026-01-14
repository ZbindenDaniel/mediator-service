import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AgenticRunStatus, Item } from '../../../models';
import { AGENTIC_RUN_STATUS_NOT_STARTED } from '../../../models';
import BoxTag from './BoxTag';
import QualityBadge from './QualityBadge';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';

// TODO(agent): Confirm item list location tags remain legible without the color metadata.
// TODO: Replace plain table layout with a virtualized list for better performance on large datasets.
// TODO(agentic): Expand item list columns and responsive styling for enriched item metadata.
// TODO(agentic-status-ui): Replace plain status text with badges once status icons are available.

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
            <th className="col-uuid optional-column">UUID</th>
            <th className="col-number">A-Nr</th>
            <th className="col-desc">Artikel</th>
            <th className="col-box">Behälter</th>
            <th className="col-location">Lagerort</th>
            <th className="col-agentic optional-column">Agentic</th>
            <th className="col-stock optional-column">Auf Lager</th>
            <th className="col-quality optional-column">Qualität</th>
            <th className="col-subcategory optional-column">Unterkategorie A</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.map(it => {
            const locationKey = it.Location?.trim() || it.BoxID?.trim() || undefined;
            const boxLabel = it.BoxID?.trim() || '?';
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
            const stockValue = typeof it.Auf_Lager === 'number' ? it.Auf_Lager : null;
            const subcategoryValue =
              typeof it.Unterkategorien_A === 'number'
                ? it.Unterkategorien_A
                : (typeof it.Unterkategorien_A === 'string' ? it.Unterkategorien_A : null);
            const agenticStatus = (it.AgenticStatus ?? AGENTIC_RUN_STATUS_NOT_STARTED) as AgenticRunStatus | null;
            const agenticLabel = describeAgenticStatus(agenticStatus);
            const qualityValue = typeof it.Quality === 'number' ? it.Quality : null;

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
                <td className="col-uuid optional-column">{it.ItemUUID}</td>
                <td className="col-number">{it.Artikel_Nummer?.trim() || '—'}</td>
                <td className="col-desc">{it.Artikelbeschreibung}</td>
                <td className="col-box">
                  <Link to={boxLinkTarget}>
                    {boxLabel}
                  </Link>
                </td>
                <td className="col-location">
                  <BoxTag locationKey={locationKey} />
                </td>
                <td className="col-agentic optional-column">{agenticLabel}</td>
                <td className="col-stock optional-column">{stockValue ?? '—'}</td>
                <td className="col-quality optional-column">
                  <QualityBadge compact value={qualityValue} />
                </td>
                <td className="col-subcategory optional-column">{subcategoryValue ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
