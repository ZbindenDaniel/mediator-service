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
    const expectedHeaders = [
      'Artikel-Nummer',
      'Artikeltyp',
      'CreatedAt',
      'Grafikname(n)',
      'Artikelbeschreibung',
      'Kurzbeschreibung',
      'Langtext',
      'Hersteller',
      'Länge(mm)',
      'Breite(mm)',
      'Höhe(mm)',
      'Gewicht(kg)',
      'Verkaufspreis',
      'Auf Lager',
      'Veröffentlicht_Status',
      'Shopartikel',
      'Einheit',
      'EAN',
      'Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
      'Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)',
      'Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
      'Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)',
      'ItemUUID',
      'BoxID',
      'Location',
      'Label',
      'UpdatedAt'
    ];

    expect(headers).toEqual(expectedHeaders);
    const values = dataLine.split(',');

    const record: Record<string, string> = {};
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i];
      const value = values[i] ?? '';
      record[key] = value.replace(/^"|"$/g, '');
    }

    expect(record['Hauptkategorien_A_(entsprechen_den_Kategorien_im_Shop)']).toBe(
      'Computer_und_Komplettsysteme'
    );
    expect(record['Unterkategorien_A_(entsprechen_den_Kategorien_im_Shop)']).toBe('Komplettsysteme');
    expect(record['Hauptkategorien_B_(entsprechen_den_Kategorien_im_Shop)']).toBe(
      'Tastatur_Maus_Spielsteuerung_Virtual_Reality'
    );
    expect(record['Unterkategorien_B_(entsprechen_den_Kategorien_im_Shop)']).toBe(
      'Desktop_Set_Tastatur_und_Maus'
    );
  });
});

describe('export-items published status gating', () => {
  const baseRow = {
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
    Veröffentlicht_Status: true,
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
  };

  test('preserves published status when agentic status is reviewed', () => {
    const { csv } = serializeItemsToCsv([{ ...baseRow, AgenticStatus: 'reviewed' }]);
    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');
    const publishedIndex = 14;
    expect(values[publishedIndex]).toBe('true');
  });

  test('drops published status when agentic status is not reviewed', () => {
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    const { csv } = serializeItemsToCsv([{ ...baseRow, AgenticStatus: 'inProgress' }]);
    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');
    const publishedIndex = 14;

    expect(values[publishedIndex]).toBe('false');
    expect(logSpy).toHaveBeenCalledWith(
      '[export-items] Agentic review gate suppressed published status during export.',
      expect.objectContaining({ agenticStatus: 'inProgress', itemUUID: 'item-uuid-1' })
    );

    logSpy.mockRestore();
  });

  test('keeps unpublished rows unaffected by agentic status gating', () => {
    const { csv } = serializeItemsToCsv([{ ...baseRow, Veröffentlicht_Status: false, AgenticStatus: 'notStarted' }]);
    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');
    const publishedIndex = 14;

    expect(values[publishedIndex]).toBe('false');
  });
});
