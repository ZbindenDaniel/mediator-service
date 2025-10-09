import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ItemFormAgentic from '../ItemForm_agentic';
import ItemCreate from '../ItemCreate';
import { DialogProvider } from '../dialog';

interface JsonResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function createJsonResponse(body: unknown, status = 200): JsonResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

describe('ItemForm agentic interactions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prevents duplicate manual fallback requests and disables the trigger', async () => {
    const user = userEvent.setup();
    const onFallbackToManual = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <ItemFormAgentic
        draft={{ Artikelbeschreibung: 'Fallback Test', picture1: 'stub-photo' }}
        onSubmitPhotos={jest.fn()}
        submitLabel="Speichern"
        onFallbackToManual={onFallbackToManual}
        isNew={false}
      />
    );

    const fallbackButton = screen.getByRole('button', { name: 'Zur manuellen Erfassung' });

    await user.click(fallbackButton);
    expect(onFallbackToManual).toHaveBeenCalledTimes(1);
    expect(fallbackButton).toBeDisabled();

    await user.click(fallbackButton);
    expect(onFallbackToManual).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('Manual fallback already triggered. Ignoring duplicate request.');
  });

  it('requires a primary photo before submitting agentic photos', async () => {
    const user = userEvent.setup();
    const onSubmitPhotos = jest.fn().mockResolvedValue(undefined);
    const reportValiditySpy = jest
      .spyOn(HTMLFormElement.prototype, 'reportValidity')
      .mockReturnValue(true);

    render(
      <ItemFormAgentic
        draft={{ Artikelbeschreibung: 'Missing photo guard' }}
        onSubmitPhotos={onSubmitPhotos}
        submitLabel="Speichern"
        onFallbackToManual={jest.fn()}
        isNew={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(reportValiditySpy).toHaveBeenCalled();
    expect(onSubmitPhotos).not.toHaveBeenCalled();
    expect(await screen.findByText('Bitte mindestens ein Foto hochladen.')).toBeInTheDocument();
  });
});

describe('ItemCreate agentic fallback', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/agentic/health')) {
        return Promise.resolve(createJsonResponse({ ok: true }));
      }

      if (url.includes('/api/search')) {
        return Promise.resolve(createJsonResponse({ items: [] }));
      }

      if (url.includes('/api/getNewMaterialNumber')) {
        return Promise.resolve(createJsonResponse({ nextArtikelNummer: 'AG-1000' }));
      }

      return Promise.resolve(createJsonResponse({}));
    });

    // @ts-expect-error overriding global fetch for tests
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    // @ts-expect-error restore fetch
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('switches to manual edit mode when the fallback button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DialogProvider>
          <ItemCreate />
        </DialogProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/agentic/health', { method: 'GET' });
    });

    const [descriptionInput] = screen.getAllByRole('textbox');
    await user.clear(descriptionInput);
    await user.type(descriptionInput, 'Agentic fallback item');

    const quantityInput = screen.getByRole('spinbutton');
    await user.clear(quantityInput);
    await user.type(quantityInput, '3');

    await user.click(screen.getByRole('button', { name: 'Weiter' }));

    await screen.findByText('Ähnliche Artikel prüfen');

    await user.click(screen.getByRole('button', { name: 'Kein Duplikat – weiter' }));

    const fallbackButton = await screen.findByRole('button', { name: 'Zur manuellen Erfassung' });

    await user.click(fallbackButton);

    await screen.findByRole('heading', { name: 'Details ergänzen' });

    await waitFor(() => {
      const manualDescriptionInput = screen.getAllByRole('textbox')[0] as HTMLInputElement;
      expect(manualDescriptionInput.value).toBe('Agentic fallback item');
    });
  });
});
