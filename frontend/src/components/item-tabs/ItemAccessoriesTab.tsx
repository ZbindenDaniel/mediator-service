import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ZubehoerCard from '../ZubehoerCard';
import type { Item } from '../../../../models';
import { fetchPartsTree } from '../../lib/partsTree';
import type { PartsTreeNode } from '../../lib/partsTree';

interface Props {
  item: Item;
  connectedAccessories: any[];
  connectedToDevices: any[];
  compatibleAccessoryRefs: any[];
  compatibleParentRefs: any[];
  onRelationChanged: () => void;
  canEditItem?: boolean;
  canEditReference?: boolean;
}

function countParts(node: PartsTreeNode): { inDevice: number; removed: number } {
  let inDevice = 0;
  let removed = 0;
  for (const slot of node.assembly?.slots ?? []) {
    for (const child of slot.items) {
      if (child.boxId) removed += 1; else inDevice += 1;
      const nested = countParts(child);
      inDevice += nested.inDevice;
      removed += nested.removed;
    }
  }
  return { inDevice, removed };
}

// Components are taken apart on the Einzelteile page; this tab only summarises them and keeps the
// accessory links (charger, "gehört zu", compatible articles), which are not parts of the device.
function ComponentsSummary({ itemUUID }: { itemUUID: string }) {
  const [tree, setTree] = useState<PartsTreeNode | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPartsTree(itemUUID).then((t) => { if (!cancelled) setTree(t); }).catch(() => { if (!cancelled) setTree(null); });
    return () => { cancelled = true; };
  }, [itemUUID]);
  if (!tree?.assembly) return null;
  const { inDevice, removed } = countParts(tree);
  return (
    <div className="card grid-span-2">
      <h3>Einzelteile</h3>
      <p className="muted">
        {inDevice + removed === 0 ? 'Noch keine Teile erfasst.' : `${inDevice} Teile im Gerät erfasst · ${removed} entnommen`}
      </p>
      <Link className="btn" to={`/items/${encodeURIComponent(itemUUID)}/einzelteile`}>Einzelteile öffnen</Link>
    </div>
  );
}

export default function ItemAccessoriesTab({
  item,
  connectedAccessories,
  connectedToDevices,
  compatibleAccessoryRefs,
  compatibleParentRefs,
  onRelationChanged,
  canEditItem,
  canEditReference
}: Props) {
  return (
    <>
      <ComponentsSummary itemUUID={item.ItemUUID} />
      <ZubehoerCard
        itemUUID={item.ItemUUID}
        artikelNummer={item.Artikel_Nummer ?? null}
        connectedAccessories={connectedAccessories}
        connectedToDevices={connectedToDevices}
        compatibleAccessoryRefs={compatibleAccessoryRefs}
        compatibleParentRefs={compatibleParentRefs}
        onRelationChanged={onRelationChanged}
        canEditItem={canEditItem}
        canEditReference={canEditReference}
      />
    </>
  );
}
