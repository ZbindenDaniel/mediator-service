import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import type { Box, Item, EventLog } from '../../../models';

interface Props {
  boxId: string;
}

export default function BoxDetail({ boxId }: Props) {
  const [box, setBox] = useState<Box | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/boxes/${encodeURIComponent(boxId)}`);
        if (res.ok) {
          const data = await res.json();
          setBox(data.box);
          setItems(data.items || []);
          setEvents(data.events || []);
        } else {
          console.error('Failed to fetch box', res.status);
        }
      } catch (err) {
        console.error('Failed to fetch box', err);
      }
    }
    load();
  }, [boxId]);

  return (
    <div className="box-detail">
      {box ? (
        <>
          <h2>Box {box.BoxID}</h2>
          {box.Location && <p><strong>Location:</strong> {box.Location}</p>}
          {box.Notes && <p><strong>Notes:</strong> {box.Notes}</p>}
          <PrintLabelButton boxId={box.BoxID} />
        </>
      ) : (
        <p>Loading...</p>
      )}

      <h3>Items</h3>
      <ul>
        {items.map((it) => (
          <li key={it.ItemUUID}>
            <Link to={`/items/${encodeURIComponent(it.ItemUUID)}`}>
              {it.Artikel_Nummer || it.ItemUUID}
            </Link>
          </li>
        ))}
      </ul>

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
