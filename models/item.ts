export interface ItemInstance {
  ItemUUID: string;
  Artikel_Nummer?: string | null;
  BoxID: string | null;
  Location?: string | null;
  UpdatedAt: Date;
  Datum_erfasst?: Date;
  Auf_Lager?: number;
}

export interface ItemRef {
  Artikel_Nummer: string;
  Grafikname?: string;
  Artikelbeschreibung?: string;
  Verkaufspreis?: number;
  Kurzbeschreibung?: string;
  Langtext?: string;
  Hersteller?: string;
  Länge_mm?: number;
  Breite_mm?: number;
  Höhe_mm?: number;
  Gewicht_kg?: number;
  Hauptkategorien_A?: number;
  Unterkategorien_A?: number;
  Hauptkategorien_B?: number;
  Unterkategorien_B?: number;
  Veröffentlicht_Status?: boolean | string;
  Shopartikel?: number;
  Artikeltyp?: string;
  Einheit?: string;
  EntityType?: string;
}

export type Item = ItemInstance & Partial<ItemRef>;
