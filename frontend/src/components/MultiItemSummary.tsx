import React from 'react';
import type { Item } from '../../../models';

interface Props {
  selectedIds: string[];
  selectedItems: Item[];
}

const MAX_VISIBLE = 20;

export default function MultiItemSummary({ selectedIds, selectedItems }: Props) {
  const count = selectedIds.length;
  const idSet = new Set(selectedIds);
  const matched = selectedItems.filter((item) => idSet.has(item.ItemUUID));
  const artikelNummern = matched.map((item) => item.Artikel_Nummer).filter(Boolean) as string[];
  const overflow = artikelNummern.length > MAX_VISIBLE;

  return (
    <div className="multi-item-summary">
      <h3 className="multi-item-summary__heading">{count} Artikel ausgewählt</h3>
      <ul className="multi-item-summary__list">
        {artikelNummern.slice(0, MAX_VISIBLE).map((nr) => (
          <li key={nr} className="multi-item-summary__item mono">{nr}</li>
        ))}
        {overflow ? (
          <li className="muted">+{artikelNummern.length - MAX_VISIBLE} weitere</li>
        ) : null}
      </ul>
    </div>
  );
}
