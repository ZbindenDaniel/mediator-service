import React from 'react';
import ShopBadge from '../ShopBadge';
import ZubehoerBadge from '../ZubehoerBadge';
import { normalizeDetailValue } from '../../lib/itemDetailFormatting';
import type { Item } from '../../../../models';

interface Props {
  item: Item;
  referenceDetailRows: [string, React.ReactNode][];
  neighborIds: { previousId: string | null; nextId: string | null };
  neighborsLoading: boolean;
  connectedToDevices: any[];
  compatibleParentRefs: any[];
  onNeighborNav: (direction: 'previous' | 'next') => void;
  // kept for future use (e.g. edit button in tab header)
  onEdit: () => void;
}

export default function ItemReferenceTab({
  item,
  referenceDetailRows,
  neighborIds,
  neighborsLoading,
  connectedToDevices,
  compatibleParentRefs,
  onNeighborNav
}: Props) {
  return (
    <>
      <div className="card">
        <div className='top-row'>
          <button
            type="button"
            className="sml-btn btn"
            disabled={!neighborIds.previousId || neighborsLoading}
            onClick={() => onNeighborNav('previous')}
            aria-label="Vorheriger Artikel"
          >
            ←
          </button>
          <button
            type="button"
            className="sml-btn btn"
            disabled={!neighborIds.nextId || neighborsLoading}
            onClick={() => onNeighborNav('next')}
            aria-label="Nächster Artikel"
          >
            →
          </button>
        </div>

        <h2 className="item-detail__title">
          Artikel <span className="muted">({item.ItemUUID})</span>
          <span style={{ marginLeft: '8px' }}>
            <ShopBadge
              compact
              labelPrefix="Shop/Veröffentlichung"
              shopartikel={item.Shopartikel ?? null}
              publishedStatus={item.Veröffentlicht_Status ?? null}
            />
          </span>
          <span style={{ marginLeft: '4px' }}>
            <ZubehoerBadge
              compact
              mode={
                connectedToDevices.length > 0
                  ? 'connected'
                  : compatibleParentRefs.length > 0
                    ? 'available'
                    : null
              }
            />
          </span>
        </h2>
        <h3>Referenz</h3>
        {referenceDetailRows.length > 0 ? (
          <table className="details">
            <tbody>
              {referenceDetailRows.map(([k, v], idx) => {
                const cell = normalizeDetailValue(v);
                return (
                  <tr key={`${k}-${idx}`} className="responsive-row">
                    <th className="responsive-th">{k}</th>
                    <td className={`responsive-td${cell.isPlaceholder ? ' is-placeholder' : ''}`}>
                      {cell.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">Keine Referenzdaten vorhanden.</p>
        )}
      </div>
    </>
  );
}
