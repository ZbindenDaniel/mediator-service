import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ItemDetailsFields } from '../forms/itemFormShared';
import type { ItemFormData } from '../forms/itemFormShared';

describe('ItemDetailsFields Langtext rendering', () => {
  it('keeps the JSON editor active for sanitized Langtext payloads', () => {
    const sanitizedPayload = JSON.stringify({ Intro: 'Willkommen' });

    const markup = renderToStaticMarkup(
      <ItemDetailsFields
        form={{ Langtext: sanitizedPayload } as Partial<ItemFormData>}
        onUpdate={jest.fn()}
      />
    );

    expect(markup).toContain('class="langtext-editor"');
    expect(markup).toContain('role="group"');
    expect(markup).not.toContain('langtext-editor langtext-editor--legacy');
    expect(markup).toContain('Willkommen');
  });
});
