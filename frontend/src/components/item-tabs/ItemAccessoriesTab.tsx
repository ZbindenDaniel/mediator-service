import React from 'react';
import ZubehoerCard from '../ZubehoerCard';
import type { Item } from '../../../../models';

interface Props {
  item: Item;
  connectedAccessories: any[];
  connectedToDevices: any[];
  compatibleAccessoryRefs: any[];
  compatibleParentRefs: any[];
  onRelationChanged: () => void;
}

export default function ItemAccessoriesTab({
  item,
  connectedAccessories,
  connectedToDevices,
  compatibleAccessoryRefs,
  compatibleParentRefs,
  onRelationChanged
}: Props) {
  return (
    <ZubehoerCard
      itemUUID={item.ItemUUID}
      artikelNummer={item.Artikel_Nummer ?? null}
      connectedAccessories={connectedAccessories}
      connectedToDevices={connectedToDevices}
      compatibleAccessoryRefs={compatibleAccessoryRefs}
      compatibleParentRefs={compatibleParentRefs}
      onRelationChanged={onRelationChanged}
    />
  );
}
