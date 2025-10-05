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

export interface ItemQuantity {
  ItemUUID: string;
  ItemRefID: number | null;
  BoxID: string | null;
  Location: string | null;
  StoredLocation: string | null;
  Quantity: number;
  CreatedAt?: unknown;
  UpdatedAt?: unknown;
}

export interface ItemResponseRow<T = Record<string, unknown>> extends T {
  reference: ItemReference;
  quantity: ItemQuantity;
}

export function attachItemRelations<T extends Record<string, any> | null | undefined>(
  row: T
): T extends null | undefined ? T : ItemResponseRow<T & Record<string, any>> {
  if (!row) {
    return row as any;
  }

  const refId = typeof row.ItemRefID === 'number' ? row.ItemRefID : null;
  const location =
    typeof row.Location === 'string' && row.Location.trim()
      ? row.Location.trim()
      : typeof row.StoredLocation === 'string' && row.StoredLocation.trim()
      ? row.StoredLocation.trim()
      : null;

  const reference: ItemReference = {
    ItemRefID: refId,
    Datum_erfasst: row.Datum_erfasst ?? null,
    Artikel_Nummer: row.Artikel_Nummer ?? null,
    Grafikname: row.Grafikname ?? null,
    Artikelbeschreibung: row.Artikelbeschreibung ?? null,
    Verkaufspreis: row.Verkaufspreis ?? null,
    Kurzbeschreibung: row.Kurzbeschreibung ?? null,
    Langtext: row.Langtext ?? null,
    Hersteller: row.Hersteller ?? null,
    Länge_mm: row.Länge_mm ?? null,
    Breite_mm: row.Breite_mm ?? null,
    Höhe_mm: row.Höhe_mm ?? null,
    Gewicht_kg: row.Gewicht_kg ?? null,
    Hauptkategorien_A: row.Hauptkategorien_A ?? null,
    Unterkategorien_A: row.Unterkategorien_A ?? null,
    Hauptkategorien_B: row.Hauptkategorien_B ?? null,
    Unterkategorien_B: row.Unterkategorien_B ?? null,
    Veröffentlicht_Status: row.Veröffentlicht_Status ?? null,
    Shopartikel: row.Shopartikel ?? null,
    Artikeltyp: row.Artikeltyp ?? null,
    Einheit: row.Einheit ?? null,
    WmsLink: row.WmsLink ?? null
  };

  const quantity: ItemQuantity = {
    ItemUUID: row.ItemUUID,
    ItemRefID: refId,
    BoxID:
      typeof row.BoxID === 'string'
        ? row.BoxID.trim() || null
        : row.BoxID ?? null,
    Location: location,
    StoredLocation:
      typeof row.StoredLocation === 'string' && row.StoredLocation.trim()
        ? row.StoredLocation.trim()
        : null,
    Quantity:
      typeof row.Auf_Lager === 'number'
        ? row.Auf_Lager
        : typeof row.Quantity === 'number'
        ? row.Quantity
        : 0,
    CreatedAt: row.CreatedAt ?? null,
    UpdatedAt: row.UpdatedAt ?? null
  };

  return { ...(row as Record<string, any>), reference, quantity } as any;
}

export function attachItemRelationsToMany<T extends Record<string, any>>(rows: T[]): Array<
  ItemResponseRow<T>
> {
  return rows.map((row) => attachItemRelations(row) as ItemResponseRow<T>);
}
