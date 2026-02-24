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

  it('serializes Langtext entries when adding a new key with length validation', () => {
    const sanitizedPayload = JSON.stringify({ Intro: 'Willkommen' });
    const onUpdate = jest.fn();
    const harness: { add?: (key?: string) => void; remove?: (key: string) => void } = {};
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      renderToStaticMarkup(
        <ItemDetailsFields
          form={{ Langtext: sanitizedPayload } as Partial<ItemFormData>}
          onUpdate={(key, value) => onUpdate(key, value)}
          langtextEditorTestHarness={(helpers) => {
            harness.add = helpers.add;
            harness.remove = helpers.remove;
          }}
        />
      );

      expect(typeof harness.add).toBe('function');
      const requestedKey = 'abcdefghijklmnopqrstuvwxyz';
      const expectedKey = requestedKey.slice(0, 25);
      harness.add?.(requestedKey);

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const [updatedField, serializedValue] = onUpdate.mock.calls[0];
      expect(updatedField).toBe('Langtext');
      expect(typeof serializedValue).toBe('string');

      const parsed = JSON.parse(serializedValue as string) as Record<string, unknown>;
      expect(parsed).toEqual({ Intro: 'Willkommen', [expectedKey]: '' });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('removes Langtext entries when delete is triggered', () => {
    const sanitizedPayload = JSON.stringify({ Intro: 'Willkommen', Details: 'Mehr Informationen' });
    const onUpdate = jest.fn();
    const harness: { add?: (key?: string) => void; remove?: (key: string) => void } = {};

    renderToStaticMarkup(
      <ItemDetailsFields
        form={{ Langtext: sanitizedPayload } as Partial<ItemFormData>}
        onUpdate={(key, value) => onUpdate(key, value)}
        langtextEditorTestHarness={(helpers) => {
          harness.add = helpers.add;
          harness.remove = helpers.remove;
        }}
      />
    );

    expect(typeof harness.remove).toBe('function');
    harness.remove?.('Intro');

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [updatedField, serializedValue] = onUpdate.mock.calls[0];
    expect(updatedField).toBe('Langtext');
    expect(typeof serializedValue).toBe('string');

    const parsed = JSON.parse(serializedValue as string) as Record<string, unknown>;
    expect(parsed).toEqual({ Details: 'Mehr Informationen' });
  });
});


describe('ItemDetailsFields binary switches', () => {
  it('renders publication and shoparticle switches as checked when source data is truthy', () => {
    const markup = renderToStaticMarkup(
      <ItemDetailsFields
        form={{ Veröffentlicht_Status: 'yes', Shopartikel: 1 } as Partial<ItemFormData>}
        onUpdate={jest.fn()}
      />
    );

    expect(markup).toContain('Veröffentlich-Status');
    expect(markup).toContain('Shopartikel');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('class="item-form__binary-switch"');
    expect(markup.match(/role=\"switch\"/g)?.length ?? 0).toBe(2);
    expect(markup.match(/checked=\"\"/g)?.length ?? 0).toBe(2);
  });

  it('renders publication and shoparticle switches as unchecked when source data is falsy', () => {
    const markup = renderToStaticMarkup(
      <ItemDetailsFields
        form={{ Veröffentlicht_Status: 'no', Shopartikel: 0 } as Partial<ItemFormData>}
        onUpdate={jest.fn()}
      />
    );

    expect(markup).toContain('Veröffentlich-Status');
    expect(markup).toContain('Shopartikel');
    expect(markup.match(/role=\"switch\"/g)?.length ?? 0).toBe(2);
    expect(markup.match(/checked=\"\"/g)?.length ?? 0).toBe(0);
  });
});
