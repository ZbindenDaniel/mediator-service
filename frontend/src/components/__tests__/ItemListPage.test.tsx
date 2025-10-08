/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ItemListPage from '../ItemListPage';

jest.mock('../../lib/user', () => ({
  ensureUser: jest.fn()
}));

import { ensureUser } from '../../lib/user';

type EnsureUserMock = jest.MockedFunction<typeof ensureUser>;

const mockedEnsureUser = ensureUser as EnsureUserMock;

const sampleItems = [
  {
    ItemUUID: 'item-1',
    Artikelbeschreibung: 'Hammer',
    Artikel_Nummer: 'HAM-001',
    BoxID: 'BOX-1'
  },
  {
    ItemUUID: 'item-2',
    Artikelbeschreibung: 'Widget 2000',
    Artikel_Nummer: 'WID-2000',
    BoxID: 'BOX-2'
  }
];

describe('ItemListPage', () => {
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockedEnsureUser.mockResolvedValue('tester');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: sampleItems })
    });
    // @ts-expect-error override fetch for tests
    global.fetch = fetchMock;
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    jest.resetAllMocks();
    // @ts-expect-error restore fetch
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
  });

  function renderPage() {
    return render(
      <MemoryRouter>
        <ItemListPage />
      </MemoryRouter>
    );
  }

  it('allows selecting all visible items and shows the bulk action bar', async () => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Hammer');
    const selectAll = screen.getByRole('checkbox', {
      name: /alle sichtbaren artikel auswählen/i
    });

    await user.click(selectAll);

    expect(await screen.findByTestId('bulk-item-action-bar')).toBeInTheDocument();
    expect(screen.getByText('2 Artikel ausgewählt')).toBeInTheDocument();
  });

  it('filters items via the search field', async () => {
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Hammer');
    const searchInput = screen.getByLabelText('Artikel suchen');

    await user.clear(searchInput);
    await user.type(searchInput, 'widget');

    await waitFor(() => {
      expect(screen.getByText('Widget 2000')).toBeInTheDocument();
      expect(screen.queryByText('Hammer')).not.toBeInTheDocument();
    });
  });

  it('dispatches the correct payload for bulk delete actions', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: sampleItems })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: sampleItems })
      });

    // @ts-expect-error override fetch for tests
    global.fetch = fetchMock;

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Hammer');
    const firstRowCheckbox = screen.getByLabelText('Artikel Hammer auswählen');
    await user.click(firstRowCheckbox);

    const deleteButton = await screen.findByRole('button', { name: /bestand entfernen/i });

    await user.click(deleteButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/bulk/delete',
        expect.any(Object)
      );
    });

    const deleteCall = fetchMock.mock.calls.find(([url]) => url === '/api/items/bulk/delete');
    expect(deleteCall).toBeDefined();

    const [, options] = deleteCall as [string, RequestInit];
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });

    const payload = JSON.parse((options?.body as string) ?? '{}');
    expect(payload).toEqual({
      itemIds: ['item-1'],
      actor: 'tester',
      confirm: true
    });
  });
});
