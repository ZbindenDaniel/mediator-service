import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AGENTIC_RUN_STATUS_NOT_STARTED } from '../../../models';
import BoxTag from './BoxTag';
import QualityBadge from './QualityBadge';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';
import type { GroupedItemDisplay } from '../lib/itemGrouping';
import { getShelfDisplayLabel } from '../lib/shelfLabel';
import { logError, logger } from '../utils/logger';

// TODO(agent): Confirm item list location tags remain legible without the color metadata.
// TODO: Replace plain table layout with a virtualized list for better performance on large datasets.
// TODO(agentic): Expand item list columns and responsive styling for enriched item metadata.
// TODO(agentic-status-ui): Replace plain status text with badges once status icons are available.
// TODO(agent): Keep BoxID (Behälter) and Location (Lagerort) normalization separate in this table.
// TODO(grouped-item-table): Validate grouped row actions once bulk operations are updated.
// TODO(bulk-display): Confirm quantity display for Einheit=Menge items in list rows once backend payloads sync.

interface Props {
  items: GroupedItemDisplay[];
  selectedItemIds: Set<string>;
  onToggleItem: (itemIds: string[], nextValue: boolean) => void;
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
            <th className="col-number">A-Nr</th>
            <th className="col-desc">Artikel</th>
            <th className="col-box">Behälter</th>
            <th className="col-location">Lagerort</th>
            <th className="col-agentic optional-column">Ki</th>
            <th className="col-stock optional-column">Anzahl</th>
            <th className="col-quality optional-column">Qualität</th>
            <th className="col-subcategory optional-column">Unterkategorie A</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.map(group => {
            const representative = group.representative;
            const groupItemIds = group.items
              .map((item) => item.ItemUUID)
              .filter((itemId): itemId is string => Boolean(itemId));
            let boxId: string | undefined;
            let shelfId: string | undefined;

            try {
              if (typeof group.summary.BoxID === 'string') {
                boxId = group.summary.BoxID.trim() || undefined;
              } else if (typeof representative?.BoxID === 'string') {
                boxId = representative.BoxID.trim() || undefined;
              } else if (group.summary.BoxID !== null && group.summary.BoxID !== undefined) {
                logger.warn('Unexpected item BoxID type', {
                  itemId: group.summary.representativeItemId,
                  boxId: group.summary.BoxID
                });
              }
            } catch (error) {
              logError('Failed to normalize item BoxID', error, {
                itemId: group.summary.representativeItemId,
                boxId: group.summary.BoxID ?? representative?.BoxID
              });
            }

            try {
              if (typeof group.summary.Location === 'string') {
                shelfId = group.summary.Location.trim() || undefined;
              } else if (typeof representative?.Location === 'string') {
                shelfId = representative.Location.trim() || undefined;
              } else if (group.summary.Location !== null && group.summary.Location !== undefined) {
                logger.warn('Unexpected item Location type', {
                  itemId: group.summary.representativeItemId,
                  location: group.summary.Location
                });
              }
            } catch (error) {
              logError('Failed to normalize item Location', error, {
                itemId: group.summary.representativeItemId,
                location: group.summary.Location ?? representative?.Location
              });
            }

            const boxLinkTarget = boxId ? `/boxes/${encodeURIComponent(boxId)}` : null;
            const shelfLinkTarget = shelfId ? `/boxes/${encodeURIComponent(shelfId)}` : null;
            const shelfLabel = getShelfDisplayLabel(shelfId);
            const isSelected = groupItemIds.length > 0 && groupItemIds.every((itemId) => selectedItemIds.has(itemId));
            const isPartiallySelected = groupItemIds.some((itemId) => selectedItemIds.has(itemId)) && !isSelected;
            const representativeLabel = representative?.Artikelbeschreibung?.trim() || group.summary.Artikel_Nummer || 'Artikelgruppe';
            const checkboxLabel = `Artikelgruppe ${representativeLabel} auswählen`;
            const rowLabel = `Details für ${representativeLabel} öffnen`;
            const countValue = Number.isFinite(group.displayCount)
              ? group.displayCount
              : group.summary.count;
            const subcategoryValue = group.summary.Category
              ?? (typeof representative?.Unterkategorien_A === 'number'
                ? String(representative.Unterkategorien_A)
                : (typeof representative?.Unterkategorien_A === 'string' ? representative.Unterkategorien_A : null));
            const agenticStatus = group.agenticStatusSummary ?? AGENTIC_RUN_STATUS_NOT_STARTED;
            const agenticLabel = describeAgenticStatus(agenticStatus);
            const qualityValue = typeof group.summary.Quality === 'number'
              ? group.summary.Quality
              : (typeof representative?.Quality === 'number' ? representative.Quality : null);

            return (
              <tr
                key={group.key}
                data-item-uuid={group.summary.representativeItemId ?? ''}
                className="item-list-row"
                role="button"
                tabIndex={0}
                aria-label={rowLabel}
                onClick={(event) => {
                  if (shouldIgnoreInteractiveTarget(event.target)) {
                    return;
                  }
                  event.preventDefault();
                  if (group.summary.representativeItemId) {
                    navigateToItemDetail(group.summary.representativeItemId, 'click');
                  } else {
                    logger.warn('Missing representative item id for grouped row', { groupKey: group.key });
                  }
                }}
                onKeyDown={(event) => {
                  if (shouldIgnoreInteractiveTarget(event.target)) {
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                    event.preventDefault();
                    if (group.summary.representativeItemId) {
                      navigateToItemDetail(group.summary.representativeItemId, 'keyboard');
                    } else {
                      logger.warn('Missing representative item id for grouped row', {
                        groupKey: group.key,
                        source: 'keyboard'
                      });
                    }
                  }
                }}
              >
                <td className="col-id" style={{ display: 'none' }}>{group.summary.representativeItemId}</td>
                <td className="col-select">
                  <input
                    aria-label={checkboxLabel}
                    checked={isSelected}
                    onChange={(event) => onToggleItem(groupItemIds, event.target.checked)}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = isPartiallySelected;
                      }
                    }}
                    type="checkbox"
                  />
                </td>
                <td className="col-number">{group.summary.Artikel_Nummer?.trim() || representative?.Artikel_Nummer?.trim() || '—'}</td>
                <td className="col-desc">{representative?.Artikelbeschreibung ?? '—'}</td>
                <td className="col-box">
                  {boxId && boxLinkTarget ? (
                    <Link to={boxLinkTarget}>
                      {boxId}
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td className="col-location">
                  {shelfId && shelfLinkTarget ? (
                    <Link to={shelfLinkTarget}>
                      <BoxTag locationKey={shelfId} labelOverride={shelfLabel} />
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                </td>
                <td className="col-agentic optional-column">{agenticLabel}</td>
                <td className="col-stock optional-column">{countValue}</td>
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
