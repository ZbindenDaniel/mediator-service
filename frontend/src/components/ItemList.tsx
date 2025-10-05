import React from 'react';
import { Link } from 'react-router-dom';
import type { ItemWithRelations } from '../../../models';
import BoxColorTag from './BoxColorTag';
import { GoLinkExternal } from "react-icons/go";

interface Props {
  items: ItemWithRelations[];
}

export default function ItemList({ items }: Props) {
  return (
    <div className="item-list-wrapper">
      <table className="item-list">
        <thead>
          <tr className="item-list-header">
            <th className="col-id" style={{ display: 'none' }}>Id</th>
            <th className="col-select"></th>
            <th className="col-desc">Artikel</th>
            <th className="col-box">Behälter</th>
            <th className="col-location">Lagerort</th>
            <th className="col-link"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const artikelbeschreibung =
              typeof it.reference?.Artikelbeschreibung === 'string'
                ? it.reference.Artikelbeschreibung
                : it.Artikelbeschreibung || '';
            const artikelNummer =
              typeof it.reference?.Artikel_Nummer === 'string'
                ? it.reference.Artikel_Nummer
                : it.Artikel_Nummer || '';
            const boxId = it.quantity?.BoxID ?? it.BoxID ?? '';
            const locationKey = it.quantity?.Location ?? it.quantity?.StoredLocation ?? it.Location ?? undefined;
            const quantity = typeof it.quantity?.Quantity === 'number' ? it.quantity.Quantity : it.Auf_Lager ?? 0;
            const itemId = it.quantity?.ItemUUID ?? it.ItemUUID;
            return (
              <tr key={itemId} data-item-uuid={itemId} className="item-list-row">
                <td className="col-id" style={{ display: 'none' }}>{itemId}</td>
              <td className="col-select"><input type="checkbox" /></td>
                <td className="col-desc">
                  <div>{artikelbeschreibung || 'Keine Beschreibung'}</div>
                  <div className="muted">Artikelnummer: {artikelNummer || '—'} · Bestand: {quantity}</div>
                </td>
                <td className="col-box">{boxId}</td>
                <td className="col-location"><BoxColorTag locationKey={locationKey} /></td>
                <td className="col-link">
                  <Link to={`/items/${encodeURIComponent(itemId)}`}><GoLinkExternal /></Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
