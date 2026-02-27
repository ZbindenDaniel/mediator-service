/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ItemListPage from '../ItemListPage';
import { ITEM_LIST_FILTERS_STORAGE_KEY } from '../../lib/itemListFiltersStorage';

// TODO(test-coverage): Keep URL/storage filter initialization coverage narrow and focused on box filter precedence.

describe('ItemListPage box filter initialization', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] })
    } as Response);
  });

  afterEach(() => {
    jest.resetAllMocks();
    localStorage.clear();
    global.fetch = originalFetch;
  });

  function renderPage(initialEntry = '/items') {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <ItemListPage />
      </MemoryRouter>
    );
  }

  it('applies box from URL on initial load', async () => {
    renderPage('/items?box=BOX-URL-1');

    const boxInput = await screen.findByLabelText('Behälter filtern');
    expect(boxInput).toHaveValue('BOX-URL-1');

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const firstCallUrl = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(firstCallUrl).toContain('/api/items?');
    expect(firstCallUrl).toContain('box=BOX-URL-1');
  });

  it('lets URL box override stored box filter', async () => {
    localStorage.setItem(ITEM_LIST_FILTERS_STORAGE_KEY, JSON.stringify({ boxFilter: 'BOX-STORED' }));

    renderPage('/items?box=BOX-URL-2');

    const boxInput = await screen.findByLabelText('Behälter filtern');
    expect(boxInput).toHaveValue('BOX-URL-2');

    const firstCallUrl = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(firstCallUrl).toContain('box=BOX-URL-2');
    expect(firstCallUrl).not.toContain('BOX-STORED');
  });

  it('shows and edits Behälter input bound to boxFilter state', async () => {
    renderPage('/items');
    const user = userEvent.setup();

    const boxInput = await screen.findByLabelText('Behälter filtern');
    expect(boxInput).toHaveValue('');

    await user.type(boxInput, 'BOX-EDIT');

    expect(boxInput).toHaveValue('BOX-EDIT');
  });
});
