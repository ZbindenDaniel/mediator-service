import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateItemCard from './RelocateItemCard';
import type { Item, EventLog } from '../../../models';
import { formatDateTime } from '../lib/format';

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
    <div className="container item-detail">
      {item ? (
        <>
          <div className="card">
            <h2>Item {item.ItemUUID}</h2>
            <table className="details">
              <tbody>
                {([
                  ['ItemUUID', item.ItemUUID],
                  ['BoxID', item.BoxID],
                  ['Location', item.Location],
                  ['UpdatedAt', item.UpdatedAt ? formatDateTime(item.UpdatedAt) : ''],
                  ['Datum_erfasst', item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : ''],
                  ['Artikel_Nummer', item.Artikel_Nummer],
                  ['Grafikname', item.Grafikname],
                  ['Artikelbeschreibung', item.Artikelbeschreibung],
                  ['Auf_Lager', item.Auf_Lager],
                  ['Verkaufspreis', item.Verkaufspreis],
                  ['Kurzbeschreibung', item.Kurzbeschreibung],
                  ['Langtext', item.Langtext],
                  ['Hersteller', item.Hersteller],
                  ['Länge_mm', item.Länge_mm],
                  ['Breite_mm', item.Breite_mm],
                  ['Höhe_mm', item.Höhe_mm],
                  ['Gewicht_kg', item.Gewicht_kg],
                  ['Hauptkategorien_A', item.Hauptkategorien_A],
                  ['Unterkategorien_A', item.Unterkategorien_A],
                  ['Hauptkategorien_B', item.Hauptkategorien_B],
                  ['Unterkategorien_B', item.Unterkategorien_B],
                  ['Veröffentlicht_Status', item.Veröffentlicht_Status],
                  ['Shopartikel', item.Shopartikel],
                  ['Artikeltyp', item.Artikeltyp],
                  ['Einheit', item.Einheit],
                  ['WmsLink', item.WmsLink],
                  ['EntityType', item.EntityType]
                ] as [string, any][]).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{k === 'BoxID' ? <Link to={`/boxes/${encodeURIComponent(String(v))}`}>{v}</Link> : v ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PrintLabelButton itemId={item.ItemUUID} />
            <RelocateItemCard itemId={item.ItemUUID} />
            <div>
              <Link to={`/items/${encodeURIComponent(item.ItemUUID)}/edit`}>Edit</Link>
            </div>
          </div>

          <div className="card">
            <h3>Events</h3>
            <ul className="events">
              {events.map((ev) => (
                <li key={ev.Id}>
                  {formatDateTime(ev.CreatedAt)}: {ev.Event}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
