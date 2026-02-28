// /** @jest-environment jsdom */

// import React from 'react';
// import { fireEvent, render, screen } from '@testing-library/react';
// import { ItemBasicInfoForm } from '../ItemBasicInfoForm';
// import { ItemEinheit } from '../../../../models';

// function getInputByRowLabel(container: HTMLElement, labelText: string): HTMLInputElement {
//   const rows = Array.from(container.querySelectorAll('.row'));
//   const row = rows.find((candidate) => candidate.querySelector('label')?.textContent?.trim() === labelText);
//   if (!row) {
//     throw new Error(`Row with label "${labelText}" not found`);
//   }
//   const input = row.querySelector('input');
//   if (!input) {
//     throw new Error(`Input with label "${labelText}" not found`);
//   }
//   return input;
// }

// // TODO(test-coverage): Keep ItemBasicInfoForm submit-path tests focused on optional dimension/weight normalization.
// describe('ItemBasicInfoForm', () => {
//   it('submits entered optional dimensions/weight values via onSubmit payload', () => {
//     const onSubmit = jest.fn();
//     const { container } = render(
//       <ItemBasicInfoForm
//         initialValues={{ Artikelbeschreibung: 'Initial', Auf_Lager: 1, Einheit: ItemEinheit.Stk }}
//         onSubmit={onSubmit}
//       />
//     );

//     fireEvent.change(getInputByRowLabel(container, 'Länge (mm)'), { target: { value: '120' } });
//     fireEvent.change(getInputByRowLabel(container, 'Breite (mm)'), { target: { value: '45' } });
//     fireEvent.change(getInputByRowLabel(container, 'Höhe (mm)'), { target: { value: '78' } });
//     fireEvent.change(getInputByRowLabel(container, 'Gewicht (kg)'), { target: { value: '1.25' } });

//     fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

//     expect(onSubmit).toHaveBeenCalledTimes(1);
//     expect(onSubmit).toHaveBeenCalledWith(
//       expect.objectContaining({
//         Länge_mm: 120,
//         Breite_mm: 45,
//         Höhe_mm: 78,
//         Gewicht_kg: 1.25
//       })
//     );
//   });

//   it('keeps optional dimension/weight fields nullable when left blank and does not coerce to 0', () => {
//     const onSubmit = jest.fn();
//     const { container } = render(
//       <ItemBasicInfoForm
//         initialValues={{ Artikelbeschreibung: 'Initial', Auf_Lager: 1, Einheit: ItemEinheit.Stk }}
//         onSubmit={onSubmit}
//       />
//     );

//     fireEvent.change(getInputByRowLabel(container, 'Länge (mm)'), { target: { value: '300' } });
//     fireEvent.change(getInputByRowLabel(container, 'Länge (mm)'), { target: { value: '' } });

//     fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

//     expect(onSubmit).toHaveBeenCalledTimes(1);
//     const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
//     expect(payload.Länge_mm).toBeUndefined();
//     expect(payload.Länge_mm).not.toBe(0);
//   });

//   it('warns on invalid optional numeric values and submits undefined instead of 0', () => {
//     const onSubmit = jest.fn();
//     const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

//     try {
//       const { container } = render(
//         <ItemBasicInfoForm
//           initialValues={{ Artikelbeschreibung: 'Initial', Auf_Lager: 1, Einheit: ItemEinheit.Stk }}
//           onSubmit={onSubmit}
//         />
//       );

//       const weightInput = getInputByRowLabel(container, 'Gewicht (kg)');
//       fireEvent.change(weightInput, { target: { value: '1.5' } });
//       fireEvent.change(weightInput, { target: { value: 'abc' } });

//       fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

//       expect(warnSpy).toHaveBeenCalledWith(
//         'Invalid Gewicht_kg value in basic info form; clearing optional value.',
//         expect.objectContaining({ rawValue: 'abc' })
//       );
//       const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
//       expect(payload.Gewicht_kg).toBeUndefined();
//       expect(payload.Gewicht_kg).not.toBe(0);
//     } finally {
//       warnSpy.mockRestore();
//     }
//   });
// });
