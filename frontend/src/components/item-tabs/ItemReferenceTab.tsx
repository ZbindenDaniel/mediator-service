import React from 'react';
import ShopBadge from '../ShopBadge';
import ZubehoerBadge from '../ZubehoerBadge';
import type { Item } from '../../../../models';
import DetailRows from '../DetailRows';
import { useFeature } from '../../context/FeaturesContext';

interface Props {
  item: Item;
  referenceDetailRows: [string, React.ReactNode][];
  connectedToDevices: any[];
  compatibleParentRefs: any[];
  // Omitted when the requester may not change this catalogue entry (another org's, tenancy 3a).
  onEdit?: () => void;
  onShopStatus?: () => void;
}

export default function ItemReferenceTab({
  item,
  referenceDetailRows,
  connectedToDevices,
  compatibleParentRefs,
  onEdit,
  onShopStatus
}: Props) {
  const shopwareEnabled = useFeature('shopware');
  return (
    <>
      <div className="tab-actions">
        {onEdit && <button type="button" className="btn" onClick={onEdit}>Bearbeiten</button>}
        {shopwareEnabled && onShopStatus && <button type="button" className="btn" onClick={onShopStatus}>Shopartikel</button>}
      </div>
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
        <DetailRows rows={referenceDetailRows} />
      ) : (
        <p className="muted">Keine Referenzdaten vorhanden.</p>
      )}
    </div>
    </>
  );
}
