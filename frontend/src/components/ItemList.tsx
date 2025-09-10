import React from 'react';
import { Link } from 'react-router-dom';
import type { Item } from '../../../models';

interface Props {
  items: Item[];
}

export default function ItemList({ items }: Props) {
  return (
    <div className="item-list-wrapper">
      <table className="item-list">
        <thead>
          <tr className="item-list-header">
            <th className="col-id" style={{ display: 'none' }}>Id</th>
            <th className="col-select"></th>
            <th className="col-desc">Artikelbeschreibung</th>
            <th className="col-location">Behälter</th>
            <th className="col-link"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.ItemUUID} data-item-uuid={it.ItemUUID} className="item-list-row">
              <td className="col-id" style={{ display: 'none' }}>{it.ItemUUID}</td>
              <td className="col-select"><input type="checkbox" /></td>
              <td className="col-desc">{it.Artikelbeschreibung}</td>
              <td className="col-location">{it.Location || ''}</td>
              <td className="col-link"><Link to={`/items/${encodeURIComponent(it.ItemUUID)}`}>Details</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
