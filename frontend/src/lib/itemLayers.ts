import { normaliseItemQuant } from '../../../models';
import type { ItemQuant, ItemRecord, ItemRef } from '../../../models';

export function coerceItemRecord(value: unknown, context: string): ItemRecord | null {
  if (!value || typeof value !== 'object') {
    console.warn('coerceItemRecord: non-object payload', { context, value });
    return null;
  }

  const quant = normaliseItemQuant(value as Partial<ItemQuant>);
  if (!quant) {
    console.warn('coerceItemRecord: failed to normalise quantitative layer', { context, value });
    return null;
  }

  const refCandidate = value as Partial<ItemRef>;
  const itemId = typeof refCandidate.ItemUUID === 'string' ? refCandidate.ItemUUID : quant.ItemUUID;
  if (itemId !== quant.ItemUUID) {
    console.warn('coerceItemRecord: mismatched identifiers across layers', {
      context,
      refItemUUID: refCandidate.ItemUUID,
      quantItemUUID: quant.ItemUUID
    });
  }

  const ref: ItemRef = {
    ItemUUID: quant.ItemUUID,
    Artikel_Nummer: refCandidate.Artikel_Nummer,
    Grafikname: refCandidate.Grafikname,
    Artikelbeschreibung: refCandidate.Artikelbeschreibung,
    Verkaufspreis: refCandidate.Verkaufspreis,
    Kurzbeschreibung: refCandidate.Kurzbeschreibung,
    Langtext: refCandidate.Langtext,
    Hersteller: refCandidate.Hersteller,
    Länge_mm: refCandidate.Länge_mm,
    Breite_mm: refCandidate.Breite_mm,
    Höhe_mm: refCandidate.Höhe_mm,
    Gewicht_kg: refCandidate.Gewicht_kg,
    Hauptkategorien_A: refCandidate.Hauptkategorien_A,
    Unterkategorien_A: refCandidate.Unterkategorien_A,
    Hauptkategorien_B: refCandidate.Hauptkategorien_B,
    Unterkategorien_B: refCandidate.Unterkategorien_B,
    Veröffentlicht_Status: refCandidate.Veröffentlicht_Status,
    Shopartikel: refCandidate.Shopartikel,
    Artikeltyp: refCandidate.Artikeltyp,
    Einheit: refCandidate.Einheit,
    WmsLink: refCandidate.WmsLink,
    EntityType: refCandidate.EntityType
  };

  return { ...ref, ...quant };
}

// TODO: Move shared coercion logic to a dedicated data access layer once APIs emit split payloads.
