import React from 'react';
import type { Item } from '../../../models';

interface Props {
  items: Item[];
}

export default function ItemList({ items }: Props) {
  return (
    <table className="item-list">
      <thead>
        <tr>
          <th>BoxID</th>
          <th>Location</th>
          <th>Updated</th>
          <th>Artikelnummer</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.ItemUUID} data-item-uuid={it.ItemUUID}>
            <td>{it.BoxID}</td>
            <td>{it.Location}</td>
            <td>{it.UpdatedAt}</td>
            <td>{it.Artikel_Nummer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
