import React, { ChangeEvent, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Box } from '../../../models/box';
import { formatDate } from '../lib/format';
import { formatShelfLabel } from '../lib/shelfLabel';
import BoxTag from './BoxTag';

// TODO(agent): Validate that the box list layout still reads clearly without color metadata.
// TODO(agent): Confirm shelf label formatting stays aligned with box list expectations.

export type BoxSortKey = 'BoxID' | 'Label' | 'UpdatedAt';

interface Props {
  boxes: Box[];
  searchValue: string;
  sortKey: BoxSortKey;
  onSearchChange: (value: string) => void;
  onSortChange: (value: BoxSortKey) => void;
}

const SORT_LABELS: Record<BoxSortKey, string> = {
  BoxID: 'Box-ID',
  Label: 'Standort',
  UpdatedAt: 'Zuletzt aktualisiert',
};

function shouldIgnoreInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveSelector = 'button, input, select, textarea, label, a';
  return Boolean(target.closest(interactiveSelector));
}

export default function BoxList({ boxes, searchValue, sortKey, onSearchChange, onSortChange }: Props) {
  console.log('[BoxList] rendering boxes', { count: boxes.length });

  const navigate = useNavigate();
  const navigateToBoxDetail = useCallback((boxId: string, source: 'click' | 'keyboard') => {
    try {
      console.info('Navigating to box detail from box list row', { boxId, source });
      navigate(`/boxes/${encodeURIComponent(boxId)}`);
    } catch (navigationError) {
      console.error('Failed to navigate to box detail from box list row', {
        boxId,
        source,
        navigationError,
      });
    }
  }, [navigate]);

  const safeBoxes = useMemo(() => boxes ?? [], [boxes]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const nextValue = event.target.value;
      console.log('[BoxList] search changed', { nextValue });
      onSearchChange(nextValue);
    } catch (err) {
      console.error('Failed to handle box search change', err);
    }
  };

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    try {
      const nextKey = event.target.value as BoxSortKey;
      console.log('[BoxList] sort changed', { nextKey });
      onSortChange(nextKey);
    } catch (err) {
      console.error('Failed to handle box sort change', err);
    }
  };

  return (
    <div className="box-list-wrapper">
      <div className="list-toolbar" aria-label="Behälterwerkzeuge">
        <label className="toolbar-field" htmlFor="box-search">
          <span className="toolbar-label">Suche</span>
          <input
            id="box-search"
            type="search"
            placeholder="Box oder Standort finden"
            value={searchValue}
            onChange={handleSearchChange}
            autoFocus
          />
        </label>
        <label className="toolbar-field" htmlFor="box-sort">
          <span className="toolbar-label">Sortieren nach</span>
          <select id="box-sort" value={sortKey} onChange={handleSortChange}>
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="box-list">
        <thead>
          <tr className="box-list-header">
            <th className="col-box-id">Behälter</th>
            <th className="col-location">Standort</th>
            <th className="col-updated">Aktualisiert</th>
          </tr>
        </thead>
        <tbody>
          {safeBoxes.map((box) => {
            try {
              const rowLabel = box.Label?.trim()
                ? `Details für Box ${box.BoxID} in ${box.Label} öffnen`
                : `Details für Box ${box.BoxID} öffnen`;
              const shelfId = box.BoxID?.startsWith('S-')
                ? box.BoxID
                : box.LocationId?.startsWith('S-')
                  ? box.LocationId
                  : null;
              const shelfLabel = formatShelfLabel(shelfId);
              const locationLabel = shelfLabel ?? box.Label?.trim() ?? null;

              return (
                <tr
                  key={box.BoxID}
                  data-box-id={box.BoxID}
                  className="box-list-row"
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
                    <BoxTag
                      locationKey={box.LocationId}
                      labelOverride={locationLabel}
                    />
                  </td>
                  <td className="col-updated">{box.UpdatedAt ? formatDate(box.UpdatedAt) : ''}</td>
                </tr>
              );
            } catch (err) {
              console.error('Failed to render box row', { box, err });
              return null;
            }
          })}
        </tbody>
      </table>
    </div>
  );
}
