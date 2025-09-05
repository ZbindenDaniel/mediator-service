import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import type { Item, EventLog } from '../../../models';

interface Props {
  itemId: string;
}

export default function ItemDetail({ itemId }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(itemId)}`);
        if (res.ok) {
          const data = await res.json();
          setItem(data.item);
          setEvents(data.events || []);
        } else {
          console.error('Failed to fetch item', res.status);
        }
      } catch (err) {
        console.error('Failed to fetch item', err);
      }
    }
    load();
  }, [itemId]);

  return (
    <div className="item-detail">
      {item ? (
        <>
          <h2>Item {item.ItemUUID}</h2>
          {item.Artikel_Nummer && (
            <p><strong>Material:</strong> {item.Artikel_Nummer}</p>
          )}
          {item.Artikelbeschreibung && <p>{item.Artikelbeschreibung}</p>}
          <PrintLabelButton itemId={item.ItemUUID} />
          <div>
            <Link to={`/items/${encodeURIComponent(item.ItemUUID)}/edit`}>Edit</Link>
          </div>
        </>
      ) : (
        <p>Loading...</p>
      )}

      <h3>Events</h3>
      <ul className="events">
        {events.map((ev) => (
          <li key={ev.Id}>
            {ev.CreatedAt}: {ev.Event}
          </li>
        ))}
      </ul>
    </div>
  );
}
