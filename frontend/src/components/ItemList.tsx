import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoBookmark, GoBookmarkFill } from 'react-icons/go';
import { AGENTIC_RUN_STATUS_NOT_STARTED } from '../../../models';
import type { Item } from '../../../models';
import LocationTag from './LocationTag';
import { openOrgInfo } from '../lib/orgInfo';
import { usePanelContext } from '../context/PanelContext';
import { useUserMarks } from '../context/UserMarksContext';
import QualityBadge from './QualityBadge';
import ShopBadge from './ShopBadge';
import ZubehoerBadge from './ZubehoerBadge';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';
import { resolveGroupPrice, resolveGroupUpdatedAt, type GroupedItemDisplay } from '../lib/itemGrouping';
import type { ItemListSortKey } from '../lib/itemListFiltersStorage';
import { logError, logger } from '../utils/logger';
import { useFeatures } from '../context/FeaturesContext';
import { useTaxonomy } from '../context/TaxonomyContext';
import {
  defaultItemListColumns,
  ITEM_LIST_COLUMN_OPTIONS,
  type ItemListColumnKey
} from '../lib/itemListColumns';

// TODO(agent): Confirm item list location tags remain legible without the color metadata.
// TODO: Replace plain table layout with a virtualized list for better performance on large datasets.
// TODO(agentic): Expand item list columns and responsive styling for enriched item metadata.
// TODO(agentic-status-ui): Replace plain status text with badges once status icons are available.
// TODO(agent): Keep BoxID (Behälter) and Location (Lagerort) normalization separate in this table.
// TODO(shop-badge-list-column): Revalidate Shop column visibility rules once mobile column collapsing is updated.
// TODO(agent): Validate shelf label formatting in the item list Lagerort column.
// TODO(agent): Revisit item list shelf label fallbacks once shelf metadata is editable.
// TODO(grouped-item-table): Validate grouped row actions once bulk operations are updated.
// TODO(bulk-display): Confirm quantity display for Einheit=Menge items in list rows once backend payloads sync.
// TODO(bulk-display): Recheck displayCount fallback for Menge rows once grouped payloads are standardized.

interface Props {
  items: GroupedItemDisplay[];
  selectedItemIds: Set<string>;
  onToggleItem: (itemIds: string[], nextValue: boolean) => void;
  onToggleAll: (nextValue: boolean) => void;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onSelect?: (id: string) => void;
  sortKey?: ItemListSortKey;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: ItemListSortKey) => void;
  visibleColumns?: Set<ItemListColumnKey>;
}

// Header + cell class per optional column. "optional-column" = hidden below 960px (styles.scss);
// Behälter/Lagerort deliberately stay visible on phones.
// sortKey = the list sort a header click applies (columns without one aren't sortable).
type ColumnLayout = { className: string; header: string; ariaLabel?: string; sortKey?: ItemListSortKey };
const COLUMN_LAYOUT: Record<ItemListColumnKey, ColumnLayout> = {
  price: { className: 'col-price optional-column', header: 'CHF', ariaLabel: 'Preis', sortKey: 'price' },
  image: { className: 'col-image optional-column', header: 'Bild', ariaLabel: 'Bild vorhanden' },
  box: { className: 'col-box', header: 'Behälter', sortKey: 'box' },
  location: { className: 'col-location', header: 'Lagerort' },
  agentic: { className: 'col-agentic optional-column', header: 'Ki', sortKey: 'agenticStatus' },
  stock: { className: 'col-stock optional-column', header: 'Anzahl', sortKey: 'stock' },
  quality: { className: 'col-quality optional-column', header: 'Qualität', sortKey: 'quality' },
  shop: { className: 'col-shop optional-column', header: 'Shop' },
  zubehoer: { className: 'col-zubehoer optional-column', header: 'Zub.' },
  subcategory: { className: 'col-subcategory optional-column', header: 'Unterkategorie', sortKey: 'subcategory' },
  lastModified: { className: 'col-date optional-column', header: 'Geändert', ariaLabel: 'Zuletzt geändert', sortKey: 'lastModified' }
};
const NUMBER_COLUMN: ColumnLayout = { className: 'col-number', header: 'A-Nr', sortKey: 'artikelnummer' };
const DESC_COLUMN: ColumnLayout = { className: 'col-desc', header: 'Artikel', sortKey: 'artikelbeschreibung' };

