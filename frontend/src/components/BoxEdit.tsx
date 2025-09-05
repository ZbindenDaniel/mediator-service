import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Item } from '../../../models';

interface Props {
  boxId: string;
}

export default function BoxEdit({ boxId }: Props) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
        } else {
          console.error('Failed to load box', res.status);
        }
      } catch (err) {
        console.error('Failed to load box', err);
      }
    }
    load();
  }, [boxId]);

  return (
    <div className="box-edit">
      <h2>Items in dieser Box bearbeiten</h2>
      {items.length ? (
        items.map((it) => (
          <Link
            key={it.ItemUUID}
            to={`/items/${encodeURIComponent(it.ItemUUID)}/edit`}
            className="linkcard"
          >
            <div className="card" style={{ margin: '6px 0' }}>
              <div>
                <b>{it.Artikel_Nummer || '(keine Artikelnummer)'}</b>{' '}
                <span className="pill Item mono">
                  {(it.ItemUUID || '').slice(-6).toUpperCase()}
                </span>
              </div>
              <div className="muted">{it.Artikelbeschreibung || ''}</div>
              <div className="muted">Auf Lager: {it.Auf_Lager ?? 0}</div>
            </div>
          </Link>
        ))
      ) : (
        <div className="muted">Diese Box enthält noch keine Artikel.</div>
      )}
      <div className="btn-container">
        <Link className="btn" to={`/items/new?box=${encodeURIComponent(boxId)}`}>
          +
        </Link>
      </div>
    </div>
  );
}
