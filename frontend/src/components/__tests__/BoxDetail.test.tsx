// /** @jest-environment jsdom */

// import React from 'react';
// import { render, screen } from '@testing-library/react';
// import userEvent from '@testing-library/user-event';
// import { MemoryRouter } from 'react-router-dom';
// import BoxDetail from '../BoxDetail';

// const mockNavigate = jest.fn();

// jest.mock('react-router-dom', () => {
//   const actual = jest.requireActual('react-router-dom');
//   return {
//     ...actual,
//     useNavigate: () => mockNavigate
//   };
// });

// // TODO(test-coverage): Keep BoxDetail deep-link assertion focused on /items?box=<BoxID> route wiring.

// describe('BoxDetail', () => {
//   const originalFetch = global.fetch;

//   beforeEach(() => {
//     mockNavigate.mockReset();
//     global.fetch = jest.fn().mockResolvedValue({
//       ok: true,
//       json: async () => ({
//         box: {
//           BoxID: 'B-123',
//           Location: 'A1'
//         },
//         items: [],
//         events: [],
//         containedBoxes: []
//       })
//     } as Response);
//   });

//   afterEach(() => {
//     jest.resetAllMocks();
//     global.fetch = originalFetch;
//   });

//   it('renders and uses Detail-Liste action targeting item list box query route', async () => {
//     render(
//       <MemoryRouter>
//         <BoxDetail boxId="B-123" />
//       </MemoryRouter>
//     );

//     const detailListLink = await screen.findByRole('link', { name: 'Detail-Liste' });
//     expect(detailListLink).toHaveAttribute('href', '/items?box=B-123');

//     const user = userEvent.setup();
//     await user.click(detailListLink);

//     expect(mockNavigate).toHaveBeenCalledWith('/items?box=B-123');
//   });
// });
