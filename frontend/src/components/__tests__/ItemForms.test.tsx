/** @jest-environment jsdom */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ItemForm from '../ItemForm';
import ItemFormAgentic from '../ItemForm_agentic';
import type { ItemFormData } from '../forms/itemFormShared';

describe('Item forms', () => {
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    cleanup();
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] })
      }) as unknown as typeof global.fetch;
    window.confirm = jest.fn(() => true) as unknown as typeof window.confirm;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
    jest.clearAllMocks();
  });

  it('defaults new item quantity to 1 and submits numeric category values', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        item={{}}
        isNew
        submitLabel="Speichern"
        onSubmit={onSubmit}
      />
    );

    const quantityInput = screen.getByLabelText('Anzahl*') as HTMLInputElement;
    expect(quantityInput.value).toBe('1');

    fireEvent.change(screen.getByLabelText('Artikelbeschreibung*'), { target: { value: 'Testartikel' } });
    fireEvent.change(screen.getByLabelText('Artikelnummer*'), { target: { value: 'MAT-1' } });

    const mainCategorySelect = screen.getByLabelText('Hauptkategorien A') as HTMLSelectElement;
    fireEvent.change(mainCategorySelect, { target: { value: '175' } });

    const subCategorySelect = screen.getByLabelText('Unterkategorien A') as HTMLSelectElement;
    expect(subCategorySelect.disabled).toBe(false);
    fireEvent.change(subCategorySelect, { target: { value: '177' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        Auf_Lager: 1,
        Hauptkategorien_A: 175,
        Unterkategorien_A: 177
      })
    );
  });

  it('keeps agentic draft quantity in sync with default', () => {
    const onSubmitDetails = jest.fn().mockResolvedValue(undefined);
    const onSubmitPhotos = jest.fn().mockResolvedValue(undefined);

    render(
      <ItemFormAgentic
        draft={{} as Partial<ItemFormData>}
        step={1}
        isNew
        submitLabel="Weiter"
        onSubmitDetails={onSubmitDetails}
        onSubmitPhotos={onSubmitPhotos}
      />
    );

    const quantityInput = screen.getByLabelText('Anzahl*') as HTMLInputElement;
    expect(quantityInput.value).toBe('1');
  });
});
