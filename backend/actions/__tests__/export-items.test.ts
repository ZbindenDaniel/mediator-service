// TODO(agent): Extend export coverage to validate media linking and Langtext serialization nuances.
import { serializeItemsToCsv } from '../export-items';

describe('export-items category serialization', () => {
  test('maps numeric categories to canonical label names for CSV output', () => {
    const rows = [
      {
        Artikel_Nummer: 'A-1000',
        Artikeltyp: 'Laptop',
        Datum_erfasst: '2024-01-01',
        Grafikname: 'primary.png',
        Artikelbeschreibung: 'Test item',
        Kurzbeschreibung: 'Short',
        Langtext: 'Detail',
        Hersteller: 'Example Inc',
        Länge_mm: 100,
        Breite_mm: 50,
        Höhe_mm: 25,
        Gewicht_kg: 2,
        Verkaufspreis: 199.99,
        Auf_Lager: 4,
        Veröffentlicht_Status: 'published',
        Shopartikel: 'shop-article',
        Einheit: 'Stk',
        Hauptkategorien_A: 10,
        Unterkategorien_A: 101,
        Hauptkategorien_B: 50,
        Unterkategorien_B: 503,
        ItemUUID: 'item-uuid-1',
        BoxID: 'box-123',
        LocationId: 'loc-9',
        Label: 'box label',
        UpdatedAt: '2024-02-02T00:00:00.000Z'
      }
    ];

    const { csv } = serializeItemsToCsv(rows);
    const [header, dataLine] = csv.split('\n');
    const headers = header.split(',');
    const values = dataLine.split(',');

    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i];
      const value = values[i] ?? '';
      record[key] = value.replace(/^"|"$/g, '');
    }

    expect(record.cvar_categories_A1).toBe('Computer_und_Komplettsysteme');
    expect(record.cvar_categories_A2).toBe('Komplettsysteme');
    expect(record.cvar_categories_B1).toBe('Tastatur_Maus_Spielsteuerung_Virtual_Reality');
    expect(record.cvar_categories_B2).toBe('Desktop_Set_Tastatur_und_Maus');
  });
});
