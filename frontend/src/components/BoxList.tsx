import React, { ChangeEvent, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Box } from '../../../models/box';
import { formatDate } from '../lib/format';
import { logError, logger } from '../utils/logger';
import LocationTag from './LocationTag';
import type { BoxTypeFilter } from './boxListUtils';
import { shelfLocations } from '../data/shelfLocations';

// TODO(agent): Validate that the box list layout still reads clearly without color metadata.
// TODO(agent): Confirm shelf label formatting stays aligned with box list expectations.
// TODO(agent): Review LocationTag label override coverage if new box metadata fields are added.
// TODO(agent): Revisit box list ARIA labels if location label formatting changes.

export type BoxSortKey = 'boxId' | 'location' | 'createdAt' | 'updatedAt';

interface Props {
  boxes: Box[];
  searchValue: string;
  sortKey: BoxSortKey;
  typeFilter: BoxTypeFilter;
  locationFilter: string;
  onSearchChange: (value: string) => void;
  onSortChange: (value: BoxSortKey) => void;
  onTypeFilterChange: (value: BoxTypeFilter) => void;
  onLocationFilterChange: (value: string) => void;
}

const SORT_LABELS: Record<BoxSortKey, string> = {
  boxId: 'Box-ID',
  location: 'Standort',
  updatedAt: 'Zuletzt aktualisiert',
  createdAt: 'Erstellt am',
};

// TODO(agent): Revisit shelf label normalization once shelf labels are editable.
function normalizeLabelValue(
  value: string | null | undefined,
  context: string,
  boxId?: string | null
): string {
  if (value == null) {
    return '';
  }

  try {
    return value.trim();
  } catch (error) {
    logError(`Failed to normalize ${context}`, error, { value, boxId });
    return '';
  }
}

function shouldIgnoreInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveSelector = 'button, input, select, textarea, label, a';
  return Boolean(target.closest(interactiveSelector));
}

