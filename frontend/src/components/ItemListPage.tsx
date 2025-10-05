import React, { useEffect, useState } from 'react';
import ItemList from './ItemList';
import LoadingPage from './LoadingPage';
import type { Item } from '../../../models';
import { GoContainer } from 'react-icons/go';

export default function ItemListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [showUnplaced, setShowUnplaced] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filtered = showUnplaced ? items.filter((it) => !it.BoxID) : items;

  if (isLoading) {
    return (
      <LoadingPage message="Lade Artikelübersicht…">
        <p className="muted">Die vollständige Artikelliste wird vorbereitet.</p>
      </LoadingPage>
    );
  }

  return (
    // <div className="container item">
    <div className="">
      <h2>Alle Artikel</h2>
      {/* <div className="filter-bar">
        <input type="checkbox" id="unplaced" name="unplaced" value="Bike" checked={showUnplaced}
          onChange={(e) => setShowUnplaced(e.target.checked)} />
        <label htmlFor="unplaced">Unplatzierte Artikel
        </label>

        <GoContainer />
      </div> */}
      <ItemList items={filtered} />
    </div>
  );
}
