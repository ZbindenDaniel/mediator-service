export interface ItemReference {
  ItemRefID: number | null;
  Datum_erfasst?: unknown;
  Artikel_Nummer?: unknown;
  Grafikname?: unknown;
  Artikelbeschreibung?: unknown;
  Verkaufspreis?: unknown;
  Kurzbeschreibung?: unknown;
  Langtext?: unknown;
  Hersteller?: unknown;
  Länge_mm?: unknown;
  Breite_mm?: unknown;
  Höhe_mm?: unknown;
  Gewicht_kg?: unknown;
  Hauptkategorien_A?: unknown;
  Unterkategorien_A?: unknown;
  Hauptkategorien_B?: unknown;
  Unterkategorien_B?: unknown;
  Veröffentlicht_Status?: unknown;
  Shopartikel?: unknown;
  Artikeltyp?: unknown;
  Einheit?: unknown;
  WmsLink?: unknown;
}

export interface ItemQuant {
  ItemUUID: string;
  ItemRefID: number | null;
  BoxID: string | null;
  Location?: string | null;
  StoredLocation?: string | null;
  Quantity: number;
  CreatedAt?: unknown;
  UpdatedAt?: unknown;
}

export interface Item {
  ItemUUID: string;
  ItemRefID?: number;
  BoxID: string | null;
  StoredLocation?: string | null;
  Location?: string | null;
  UpdatedAt: Date | unknown;
  CreatedAt?: Date | unknown;
  Datum_erfasst?: Date | unknown;
  Artikel_Nummer?: string | null;
  Grafikname?: string | null;
  Artikelbeschreibung?: string | null;
  Auf_Lager?: number;
  Verkaufspreis?: number;
  Kurzbeschreibung?: string | null;
  Langtext?: string | null;
  Hersteller?: string | null;
  Länge_mm?: number;
  Breite_mm?: number;
  Höhe_mm?: number;
  Gewicht_kg?: number;
  Hauptkategorien_A?: number;
  Unterkategorien_A?: number;
  Hauptkategorien_B?: number;
  Unterkategorien_B?: number;
  Veröffentlicht_Status?: boolean;
  Shopartikel?: number;
  Artikeltyp?: string | null;
  Einheit?: string | null;
  WmsLink?: string | null;
  EntityType?: string;
  reference?: ItemReference;
  quantity?: ItemQuant;
}

export interface ItemWithRelations extends Item {
  reference: ItemReference;
  quantity: ItemQuant;
}