export default function BoxList({ boxes, searchValue, sortKey, typeFilter, locationFilter, onSearchChange, onSortChange, onTypeFilterChange, onLocationFilterChange }: Props) {
  logger.info?.('[BoxList] rendering boxes', { count: boxes.length });

  const navigate = useNavigate();
  const navigateToBoxDetail = useCallback((boxId: string, source: 'click' | 'keyboard') => {
    try {
      logger.info?.('Navigating to box detail from box list row', { boxId, source });
      navigate(`/boxes/${encodeURIComponent(boxId)}`);
    } catch (navigationError) {
      logError('Failed to navigate to box detail from box list row', navigationError, {
        boxId,
        source,
      });
    }
  }, [navigate]);

  const safeBoxes = useMemo(() => boxes ?? [], [boxes]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const nextValue = event.target.value;
      logger.info?.('[BoxList] search changed', { nextValue });
      onSearchChange(nextValue);
    } catch (err) {
      logError('Failed to handle box search change', err);
    }
  };

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    try {
      const nextKey = event.target.value as BoxSortKey;
      logger.info?.('[BoxList] sort changed', { nextKey });
      onSortChange(nextKey);
    } catch (err) {
      logError('Failed to handle box sort change', err);
    }
  };

  const handleTypeFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    try {
      const nextFilter = event.target.value as BoxTypeFilter;
      logger.info?.('[BoxList] type filter changed', { nextFilter });
      onTypeFilterChange(nextFilter);
    } catch (err) {
      logError('Failed to handle box type filter change', err);
    }
  };

  const handleLocationFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    try {
      const nextLocation = event.target.value;
      logger.info?.('[BoxList] location filter changed', { nextLocation });
      onLocationFilterChange(nextLocation);
    } catch (err) {
      logError('Failed to handle box location filter change', err);
    }
  };

  return (
    <div className="box-list-wrapper">
      <div className="filter-bar" aria-label="Behälterwerkzeuge">
        <div className="filter-panel">
          <div className="filter-grid">
            <div className="filter-grid__item">
              <label className="filter-control" htmlFor="box-search">
                <span>Suche</span>
                <input
                  id="box-search"
                  type="search"
                  placeholder="Box-ID suchen"
                  value={searchValue}
                  onChange={handleSearchChange}
                  autoFocus
                />
              </label>
            </div>
            <div className="filter-grid__item">
              <label className="filter-control" htmlFor="box-type-filter">
                <span>Typ</span>
                <select id="box-type-filter" value={typeFilter} onChange={handleTypeFilterChange}>
                  <option value="all">Alle</option>
                  <option value="shelves">Regale</option>
                  <option value="boxes">Behälter</option>
                </select>
              </label>
            </div>
            <div className="filter-grid__item">
              <label className="filter-control" htmlFor="box-location-filter">
                <span>Standort</span>
                <select id="box-location-filter" value={locationFilter} onChange={handleLocationFilterChange}>
                  <option value="all">Alle Standorte</option>
                  {shelfLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="filter-grid__item">
              <label className="filter-control" htmlFor="box-sort">
                <span>Sortieren nach</span>
                <select id="box-sort" value={sortKey} onChange={handleSortChange}>
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>
      <table className="box-list">
        <thead>
          <tr className="box-list-header">
            <th className="col-box-id">Behälter</th>
            <th className="col-location">Standort</th>
            <th className="col-item-count">Artikel</th>
            <th className="col-total-weight">Gewicht gesamt (kg)</th>
            <th className="col-updated">Aktualisiert</th>
          </tr>
        </thead>
        <tbody>
          {safeBoxes.map((box) => {
            try {
              const normalizedLabel = normalizeLabelValue(box.Label, 'box label', box.BoxID);
              const normalizedShelfLabel = normalizeLabelValue(box.ShelfLabel, 'box shelf label', box.BoxID);
              const isShelf = box.BoxID.slice(0, 2).toUpperCase() === 'S-';
              if (box.LocationId && !normalizedShelfLabel) {
                logger.warn('Missing shelf label for box list row', {
                  boxId: box.BoxID,
                  locationId: box.LocationId
                });
              }
              const rowLabelLabel = normalizedShelfLabel || normalizedLabel;
              const rowLabel = rowLabelLabel
                ? `Details für Box ${box.BoxID} in ${rowLabelLabel} öffnen`
                : `Details für Box ${box.BoxID} öffnen`;
              return (
                <tr
                  key={box.BoxID}
                  data-box-id={box.BoxID}
                  className={['box-list-row', isShelf ? 'box-list-row--shelf' : ''].filter(Boolean).join(' ')}
                  role="button"
                  tabIndex={0}
                  aria-label={rowLabel}
                  onClick={(event) => {
                    if (shouldIgnoreInteractiveTarget(event.target)) {
                      return;
                    }
                    event.preventDefault();
                    navigateToBoxDetail(box.BoxID, 'click');
                  }}
                  onKeyDown={(event) => {
                    if (shouldIgnoreInteractiveTarget(event.target)) {
                      return;
                    }
                    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                      event.preventDefault();
                      navigateToBoxDetail(box.BoxID, 'keyboard');
                    }
                  }}
                >
                  <td className="col-box-id">{box.BoxID}</td>
                  <td className="col-location">
                    <LocationTag
                      locationKey={box.LocationId}
                      labelOverride={normalizedShelfLabel || null}
                    />
                  </td>
                  <td className="col-item-count">{Number.isFinite(box.ItemCount) ? box.ItemCount : 0}</td>
                  <td className="col-total-weight">
                    {Number.isFinite(box.TotalWeightKg) ? Number(box.TotalWeightKg).toFixed(3) : '0.000'}
                  </td>
                  <td className="col-updated">{box.UpdatedAt ? formatDate(box.UpdatedAt) : ''}</td>
                </tr>
              );
            } catch (err) {
              logError('Failed to render box row', err, { box });
              return null;
            }
          })}
        </tbody>
      </table>
    </div>
  );
}
