import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PrintLabelButton from './PrintLabelButton';
import RelocateItemCard from './RelocateItemCard';
import type { Item, EventLog } from '../../../models';
import { formatDateTime } from '../lib/format';
import { getUser } from '../lib/user';

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

  async function handleDelete() {
    if (!item) return;
    if (!window.confirm('Item wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: getUser(), confirm: true })
      });
      if (res.ok) {
        if (item.BoxID) {
          navigate(`/boxes/${encodeURIComponent(String(item.BoxID))}`);
        } else {
          navigate('/');
        }
      } else {
        console.error('Failed to delete item', res.status);
      }
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  }

  return (
    <div className="container item">
      <div className="grid landing-grid">
        {item ? (
          <>
            <div className="card">
              <h2>Artikel <span className="muted">({item.Auf_Lager ?? 0})</span></h2>
              <div className='row'>

                <table className="details">
                  <tbody>
                    {([
                      ['Erstellt von', events.length ? events[events.length - 1].Actor : ''],
                      ['Artikelbeschreibung', item.Artikelbeschreibung],
                      ['Artikelnummer', item.Artikel_Nummer],
                      ['Anzahl', item.Auf_Lager],
                      ['Behälter', item.BoxID ? <Link to={`/boxes/${encodeURIComponent(String(item.BoxID))}`}>{item.BoxID}</Link> : ''],
                      ['Kurzbeschreibung', item.Kurzbeschreibung],
                      ['Erfasst am', item.Datum_erfasst ? formatDateTime(item.Datum_erfasst) : ''],
                      ['Aktualisiert am', item.UpdatedAt ? formatDateTime(item.UpdatedAt) : ''],
                      ['Verkaufspreis', item.Verkaufspreis],
                      ['Langtext', item.Langtext],
                      ['Hersteller', item.Hersteller],
                      ['Länge (mm)', item.Länge_mm],
                      ['Breite (mm)', item.Breite_mm],
                      ['Höhe (mm)', item.Höhe_mm],
                      ['Gewicht (kg)', item.Gewicht_kg],
                      ['Einheit', item.Einheit],
                      ['Kivi-Link', item.WmsLink]
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
                <button type="button" className="btn" onClick={async () => {
                  if (!window.confirm('Entnehmen?')) return;
                  try {
                    const res = await fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/remove`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ actor: getUser() })
                    });
                    if (res.ok) {
                      const j = await res.json();
                      setItem({ ...item, Auf_Lager: j.quantity, BoxID: j.boxId });
                      console.log('Item entnommen', item.ItemUUID);
                    } else {
                      console.error('Failed to remove item', res.status);
                    }
                  } catch (err) {
                    console.error('Entnahme fehlgeschlagen', err);
                  }
                }}>Entnehmen</button>
                <button type="button" className="btn danger" onClick={handleDelete}>Löschen</button>
              </div>
            </div>

            <RelocateItemCard itemId={item.ItemUUID} />

            <PrintLabelButton itemId={item.ItemUUID} />

            <div className="card">
              <h3>Aktivitäten</h3>
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
