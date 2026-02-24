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

  test('allows published status when canonical agentic review state is approved', () => {
    const { csv } = serializeItemsToCsv([{ ...baseRow, AgenticReviewState: 'approved', AgenticStatus: 'inProgress' }]);
    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');
    const publishedIndex = 15;
    expect(values[publishedIndex]).toBe('1');
  });

  test('allows backward-compat status-only rows when agentic status is approved', () => {
    const { csv } = serializeItemsToCsv([{ ...baseRow, AgenticReviewState: undefined, AgenticStatus: 'approved' }]);
    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');
    const publishedIndex = 15;
    expect(values[publishedIndex]).toBe('1');
  });

  test('logs when agentic metadata columns are absent during published gating', () => {
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    const { csv } = serializeItemsToCsv([{ ...baseRow, AgenticStatus: undefined, AgenticReviewState: undefined }]);
    const [, dataLine] = csv.split('\n');
    const values = dataLine.split(',');
    const publishedIndex = 15;

    expect(values[publishedIndex]).toBe('0');
    expect(logSpy).toHaveBeenCalledWith(
      '[export-items] Missing agentic export metadata while evaluating published status gate.',
      expect.objectContaining({
        itemUUID: 'item-uuid-1',
        artikelNummer: 'A-1000',
        agenticStatus: null,
        agenticReviewState: null
      })
    );

    logSpy.mockRestore();
  });

  test('suppresses published status for non-approved review states', () => {
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    const rows = [
      { ...baseRow, ItemUUID: 'item-uuid-1', AgenticReviewState: 'pending' },
      { ...baseRow, ItemUUID: 'item-uuid-2', AgenticReviewState: 'rejected' },
      { ...baseRow, ItemUUID: 'item-uuid-3', AgenticReviewState: 'not_required' }
    ];
    const { csv } = serializeItemsToCsv(rows);
    const [, ...dataLines] = csv.split('\n');
    const publishedIndex = 15;

    expect(dataLines[0].split(',')[publishedIndex]).toBe('0');
    expect(dataLines[1].split(',')[publishedIndex]).toBe('0');
    expect(dataLines[2].split(',')[publishedIndex]).toBe('0');
    expect(logSpy).toHaveBeenCalledWith(
      '[export-items] Agentic review gate suppressed published status during export.',
      expect.objectContaining({ agenticReviewState: 'pending', itemUUID: 'item-uuid-1' })
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[export-items] Agentic review gate suppressed published status during export.',
      expect.objectContaining({ agenticReviewState: 'rejected', itemUUID: 'item-uuid-2' })
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[export-items] Agentic review gate suppressed published status during export.',
      expect.objectContaining({ agenticReviewState: 'not_required', itemUUID: 'item-uuid-3' })
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
      { ...baseRow, Veröffentlicht_Status: '1', AgenticReviewState: 'approved' },
      { ...baseRow, ItemUUID: 'item-uuid-2', Veröffentlicht_Status: 'true', AgenticReviewState: 'approved' },
      { ...baseRow, ItemUUID: 'item-uuid-3', Veröffentlicht_Status: '0', AgenticReviewState: 'approved' },
      { ...baseRow, ItemUUID: 'item-uuid-4', Veröffentlicht_Status: 'false', AgenticReviewState: 'approved' }
    ]);
    const [, firstDataLine, secondDataLine, thirdDataLine, fourthDataLine] = csv.split('\n');
    const publishedIndex = 15;

    expect(firstDataLine.split(',')[publishedIndex]).toBe('1');
    expect(secondDataLine.split(',')[publishedIndex]).toBe('1');
    expect(thirdDataLine.split(',')[publishedIndex]).toBe('0');
    expect(fourthDataLine.split(',')[publishedIndex]).toBe('0');
  });

  test('logs and defaults to unpublished for unknown string published values', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { csv } = serializeItemsToCsv([
      { ...baseRow, Veröffentlicht_Status: 'published', AgenticReviewState: 'approved', AgenticStatus: 'approved' }
    ]);
    const [, dataLine] = csv.split('\n');
    const publishedIndex = 15;

    expect(dataLine.split(',')[publishedIndex]).toBe('0');
    expect(warnSpy).toHaveBeenCalledWith(
      '[export-items] Unknown published status value encountered during export; defaulting to unpublished.',
      expect.objectContaining({
        itemUUID: 'item-uuid-1',
        agenticStatus: 'approved',
        agenticReviewState: 'approved',
        rawPublishedValue: 'published'
      })
    );

    warnSpy.mockRestore();
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
