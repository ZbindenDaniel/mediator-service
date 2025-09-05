import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
    <div className="container item">
      <div className="grid landing-grid">
        {item ? (
          <>
            <div className="card">
              <h2>Item</h2>
              <div className='row'>

                <table className="details">
                  <tbody>
                    {([
                      ['Artikelbeschreibung', item.Artikelbeschreibung],
                      ['Artikel_Nummer', item.Artikel_Nummer],
                      ['Location', item.Location],
                      ['Anzahl', item.Auf_Lager],
                      ['Box', <Link to={`/boxes/${encodeURIComponent(String(item.BoxID))}`}>Box</Link>],
                      ['Kurzbeschreibung', item.Kurzbeschreibung],
                      ['Datum_erfasst', item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : ''],
                      ['UpdatedAt', item.UpdatedAt ? formatDateTime(item.UpdatedAt) : ''],
                      // ['Grafikname', item.Grafikname],
                      ['Verkaufspreis', item.Verkaufspreis],
                      ['Langtext', item.Langtext],
                      ['Hersteller', item.Hersteller],
                      ['Länge_mm', item.Länge_mm],
                      ['Breite_mm', item.Breite_mm],
                      ['Höhe_mm', item.Höhe_mm],
                      ['Gewicht_kg', item.Gewicht_kg],
                      // ['Hauptkategorien_A', item.Hauptkategorien_A],
                      // ['Unterkategorien_A', item.Unterkategorien_A],
                      // ['Hauptkategorien_B', item.Hauptkategorien_B],
                      // ['Unterkategorien_B', item.Unterkategorien_B],
                      // ['Veröffentlicht_Status', item.Veröffentlicht_Status],
                      // ['Shopartikel', item.Shopartikel],
                      // ['Artikeltyp', item.Artikeltyp],
                      ['Einheit', item.Einheit],
                      ['WmsLink', item.WmsLink]
                    ] as [string, any][]).map(([k, v]) => (
                      <tr key={k}>
                        <th>{k}</th>
                        <td>{v ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className='row'>
                <button type="button" className="btn" onClick={() => navigate(`/items/${encodeURIComponent(item.ItemUUID)}/edit`)}>Bearbeiten</button>
              </div>
            </div>

            <RelocateItemCard itemId={item.ItemUUID} />

            <PrintLabelButton itemId={item.ItemUUID} />

            <div className="card">
              <h3>Events</h3>
              <ul className="events">
                {events.map((ev) => (
                  <li key={ev.Id}>
                    {formatDateTime(ev.CreatedAt)}: {ev.Actor ? ev.Actor + ' ' : ''}{ev.Event}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    </div>
  );
}
