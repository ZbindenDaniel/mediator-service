import React from 'react';
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
            <th className="col-box">BoxID</th>
            <th className="col-location">Location</th>
            <th className="col-updated">Updated</th>
            <th className="col-artikel">Artikelnummer</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.ItemUUID} data-item-uuid={it.ItemUUID} className="item-list-row">
              <td className="col-box">{it.BoxID}</td>
              <td className="col-location">{it.Location}</td>
              <td className="col-updated">{it.UpdatedAt}</td>
              <td className="col-artikel">{it.Artikel_Nummer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
