export interface Item {
  ItemUUID: string;
  BoxID: string | null;
  Location?: string;
  UpdatedAt: Date;
  Datum_erfasst?: Date;
  Artikel_Nummer?: string;
  Grafikname?: string;
  Artikelbeschreibung?: string;
  Auf_Lager?: number;
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
  EntityType?: string;
}
