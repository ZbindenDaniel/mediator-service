/** @jest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ItemFormAgentic from '../ItemForm_agentic';
import type { ItemFormData } from '../forms/itemFormShared';

function flushMicrotasks() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('ItemForm_agentic photo helper', () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it('submits existing Grafikname without requiring new photo uploads', async () => {
    const onSubmitPhotos = jest.fn().mockResolvedValue(undefined);
    const grafikname = '/media/I-000001/photo.jpg';

    render(
      <ItemFormAgentic
        draft={{
          ItemUUID: 'I-000001',
          Grafikname: grafikname,
          Artikelbeschreibung: 'Agentic Item',
          Artikel_Nummer: 'AG-1000',
          Auf_Lager: 1
        }}
        step={2}
        submitLabel="Speichern"
        onSubmitDetails={jest.fn()}
        onSubmitPhotos={onSubmitPhotos}
      />
    );

    expect(() => screen.getByLabelText('Foto 1*')).toThrow();

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await flushMicrotasks();

    expect(onSubmitPhotos).toHaveBeenCalledTimes(1);
    const submitted = onSubmitPhotos.mock.calls[0][0] as Partial<ItemFormData>;
    expect(submitted.Grafikname).toBe(grafikname);
    expect('picture1' in submitted).toBe(false);
    expect('picture2' in submitted).toBe(false);
    expect('picture3' in submitted).toBe(false);
  });
});
