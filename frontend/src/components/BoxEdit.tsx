import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ItemRecord } from '../../../models';
import { coerceItemRecord } from '../lib/itemLayers';

interface Props {
  boxId: string;
}

export default function BoxEdit({ boxId }: Props) {
  const [items, setItems] = useState<ItemRecord[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
        if (res.ok) {
          const data = await res.json();
          const rawItems: unknown[] = Array.isArray(data.items) ? data.items : [];
          if (!Array.isArray(data.items)) {
            console.warn('BoxEdit: unexpected items payload', data.items);
          }
          const parsed = rawItems
            .map((entry, index) => coerceItemRecord(entry, `box-edit-${index}`))
            .filter((entry): entry is ItemRecord => Boolean(entry));
          setItems(parsed);
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
      <h2>Artikel in diesem Behälter bearbeiten</h2>
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
        <div className="muted">Dieser Behälter enthält noch keine Artikel.</div>
      )}
      <div className="btn-container">
        <Link className="btn" to={`/items/new?box=${encodeURIComponent(boxId)}`}>
          +
        </Link>
      </div>
    </div>
  );
}
