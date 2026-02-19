// TODO(agent): Extend export coverage to validate media linking and Langtext serialization nuances.
import { serializeItemsToCsv } from '../export-items';

describe('export-items category serialization', () => {
  // TODO(agent): Validate header ordering expectations for Suchbegriff once CSV consumers finalize schema.
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
      'Suchbegriff',
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

describe('export-items Artikelnummer formatting', () => {
  test('left-pads numeric Artikelnummer values to six digits', () => {
    const { csv } = serializeItemsToCsv([
      {
        Artikel_Nummer: 101,
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
      }
    ]);

    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');

    expect(values[0]).toBe('000101');
  });

  test('leaves non-numeric Artikelnummer values unchanged', () => {
    const { csv } = serializeItemsToCsv([
      {
        Artikel_Nummer: 'MAT-101',
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
      }
    ]);

    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');

    expect(values[0]).toBe('MAT-101');
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
    const publishedIndex = 15;
    expect(values[publishedIndex]).toBe('1');
  });

  test('drops published status when agentic status is not reviewed', () => {
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    const { csv } = serializeItemsToCsv([{ ...baseRow, AgenticStatus: 'inProgress' }]);
    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');
    const publishedIndex = 15;

    expect(values[publishedIndex]).toBe('0');
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
    const publishedIndex = 15;

    expect(values[publishedIndex]).toBe('0');
  });


  test('normalizes string published flags to numeric export values', () => {
    const { csv } = serializeItemsToCsv([
      { ...baseRow, Veröffentlicht_Status: 'true', AgenticStatus: 'reviewed' },
      { ...baseRow, ItemUUID: 'item-uuid-2', Veröffentlicht_Status: 'false', AgenticStatus: 'reviewed' }
    ]);
    const [, firstDataLine, secondDataLine] = csv.split('\n');
    const publishedIndex = 15;

    expect(firstDataLine.split(',')[publishedIndex]).toBe('1');
    expect(secondDataLine.split(',')[publishedIndex]).toBe('0');
  });
});

describe('export-items Langtext quality enrichment', () => {
  const baseRow = {
    Artikel_Nummer: 'A-1000',
    Artikeltyp: 'Laptop',
    Datum_erfasst: '2024-01-01',
    Grafikname: 'primary.png',
    Artikelbeschreibung: 'Test item',
    Kurzbeschreibung: 'Short',
    Langtext: { Specs: 'Detail block' },
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
    Quality: 4,
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

  const serializeForMode = (mode: 'backup' | 'erp'): string => {
    let dataLine = '';

    jest.isolateModules(() => {
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      const { serializeItemsToCsv } = require('../export-items');
      const { csv } = serializeItemsToCsv([{ ...baseRow }], undefined, { exportMode: mode });
      [, dataLine] = csv.split('\n');
    });

    return dataLine;
  };

  for (const [mode, snippet] of [
    ['backup', 'Qualität'],
    ['erp', '**Qualität** Gut']
  ] as const) {
    test(`adds normalized quality label to Langtext payload for ${mode} export mode`, () => {
      const dataLine = serializeForMode(mode);
      expect(dataLine).toContain(snippet);
      expect(dataLine).toContain('Gut');
    });
  }

  test('does not mutate the original Langtext payload during enrichment', () => {
    const row = { ...baseRow, Langtext: { Specs: 'Detail block' } };

    jest.isolateModules(() => {
      // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
      const { serializeItemsToCsv } = require('../export-items');
      serializeItemsToCsv([row]);
    });

    expect(row.Langtext).toEqual({ Specs: 'Detail block' });
  });
});

describe('export-items import contract header regimes', () => {
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

  test('uses key-based automatic_import labels/order while keeping manual_import headers unchanged', () => {
    const manual = serializeItemsToCsv([baseRow], undefined, { exportMode: 'backup' });
    const automatic = serializeItemsToCsv([baseRow], undefined, { exportMode: 'erp' });

    const [manualHeader] = manual.csv.split('\n');
    const [automaticHeader] = automatic.csv.split('\n');
    const manualHeaders = manualHeader.split(',');
    const automaticHeaders = automaticHeader.split(',');

    expect(manualHeaders.slice(0, 5)).toEqual([
      'Artikel-Nummer',
      'Artikeltyp',
      'CreatedAt',
      'Grafikname(n)',
      'Artikelbeschreibung'
    ]);
    expect(automaticHeaders.slice(0, 6)).toEqual([
      'partnumber',
      'type',
      'CreatedAt',
      'image',
      'description',
      'Suchbegriff'
    ]);
    expect(automaticHeaders).not.toContain('itemUUID');
  });

  test('logs selected contract and preserves header/field count parity', () => {
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    const { csv } = serializeItemsToCsv([baseRow], undefined, { exportMode: 'erp' });
    const [header, row] = csv.split('\n');

    expect(header.split(',')).toHaveLength(row.split(',').length);
    expect(logSpy).toHaveBeenCalledWith(
      '[export-items] CSV serialization header contract selected.',
      expect.objectContaining({ contract: 'automatic_import', sampleHeaders: ['partnumber', 'type', 'CreatedAt'] })
    );

    logSpy.mockRestore();
  });
});
