import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BoxColorTag from '../BoxColorTag';

describe('BoxColorTag', () => {
  it('renders the box id when the location is missing or blank', () => {
    const markup = renderToStaticMarkup(
      <BoxColorTag boxId="BOX-101" locationKey="   " />
    );

    expect(markup).toContain('BOX-101');
    expect(markup).not.toContain('(nicht gesetzt)');
  });

  it('falls back to the untranslated placeholder when no data is provided', () => {
    const markup = renderToStaticMarkup(<BoxColorTag />);

    expect(markup).toContain('(nicht gesetzt)');
  });
});
