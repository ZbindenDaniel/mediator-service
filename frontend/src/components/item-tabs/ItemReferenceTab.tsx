import React from 'react';
import ShopBadge from '../ShopBadge';
import ZubehoerBadge from '../ZubehoerBadge';
import { normalizeDetailValue } from '../../lib/itemDetailFormatting';
import type { Item } from '../../../../models';

interface Props {
  item: Item;
  referenceDetailRows: [string, React.ReactNode][];
  connectedToDevices: any[];
  compatibleParentRefs: any[];
}

export default function ItemReferenceTab({
  item,
  referenceDetailRows,
  connectedToDevices,
  compatibleParentRefs
}: Props) {
  return (
    <div className="card">
      <div className="item-reference-tab__badges">
        <ShopBadge
          compact
          labelPrefix="Shop/Veröffentlichung"
          shopartikel={item.Shopartikel ?? null}
          publishedStatus={item.Veröffentlicht_Status ?? null}
        />
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
      </div>
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
  );
}
