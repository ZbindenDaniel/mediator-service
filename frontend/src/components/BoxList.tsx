import React, { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Box } from '../../../models/box';
import BoxColorTag from './BoxColorTag';
import { formatDate } from '../lib/format';
import { GoLinkExternal } from 'react-icons/go';

export type BoxSortKey = 'BoxID' | 'StandortLabel' | 'UpdatedAt';

interface Props {
  boxes: Box[];
  searchValue: string;
  sortKey: BoxSortKey;
  onSearchChange: (value: string) => void;
  onSortChange: (value: BoxSortKey) => void;
}

const SORT_LABELS: Record<BoxSortKey, string> = {
  BoxID: 'Box-ID',
  StandortLabel: 'Standort',
  UpdatedAt: 'Zuletzt aktualisiert',
};

export default function BoxList({ boxes, searchValue, sortKey, onSearchChange, onSortChange }: Props) {
  console.log('[BoxList] rendering boxes', { count: boxes.length });

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
            <th className="col-box-id">Box</th>
            <th className="col-location">Standort</th>
            <th className="col-updated">Aktualisiert</th>
            <th className="col-link"></th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => {
            try {
              return (
                <tr key={box.BoxID} data-box-id={box.BoxID} className="box-list-row">
                  <td className="col-box-id">{box.BoxID}</td>
                  <td className="col-location">
                    <BoxColorTag locationKey={box.Location} labelOverride={box.StandortLabel} />
                  </td>
                  <td className="col-updated">{box.UpdatedAt ? formatDate(box.UpdatedAt) : ''}</td>
                  <td className="col-link">
                    <Link to={`/boxes/${encodeURIComponent(box.BoxID)}`}><GoLinkExternal /></Link>
                  </td>
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
