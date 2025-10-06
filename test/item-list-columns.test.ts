import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import ItemList from '../frontend/src/components/ItemList';
import type { Item } from '../models';

describe('ItemList column rendering', () => {
  test('shows box link text and location tag', () => {
    const items: Item[] = [
      {
        ItemUUID: 'uuid-123',
        Artikelbeschreibung: 'Testartikel',
        Artikel_Nummer: 'ART-1',
        BoxID: 'BX-42',
        Location: 'A-01',
        UpdatedAt: new Date('2024-01-01T00:00:00.000Z')
      }
    ];

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ItemList items={items} />
      </MemoryRouter>
    );

    expect(markup).toContain('>BX-42</a>');
    expect(markup).toContain('A-01');
  });

  test('falls back gracefully when location is missing', () => {
    const items: Item[] = [
      {
        ItemUUID: 'uuid-456',
        Artikelbeschreibung: 'Ersatzteil',
        BoxID: null,
        UpdatedAt: new Date('2024-01-02T00:00:00.000Z')
      }
    ];

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ItemList items={items} />
      </MemoryRouter>
    );

    expect(markup).toContain('>Unbekannter Behälter</a>');
    expect(markup).toContain('Unbekannter Behälter');
    expect(markup).toContain('(nicht gesetzt)');
  });
});
