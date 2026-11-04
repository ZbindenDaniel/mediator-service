import type { Item } from '../../../../models';
import { buildFilteredItemsCsv } from '../BulkItemActionBar';

const parseHeader = (csv: string) => csv.replace(/^﻿/, '').split('\n')[0].split(',');

describe('buildFilteredItemsCsv', () => {
  it('exports the full row with readable specs, quality and stock instead of a sparse stub', () => {
    const row = {
      ItemUUID: 'I-1',
      Artikel_Nummer: '000123',
      Artikelbeschreibung: 'ThinkPad T480',
      Hersteller: 'Lenovo',
      Langtext: { CPU: 'i5-8350U', Anschlüsse: ['USB-C', 'HDMI'] },
      Quality: 4,
      Auf_Lager: 2,
      Verkaufspreis: 249
    } as unknown as Item;

    const csv = buildFilteredItemsCsv([row]);
    const header = parseHeader(csv);
    const values = csv.split('\n')[1];

    expect(csv.startsWith('﻿')).toBe(true);
    expect(header).toEqual(expect.arrayContaining(['Hersteller', 'Spezifikationen', 'Auf_Lager', 'Verkaufspreis']));
    expect(header).not.toContain('Menge');
    expect(values).toContain('Lenovo');
    expect(values).toContain('"CPU: i5-8350U | Anschlüsse: USB-C, HDMI"');
    expect(values).toMatch(/,2,/);
    expect(values).toMatch(/4 \(/);
  });
});
