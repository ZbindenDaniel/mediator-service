export interface ItemRelation {
  Id: number;
  ParentItemUUID: string;
  ChildItemUUID: string;
  RelationType: string;
  Notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface ItemRefRelation {
  Id: number;
  ParentArtikel_Nummer: string;
  ChildArtikel_Nummer: string;
  RelationType: string;
  Notes: string | null;
  CreatedAt: string;
}

/** Summary of an accessory instance connected to a device, or vice versa */
export interface ConnectedItemSummary {
  ItemUUID: string;
  Artikel_Nummer: string | null;
  Artikelbeschreibung: string | null;
  Kurzbeschreibung: string | null;
  RelationType: string;
  Notes: string | null;
  RelationCreatedAt: string;
  BoxID: string | null;
  Location: string | null;
}

/** Compatible accessory ref type listed on a device's catalog entry */
export interface CompatibleAccessoryRef {
  Artikel_Nummer: string;
  Artikelbeschreibung: string | null;
  Kurzbeschreibung: string | null;
  RelationType: string;
  Notes: string | null;
  availableCount: number;
}
