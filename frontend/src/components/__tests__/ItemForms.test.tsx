/** @jest-environment jsdom */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ItemForm from '../ItemForm';
import ItemCreate from '../ItemCreate';

jest.mock('../../lib/user', () => ({
  getUser: () => 'test-user'
}));

const triggerAgenticRunMock = jest.fn();

jest.mock('../../lib/agentic', () => ({
  resolveAgenticApiBase: () => 'http://agentic.test',
  buildAgenticRunUrl: () => 'http://agentic.test/run',
  triggerAgenticRun: triggerAgenticRunMock
}));

jest.mock('../forms/useSimilarItems', () => ({
  useSimilarItems: () => ({
    similarItems: [],
    loading: false,
    error: null,
    hasQuery: false
  })
}));

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
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;
  const originalAlert = window.alert;
  const originalFileReader = (global as typeof globalThis & { FileReader?: typeof FileReader }).FileReader;
  let reportValiditySpy: jest.SpyInstance<boolean, []>;

  beforeEach(() => {
    reportValiditySpy = jest.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true);
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();

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

    (global as typeof globalThis & { FileReader?: typeof FileReader }).FileReader = MockFileReader as unknown as typeof FileReader;
    triggerAgenticRunMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    reportValiditySpy.mockRestore();
    jest.clearAllMocks();
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    (global as typeof globalThis & { FileReader?: typeof FileReader }).FileReader = originalFileReader as typeof FileReader;
  });

  it('uses changeStock controls for existing items', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ quantity: 4, boxId: 'BOX-7' })
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    render(
      <ItemForm
        item={{ ItemUUID: 'uuid-1', Auf_Lager: 3 }}
        submitLabel="Speichern"
        onSubmit={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '-' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/items/uuid-1/remove', expect.anything()));

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/items/uuid-1/add', expect.anything()));

    const quantityInput = screen.getByLabelText('Anzahl*') as HTMLInputElement;
    expect(quantityInput.value).toBe('4');
  });

  it('preserves quantity from agentic step one through backend submission', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'http://agentic.test/health') {
        return {
          ok: true,
          json: async () => ({ ok: true })
        } as Response;
      }

      if (url === '/api/import/item') {
        return {
          ok: true,
          json: async () => ({ item: { ItemUUID: 'uuid-99', BoxID: 'BOX-12' } })
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ items: [] })
      } as Response;
    });

    global.fetch = fetchMock as unknown as typeof global.fetch;

    await act(async () => {
      render(
        <MemoryRouter>
          <ItemCreate />
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://agentic.test/health', expect.anything()));

    fireEvent.change(screen.getByLabelText('Artikelbeschreibung*'), { target: { value: 'Agentic Item' } });
    fireEvent.change(screen.getByLabelText('Artikelnummer*'), { target: { value: 'AG-1' } });
    fireEvent.change(screen.getByLabelText('Anzahl*'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));

    await waitFor(() => {
      const importCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/import/item');
      return importCalls.length >= 1;
    });

    const firstImportCall = fetchMock.mock.calls.find(([url]) => url === '/api/import/item');
    expect(firstImportCall?.[1]?.body).toContain('Auf_Lager=5');

    const file = new File(['binary'], 'photo.png', { type: 'image/png' });
    fireEvent.change(await screen.findByLabelText('Foto 1*'), {
      target: { files: createFileList(file) }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      const importCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/import/item');
      return importCalls.length >= 2;
    });

    const importCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/import/item');
    const finalImportCall = importCalls[importCalls.length - 1];
    expect(finalImportCall?.[1]?.body).toContain('Auf_Lager=5');
  });
});

