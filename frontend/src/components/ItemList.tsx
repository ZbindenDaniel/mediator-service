import React from 'react';
import { Link } from 'react-router-dom';
import type { Item } from '../../../models';
import BoxColorTag from './BoxColorTag';
import { GoLinkExternal } from "react-icons/go";

// TODO: Replace plain table layout with a virtualized list for better performance on large datasets.

interface Props {
  items: Item[];
}

export default function ItemList({ items }: Props) {
  const safeItems = items ?? [];
  return (
    <div className="item-list-wrapper">
      <table className="item-list">
        <thead>
          <tr className="item-list-header">
            <th className="col-id" style={{ display: 'none' }}>Id</th>
            <th className="col-select"></th>
            <th className="col-desc">Artikel</th>
            <th className="col-box">Behälter</th>
            <th className="col-location">Lagerort</th>
            <th className="col-link"></th>
          </tr>
        </thead>
        <tbody>
          {safeItems.map(it => {
            const locationKey = it.Location?.trim() || it.BoxID?.trim() || undefined;
            const boxLabel = it.BoxID?.trim() || 'Unbekannter Behälter';
            const boxLinkTarget = it.BoxID
              ? `/boxes/${encodeURIComponent(it.BoxID)}`
              : '/boxes';

            return (
              <tr key={it.ItemUUID} data-item-uuid={it.ItemUUID} className="item-list-row">
                <td className="col-id" style={{ display: 'none' }}>{it.ItemUUID}</td>
                <td className="col-select"><input type="checkbox" /></td>
                <td className="col-desc">{it.Artikelbeschreibung}</td>
                <td className="col-box">
                  <Link to={boxLinkTarget}>
                    {boxLabel}
                  </Link>
                </td>
                <td className="col-location">
                  <BoxColorTag locationKey={locationKey} />
                </td>
                <td className="col-link">
                  <Link to={`/items/${encodeURIComponent(it.ItemUUID)}`}>
                    <GoLinkExternal />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
