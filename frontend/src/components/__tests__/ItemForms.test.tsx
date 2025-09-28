/** @jest-environment jsdom */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ItemForm from '../ItemForm';
import ItemFormAgentic from '../ItemForm_agentic';
import type { ItemFormData } from '../forms/itemFormShared';

function createFileList(...files: File[]): FileList {
  const fileList: Partial<FileList> & { [index: number]: File } = {
    length: files.length,
    item: (index: number) => files[index] ?? null
  };
  files.forEach((file, index) => {
    fileList[index] = file;
  });
  return fileList as FileList;
}

describe('Item forms', () => {
  let reportValiditySpy: jest.SpyInstance;
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    cleanup();
    reportValiditySpy = jest.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true);
    window.confirm = jest.fn(() => true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] })
    });

    class MockFileReader {
      public result: string | ArrayBuffer | null = null;
      public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      public onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL(file: Blob) {
        this.result = `data:${file.type};base64,TEST`;
        if (this.onload) {
          this.onload.call(this as unknown as FileReader, new ProgressEvent('load'));
        }
      }
    }

    // @ts-expect-error - override for tests
    global.FileReader = MockFileReader;
  });

  afterEach(() => {
    cleanup();
    reportValiditySpy.mockRestore();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
  });

  it('submits new item data with captured photo', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <ItemForm
        item={{ BoxID: 'BOX-7' }}
        isNew
        submitLabel="Speichern"
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText('Artikelbeschreibung*'), { target: { value: 'Test Item' } });
    fireEvent.change(screen.getByLabelText('Artikelnummer*'), { target: { value: 'MAT-123' } });
    fireEvent.change(screen.getByLabelText('Anzahl*'), { target: { value: '3' } });

    const file = new File(['binary'], 'photo.png', { type: 'image/png' });
    const files = createFileList(file);
    fireEvent.change(screen.getByLabelText('Foto 1*'), { target: { files } });

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        Artikelbeschreibung: 'Test Item',
        Artikel_Nummer: 'MAT-123',
        Auf_Lager: 3,
        picture1: expect.stringContaining('data:image/png;base64,TEST')
      })
    );
  });

  it('adjusts stock for existing items', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ quantity: 4, boxId: 'BOX-7' })
    });
    // @ts-expect-error - override for tests
    global.fetch = fetchMock;

    render(
      <ItemForm
        item={{ ItemUUID: 'uuid-1', Auf_Lager: 3 }}
        submitLabel="Speichern"
        onSubmit={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '-' }));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/items/uuid-1/remove',
      expect.objectContaining({ method: 'POST' })
    );

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/items/uuid-1/add',
      expect.objectContaining({ method: 'POST' })
    );

    const quantityInput = screen.getByLabelText('Anzahl*') as HTMLInputElement;
    expect(quantityInput.value).toBe('4');
  });

  it('completes agentic step one submission', async () => {
    const onSubmitDetails = jest.fn().mockResolvedValue(undefined);
    const draft: Partial<ItemFormData> = { BoxID: 'BOX-9', Auf_Lager: 1 };
    render(
      <ItemFormAgentic
        draft={draft}
        step={1}
        isNew
        submitLabel="Speichern"
        onSubmitDetails={onSubmitDetails}
        onSubmitPhotos={jest.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Artikelbeschreibung*'), { target: { value: 'Agentic Item' } });
    fireEvent.change(screen.getByLabelText('Artikelnummer*'), { target: { value: 'AG-1' } });
    fireEvent.change(screen.getByLabelText('Anzahl*'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    await Promise.resolve();

    expect(onSubmitDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        Artikelbeschreibung: 'Agentic Item',
        Artikel_Nummer: 'AG-1',
        Auf_Lager: 5
      })
    );
  });

  it('submits agentic photos on step two', async () => {
    const onSubmitPhotos = jest.fn().mockResolvedValue(undefined);
    render(
      <ItemFormAgentic
        draft={{ ItemUUID: 'uuid-2', picture1: 'existing-photo' }}
        step={2}
        submitLabel="Speichern"
        onSubmitDetails={jest.fn()}
        onSubmitPhotos={onSubmitPhotos}
      />
    );

    const file = new File(['binary'], 'photo2.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Foto 1*'), { target: { files: createFileList(file) } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await Promise.resolve();

    expect(onSubmitPhotos).toHaveBeenCalledWith(
      expect.objectContaining({ picture1: expect.stringContaining('data:image/png;base64,TEST') })
    );
  });

  it('searches for similar items and allows selection in ItemForm', async () => {
    jest.useFakeTimers();
    const similarItem = {
      ItemUUID: 'existing-1',
      Artikel_Nummer: 'MAT-999',
      Artikelbeschreibung: 'Ähnlicher Artikel',
      BoxID: 'BOX-55'
    } as Partial<ItemFormData>;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [similarItem] })
    });
    // @ts-expect-error override for test
    global.fetch = fetchMock;

    try {
      render(
        <ItemForm
          item={{}}
          isNew
          submitLabel="Speichern"
          onSubmit={jest.fn()}
        />
      );

      const descriptionInput = screen.getByLabelText('Artikelbeschreibung*') as HTMLInputElement;
      fireEvent.change(descriptionInput, { target: { value: 'Ähnlich' } });

      await act(async () => {
        jest.runAllTimers();
      });

      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0][0]).toBe('/api/search?term=%C3%84hnlich');

      const selectButton = await screen.findByRole('button', { name: /übernehmen/i });
      fireEvent.click(selectButton);

      expect(descriptionInput.value).toBe('Ähnlicher Artikel');
      expect((screen.getByLabelText('Artikelnummer*') as HTMLInputElement).value).toBe('MAT-999');
    } finally {
      jest.useRealTimers();
    }
  });

  it('renders suggestions in agentic form and selection updates fields', async () => {
    jest.useFakeTimers();
    const similarItem = {
      ItemUUID: 'existing-2',
      Artikel_Nummer: 'MAT-100',
      Artikelbeschreibung: 'Agentic Ähnlich',
      BoxID: 'BOX-77'
    } as Partial<ItemFormData>;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [similarItem] })
    });
    // @ts-expect-error override for test
    global.fetch = fetchMock;

    try {
      render(
        <ItemFormAgentic
          draft={{}}
          step={1}
          isNew
          submitLabel="Weiter"
          onSubmitDetails={jest.fn()}
          onSubmitPhotos={jest.fn()}
        />
      );

      const descriptionInput = screen.getByLabelText('Artikelbeschreibung*') as HTMLInputElement;
      fireEvent.change(descriptionInput, { target: { value: 'Agent' } });

      await act(async () => {
        jest.runAllTimers();
      });

      expect(fetchMock).toHaveBeenCalled();

      const selectButton = await screen.findByRole('button', { name: /übernehmen/i });
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect((screen.getByLabelText('Artikelnummer*') as HTMLInputElement).value).toBe('MAT-100');
      });
      expect(descriptionInput.value).toBe('Agentic Ähnlich');
    } finally {
      jest.useRealTimers();
    }
  });
});
