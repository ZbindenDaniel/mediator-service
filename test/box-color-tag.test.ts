// import React from 'react';
// import { renderToStaticMarkup } from 'react-dom/server';
// import BoxColorTag from '../frontend/src/components/BoxColorTag';

// describe('BoxColorTag', () => {
//   test('renders fallback when location is unplaced placeholder', () => {
//     const markup = renderToStaticMarkup(
//       React.createElement(BoxColorTag, {
//         locationKey: 'A-00-00',
//         labelOverride: 'Override label',
//       })
//     );

//     expect(markup).toContain('(nicht gesetzt)');
//     expect(markup).not.toMatch(/A-00-00/);
//   });

//   test('renders color swatch and label for mapped locations', () => {
//     const markup = renderToStaticMarkup(
//       React.createElement(BoxColorTag, {
//         locationKey: 'A-01-01',
//       })
//     );

//     expect(markup).toContain('A-01-01');
//     expect(markup).toContain('Rot');
//     expect(markup).not.toMatch(/background-color/i);
//   });
// });
