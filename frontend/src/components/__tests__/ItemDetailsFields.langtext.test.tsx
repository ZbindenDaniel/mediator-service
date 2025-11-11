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

  it('serializes Langtext entries when adding a new approved key', () => {
    const sanitizedPayload = JSON.stringify({ Intro: 'Willkommen' });
    const onUpdate = jest.fn();
    const harness: { add?: (key?: string) => void } = {};

    renderToStaticMarkup(
      <ItemDetailsFields
        form={{ Langtext: sanitizedPayload } as Partial<ItemFormData>}
        onUpdate={(key, value) => onUpdate(key, value)}
        langtextEditorTestHarness={(helpers) => {
          harness.add = helpers.add;
        }}
      />
    );

    expect(typeof harness.add).toBe('function');
    harness.add?.('Details');

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [updatedField, serializedValue] = onUpdate.mock.calls[0];
    expect(updatedField).toBe('Langtext');
    expect(typeof serializedValue).toBe('string');

    const parsed = JSON.parse(serializedValue as string) as Record<string, unknown>;
    expect(parsed).toEqual({ Intro: 'Willkommen', Details: '' });
  });
});
