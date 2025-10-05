import React, { useEffect, useState } from 'react';
import ItemList from './ItemList';
import type { ItemRecord } from '../../../models';
import { coerceItemRecord } from '../lib/itemLayers';

export default function ItemListPage() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [showUnplaced, setShowUnplaced] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/items');
        if (!r.ok) {
          console.error('load items failed', r.status);
          return;
        }
        const data = await r.json();
        const rawItems: unknown[] = Array.isArray(data.items) ? data.items : [];
        if (!Array.isArray(data.items)) {
          console.warn('ItemListPage: unexpected items payload', data.items);
        }
        const records = rawItems
          .map((entry, index) => coerceItemRecord(entry, `item-list-${index}`))
          .filter((entry): entry is ItemRecord => Boolean(entry));
        setItems(records);
        console.log('loaded items', records.length);
      } catch (err) {
        console.error('fetch items failed', err);
      }
    }
    load();
  }, []);

  const filtered = showUnplaced ? items.filter((it) => !it.BoxID) : items;

  return (
    // <div className="container item">
    <div className="card">
      <h2>Alle Artikel</h2>
      <div className="filter-bar">
        <label>
          <input
            type="checkbox"
            checked={showUnplaced}
            onChange={(e) => setShowUnplaced(e.target.checked)}
          />
          Unplatzierte Artikel
        </label>
      </div>
      <ItemList items={filtered} />
    </div>
  );
}
