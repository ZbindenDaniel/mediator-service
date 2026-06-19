import React, { useEffect, useState } from 'react';
import ZubehoerCard from '../ZubehoerCard';
import type { Item } from '../../../../models';
import type { DisassemblyContract } from '../../../../models/disassembly-contract';
import { fetchDisassemblyContract } from '../../lib/contractsApi';

interface SparePart {
  ItemUUID: string;
  slotKey: string | null;
  Artikel_Nummer: string | null;
  BoxID: string | null;
  Location: string | null;
  Artikelbeschreibung?: string | null;
  Kurzbeschreibung?: string | null;
}

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
  const subCategory = item.Unterkategorien_A ?? null;

  const [disassemblyContract, setDisassemblyContract] = useState<DisassemblyContract | null>(null);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [qualityResponses, setQualityResponses] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!subCategory) return;
    fetchDisassemblyContract(subCategory).then(setDisassemblyContract);
  }, [subCategory]);

  const fetchSpareParts = () => {
    fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/spare-parts`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: any) => setSpareParts(Array.isArray(data.spareParts) ? data.spareParts : []))
      .catch(() => setSpareParts([]));
  };

  useEffect(() => {
    fetchSpareParts();
    fetch(`/api/items/${encodeURIComponent(item.ItemUUID)}/quality-review`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: any) => setQualityResponses(data.responses ?? {}))
      .catch(() => setQualityResponses({}));
  }, [item.ItemUUID]);

  return (
    <ZubehoerCard
      itemUUID={item.ItemUUID}
      artikelNummer={item.Artikel_Nummer ?? null}
      deviceLabel={(item.Artikelbeschreibung || item.Kurzbeschreibung || item.Artikel_Nummer) ?? null}
      deviceHersteller={item.Hersteller ?? null}
      connectedAccessories={connectedAccessories}
      connectedToDevices={connectedToDevices}
      compatibleAccessoryRefs={compatibleAccessoryRefs}
      compatibleParentRefs={compatibleParentRefs}
      onRelationChanged={onRelationChanged}
      disassemblyContract={disassemblyContract}
      spareParts={spareParts}
      qualityResponses={qualityResponses}
      onSparepartChanged={fetchSpareParts}
    />
  );
}
