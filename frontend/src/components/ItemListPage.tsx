import React, { useEffect, useState } from 'react';
import ItemList from './ItemList';
import type { Item } from '../../../models';

export default function ItemListPage() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/items');
        if (!r.ok) {
          console.error('load items failed', r.status);
          return;
        }
        const data = await r.json();
        setItems(data.items || []);
        console.log('loaded items', (data.items || []).length);
      } catch (err) {
        console.error('fetch items failed', err);
      }
    }
    load();
  }, []);

  return (
    <div className="card">
      <h2>Alle Artikel</h2>
      <ItemList items={items} />
    </div>
  );
}
