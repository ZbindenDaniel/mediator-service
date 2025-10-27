// /** @jest-environment jsdom */

// import React from 'react';
// import { fireEvent, render, screen, waitFor } from '@testing-library/react';
// import ItemForm from '../ItemForm';

// describe('ItemForm editing with seeded photos', () => {
//   it('keeps seeded secondary photos visible and submits them when unchanged', async () => {
//     const onSubmit = jest.fn().mockResolvedValue(undefined);

//     render(
//       <ItemForm
//         item={{ ItemUUID: 'item-1' }}
//         submitLabel="Speichern"
//         onSubmit={onSubmit}
//         initialPhotos={['/primary.jpg', '/secondary.jpg', '/tertiary.jpg']}
//       />
//     );

//     await waitFor(() => {
//       expect(screen.getByLabelText('Foto 2')).toBeInTheDocument();
//     });
//     await waitFor(() => {
//       expect(screen.getByLabelText('Foto 3')).toBeInTheDocument();
//     });

//     fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

//     await waitFor(() => {
//       expect(onSubmit).toHaveBeenCalledTimes(1);
//     });

//     const submitted = onSubmit.mock.calls[0][0];
//     expect(submitted.picture2).toBe('/secondary.jpg');
//     expect(submitted.picture3).toBe('/tertiary.jpg');
//   });
// });