type ItemLocationSource = Pick<Item, 'ItemUUID' | 'BoxID' | 'Location' | 'ShelfLabel'>;

function shouldIgnoreInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveSelector = 'button, input, select, textarea, label, a';
  return Boolean(target.closest(interactiveSelector));
}


function resolveDisplayCount(group: GroupedItemDisplay): number {
  try {
    if (typeof group.displayCount === 'number' && Number.isFinite(group.displayCount)) {
      return group.displayCount;
    }
    const fallback = group.isBulk && Number.isFinite(group.totalStock) ? group.totalStock : group.summary.count;
    logger.warn?.('Invalid grouped displayCount; falling back to summary count', {
      groupKey: group.key,
      displayCount: group.displayCount,
      totalStock: group.totalStock,
      isBulk: group.isBulk,
      fallback
    });
    return fallback;
  } catch (error) {
    logError('Failed to resolve grouped display count', error, {
      groupKey: group.key,
      displayCount: group.displayCount,
      totalStock: group.totalStock,
      isBulk: group.isBulk
    });
    return group.summary.count;
  }
}

function formatDate(value: unknown): string {
  if (!value || typeof value !== 'string') return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('de-CH');
  } catch {
    return '—';
  }
}

export default function ItemList({
  items,
  selectedItemIds,
  onToggleItem,
  onToggleAll,
  allVisibleSelected,
  someVisibleSelected,
  onSelect,
  sortKey,
  sortDirection,
  onSort,
  visibleColumns
}: Props) {
  const features = useFeatures();
  const { categories } = useTaxonomy();
  const shownColumns = useMemo(() => {
    const wanted = visibleColumns ?? defaultItemListColumns();
    return ITEM_LIST_COLUMN_OPTIONS
      .filter((option) => wanted.has(option.key) && (!option.feature || features[option.feature]))
      .map((option) => option.key);
  }, [visibleColumns, features]);
  const renderHeader = (layout: ColumnLayout, key: string) => {
    const active = Boolean(layout.sortKey) && layout.sortKey === sortKey;
    return (
      <th
        key={key}
        className={layout.className}
        aria-label={layout.ariaLabel}
        aria-sort={active ? (sortDirection === 'desc' ? 'descending' : 'ascending') : undefined}
      >
        {layout.sortKey && onSort ? (
          <button
            type="button"
            className={`col-sort-btn${active ? ' col-sort-btn--active' : ''}`}
            onClick={() => onSort(layout.sortKey as ItemListSortKey)}
            title={`Nach ${layout.ariaLabel ?? layout.header} sortieren`}
          >
            {layout.header}
            {active && <span aria-hidden="true">{sortDirection === 'desc' ? ' ▼' : ' ▲'}</span>}
          </button>
        ) : layout.header}
      </th>
    );
  };
  const subcategoryLabels = useMemo(() => {
    const labels = new Map<string, string>();
    categories.forEach((category) => category.subcategories.forEach((sub) => {
      labels.set(String(sub.code).padStart(4, '0'), sub.label);
    }));
    return labels;
  }, [categories]);
  const safeItems = items ?? [];
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const { entityId, setEntity } = usePanelContext();
  const { isMarked, toggleMark } = useUserMarks();
  const navigateToItemDetail = useCallback((itemId: string, identifierType: 'itemUUID' | 'artikelNummer', source: 'click' | 'keyboard') => {
    try {
      if (onSelect) {
        onSelect(itemId);
      } else {
        console.info('Navigating to item detail from item list row', { itemId, identifierType, source });
        navigate(`/items/${encodeURIComponent(itemId)}`);
      }
    } catch (navigationError) {
      console.error('Failed to navigate to item detail from item list row', {
        itemId,
        identifierType,
        source,
        navigationError
      });
    }
  }, [navigate, onSelect]);
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
            <th className="col-mark" aria-label="Markierung" />
            {renderHeader(NUMBER_COLUMN, 'number')}
            {renderHeader(DESC_COLUMN, 'desc')}
            {shownColumns.map((key) => renderHeader(COLUMN_LAYOUT[key], key))}
            {(sortKey === 'entryDate' || sortKey === 'lastSynced' || sortKey === 'agenticLastRun') && (
              <th className="col-date optional-column">
                {sortKey === 'lastSynced' ? 'Synchronisiert' : sortKey === 'agenticLastRun' ? 'KI-Datum' : 'Erfasst am'}
              </th>
            )}
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
            const representativeItemId = group.summary.representativeItemId ?? representative?.ItemUUID ?? null;

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

const isSelected = groupItemIds.length > 0 && groupItemIds.every((itemId) => selectedItemIds.has(itemId));
            const isPartiallySelected = groupItemIds.some((itemId) => selectedItemIds.has(itemId)) && !isSelected;
            const representativeLabel = representative?.Artikelbeschreibung?.trim() || group.summary.Artikel_Nummer || 'Artikelgruppe';
            const checkboxLabel = `Artikelgruppe ${representativeLabel} auswählen`;
            const rowLabel = `Details für ${representativeLabel} öffnen`;
            let rowNavigationIdentifier: string | null = null;
            let rowNavigationIdentifierType: 'itemUUID' | 'artikelNummer' | null = null;
            try {
              const itemUUID = group.summary.representativeItemId?.trim() || representative?.ItemUUID?.trim() || '';
              const artikelNummer = group.summary.Artikel_Nummer?.trim() || representative?.Artikel_Nummer?.trim() || '';
              if (itemUUID) {
                rowNavigationIdentifier = itemUUID;
                rowNavigationIdentifierType = 'itemUUID';
                logger.info?.('Selected grouped row navigation identifier', {
                  identifierType: rowNavigationIdentifierType,
                  identifier: rowNavigationIdentifier,
                  groupKey: group.key
                });
              } else if (artikelNummer) {
                rowNavigationIdentifier = artikelNummer;
                rowNavigationIdentifierType = 'artikelNummer';
                logger.info?.('Selected grouped row navigation identifier', {
                  identifierType: rowNavigationIdentifierType,
                  identifier: rowNavigationIdentifier,
                  groupKey: group.key
                });
              }
            } catch (error) {
              logError('Failed to resolve grouped row navigation identifier', error, {
                groupKey: group.key,
                representativeItemId: group.summary.representativeItemId ?? null,
                artikelNummer: group.summary.Artikel_Nummer ?? representative?.Artikel_Nummer ?? null
              });
            }
            if (!rowNavigationIdentifier || !rowNavigationIdentifierType) {
              logger.warn?.('Missing navigation identifier for grouped row', {
                groupKey: group.key,
                representativeItemId: group.summary.representativeItemId ?? null,
                artikelNummer: group.summary.Artikel_Nummer ?? representative?.Artikel_Nummer ?? null
              });
            }
            const countValue = resolveDisplayCount(group);
            const isOutOfStock = countValue === 0;
            const locationItem: ItemLocationSource | null = representativeItemId
              ? {
                  ItemUUID: representativeItemId,
                  BoxID: boxId ?? representative?.BoxID ?? null,
                  Location: shelfId ?? representative?.Location ?? null,
                  ShelfLabel: group.summary.ShelfLabel ?? representative?.ShelfLabel ?? null,
                }
              : null;
            const subcategoryValue = group.summary.Category
              ?? (typeof representative?.Unterkategorien_A === 'number'
                ? String(representative.Unterkategorien_A)
                : (typeof representative?.Unterkategorien_A === 'string' ? representative.Unterkategorien_A : null));
            const agenticStatus = group.agenticStatusSummary ?? AGENTIC_RUN_STATUS_NOT_STARTED;
            const agenticLabel = describeAgenticStatus(agenticStatus);
            const qualityValue = typeof group.summary.Quality === 'number'
              ? group.summary.Quality
              : (typeof representative?.Quality === 'number' ? representative.Quality : null);
            const shopartikelValue = representative?.Shopartikel ?? null;
            const publishedStatusValue = representative?.Veröffentlicht_Status ?? null;
            const zubehoerMode = (representative as any)?.ZubehoerMode ?? null;
            const parentItemUUID = (representative as any)?.ParentItemUUID ?? null;

            const price = resolveGroupPrice(group);
            const locationTag = <LocationTag item={locationItem} itemId={representativeItemId} />;
            // Another org's item: the "location" is its owner's name, not a shelf to open.
            const openLocation = representative?.LocationRedacted
              ? () => { void openOrgInfo(representative.TenantId, shelfId); }
              : parentItemUUID
                ? () => setEntity('item', parentItemUUID)
                : shelfId
                  ? () => setEntity('box', shelfId)
                  : null;
            const cells: Record<ItemListColumnKey, React.ReactNode> = {
              price: price !== null ? price.toFixed(2) : '—',
              image: (representative?.ImageNames || representative?.Grafikname) ? '✓' : '—',
              box: boxId ? (
                <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setEntity('box', boxId); }}>
                  {boxId}
                </button>
              ) : <span>—</span>,
              location: openLocation ? (
                <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); openLocation(); }}>
                  {locationTag}
                </button>
              ) : locationTag,
              agentic: agenticLabel,
              stock: countValue,
              quality: <QualityBadge compact value={qualityValue} />,
              shop: <ShopBadge compact shopartikel={shopartikelValue} publishedStatus={publishedStatusValue} />,
              zubehoer: <ZubehoerBadge compact mode={zubehoerMode} />,
              subcategory: subcategoryValue
                ? (subcategoryLabels.get(subcategoryValue.padStart(4, '0')) ?? subcategoryValue)
                : '—',
              lastModified: formatDate(resolveGroupUpdatedAt(group))
            };

            return (
              <tr
                key={group.key}
                data-item-uuid={group.summary.representativeItemId ?? ''}
                className={['item-list-row', isOutOfStock ? 'item-row--out-of-stock' : '', group.summary.representativeItemId === entityId ? 'item-list-row--selected' : ''].filter(Boolean).join(' ')}
                role="button"
                aria-selected={group.summary.representativeItemId === entityId}
                tabIndex={0}
                aria-label={rowLabel}
                onClick={(event) => {
                  if (shouldIgnoreInteractiveTarget(event.target)) {
                    return;
                  }
                  event.preventDefault();
                  if (rowNavigationIdentifier && rowNavigationIdentifierType) {
                    navigateToItemDetail(rowNavigationIdentifier, rowNavigationIdentifierType, 'click');
                  } else {
                    logger.warn('Missing navigation identifier for grouped row', { groupKey: group.key });
                  }
                }}
                onKeyDown={(event) => {
                  if (shouldIgnoreInteractiveTarget(event.target)) {
                    return;
                  }
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                    event.preventDefault();
                    if (rowNavigationIdentifier && rowNavigationIdentifierType) {
                      navigateToItemDetail(rowNavigationIdentifier, rowNavigationIdentifierType, 'keyboard');
                    } else {
                      logger.warn('Missing navigation identifier for grouped row', {
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
                <td className="col-mark">
                  {representativeItemId && (
                    <button
                      type="button"
                      className={`mark-btn${isMarked(representativeItemId) ? ' mark-btn--active' : ''}`}
                      title={isMarked(representativeItemId) ? 'Markierung entfernen' : 'Merken'}
                      aria-label={isMarked(representativeItemId) ? 'Markierung entfernen' : 'Merken'}
                      onClick={(e) => { e.stopPropagation(); void toggleMark(representativeItemId); }}
                    >
                      {isMarked(representativeItemId)
                        ? <GoBookmarkFill aria-hidden="true" />
                        : <GoBookmark aria-hidden="true" />}
                    </button>
                  )}
                </td>
                <td className="col-number">{group.summary.Artikel_Nummer?.trim() || representative?.Artikel_Nummer?.trim() || '—'}</td>
                <td className="col-desc">{representative?.Artikelbeschreibung ?? '—'}</td>
                {shownColumns.map((key) => (
                  <td key={key} className={COLUMN_LAYOUT[key].className}>{cells[key]}</td>
                ))}
                {sortKey === 'entryDate' && (
                  <td className="col-date optional-column">{formatDate(representative?.Datum_erfasst)}</td>
                )}
                {sortKey === 'lastSynced' && (
                  <td className="col-date optional-column">{formatDate(representative?.LastSyncedAt)}</td>
                )}
                {sortKey === 'agenticLastRun' && (
                  <td className="col-date optional-column">{formatDate(representative?.AgenticLastRunAt)}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
