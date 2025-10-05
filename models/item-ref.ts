// TODO: Align ItemRef naming with API contract once quantitative split stabilises.
export interface ItemRef {
  ItemUUID: string;
  Artikel_Nummer?: string;
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
  Veröffentlicht_Status?: boolean;
  Shopartikel?: number;
  Artikeltyp?: string;
  Einheit?: string;
  WmsLink?: string;
  EntityType?: string;
}
