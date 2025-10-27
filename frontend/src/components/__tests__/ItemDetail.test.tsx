// /** @jest-environment jsdom */

// import React from 'react';
// import { render, screen, within } from '@testing-library/react';
// import { MemoryRouter } from 'react-router-dom';
// import ItemDetail from '../ItemDetail';
// import { DialogProvider } from '../dialog';
// import { EventLogLevel } from '../../../models';

// describe('ItemDetail category rendering', () => {
//   const originalFetch = global.fetch;

//   beforeEach(() => {
//     const fetchMock = jest.fn().mockResolvedValue({
//       ok: true,
//       json: async () => ({
//         item: {
//           ItemUUID: 'item-1',
//           Artikelbeschreibung: 'Testgerät',
//           Artikel_Nummer: 'ITM-1',
//           Auf_Lager: 1,
//           BoxID: null,
//           Kurzbeschreibung: 'Kurz',
//           Hauptkategorien_A: 20,
//           Unterkategorien_A: 201,
//           Hauptkategorien_B: undefined,
//           Unterkategorien_B: undefined,
//           Datum_erfasst: null,
//           UpdatedAt: null,
//           Verkaufspreis: null,
//           Langtext: null,
//           Hersteller: null,
//           Länge_mm: null,
//           Breite_mm: null,
//           Höhe_mm: null,
//           Gewicht_kg: null,
//           Einheit: null
//         },
//         events: [
//           {
//             Id: 1,
//             Actor: 'tester',
//             Event: 'Created',
//             Level: EventLogLevel.Information,
//             EntityType: 'Item',
//             EntityId: 'item-1',
//             CreatedAt: '2024-01-01T12:00:00Z',
//             Meta: null
//           }
//         ],
//         agentic: null,
//         media: []
//       })
//     });

//     // @ts-expect-error override fetch for test
//     global.fetch = fetchMock;
//   });

//   afterEach(() => {
//     jest.resetAllMocks();
//     // @ts-expect-error restore fetch
//     global.fetch = originalFetch;
//   });

//   function renderComponent() {
//     return render(
//       <MemoryRouter>
//         <DialogProvider>
//           <ItemDetail itemId="item-1" />
//         </DialogProvider>
//       </MemoryRouter>
//     );
//   }

//   it('uses dataset labels for known Haupt- and Unterkategorien and shows placeholders otherwise', async () => {
//     renderComponent();

//     const hauptRowHeader = await screen.findByText('Hauptkategorie A');
//     const hauptRow = hauptRowHeader.closest('tr');
//     expect(hauptRow).not.toBeNull();
//     const hauptWithin = within(hauptRow as HTMLTableRowElement);
//     expect(hauptWithin.getByText('Laptop und Zubehör')).toBeTruthy();
//     expect(hauptWithin.getByText('(20)')).toBeTruthy();

//     const unterRowHeader = await screen.findByText('Unterkategorie A');
//     const unterRow = unterRowHeader.closest('tr');
//     expect(unterRow).not.toBeNull();
//     const unterWithin = within(unterRow as HTMLTableRowElement);
//     expect(unterWithin.getByText('Laptop und Zubehör')).toBeTruthy();
//     expect(unterWithin.getByText('→')).toBeTruthy();
//     expect(unterWithin.getByText('Laptop')).toBeTruthy();
//     expect(unterWithin.getByText('(201)')).toBeTruthy();

//     const hauptBRowHeader = await screen.findByText('Hauptkategorie B');
//     const hauptBRow = hauptBRowHeader.closest('tr');
//     expect(hauptBRow).not.toBeNull();
//     const hauptBWithin = within(hauptBRow as HTMLTableRowElement);
//     const placeholder = hauptBWithin.getByText('Nicht gesetzt');
//     expect(placeholder).toBeTruthy();
//     const placeholderCell = placeholder.closest('td');
//     expect(placeholderCell).not.toBeNull();
//     expect((placeholderCell as HTMLTableCellElement).classList.contains('is-placeholder')).toBe(true);
//   });
// });
