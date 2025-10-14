/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkItemActionBar from '../BulkItemActionBar';
import { dialogService } from '../dialog';
import { createBoxForRelocation, ensureActorOrAlert } from '../relocation/relocationHelpers';

jest.mock('../dialog', () => ({
  dialogService: {
    confirm: jest.fn(),
    alert: jest.fn()
  }
}));

jest.mock('../relocation/relocationHelpers', () => ({
  ensureActorOrAlert: jest.fn(),
  createBoxForRelocation: jest.fn()
}));

const mockedConfirm = dialogService.confirm as jest.MockedFunction<typeof dialogService.confirm>;
const mockedEnsureActor = ensureActorOrAlert as jest.MockedFunction<typeof ensureActorOrAlert>;
const mockedCreateBox = createBoxForRelocation as jest.MockedFunction<typeof createBoxForRelocation>;

function setup(props?: Partial<React.ComponentProps<typeof BulkItemActionBar>>) {
  const defaultProps: React.ComponentProps<typeof BulkItemActionBar> = {
    selectedIds: [],
    onClearSelection: jest.fn(),
    onActionComplete: jest.fn(),
    resolveActor: undefined,
    ...props
  };
  return render(<BulkItemActionBar {...defaultProps} />);
}

describe('BulkItemActionBar', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockedConfirm.mockReset();
    mockedEnsureActor.mockResolvedValue('tester');
    mockedCreateBox.mockReset();
  });

  afterEach(() => {
    jest.resetAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  it('renders primary and create+move buttons with the expected labels', () => {
    setup();

    expect(screen.getByRole('button', { name: /verschieben/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /in neuen behälter verschieben/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /bestand entfernen/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auswahl aufheben/i })).toBeInTheDocument();
  });

  it('confirms and submits a bulk move to an existing destination', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockedConfirm.mockResolvedValueOnce(true);

    setup({ selectedIds: ['item-1'] });
    const user = userEvent.setup();

    const targetInput = screen.getByLabelText('Ziel Behälter-ID');
    await user.clear(targetInput);
    await user.type(targetInput, 'BOX-42');

    const moveButton = screen.getByRole('button', { name: /^verschieben$/i });
    await user.click(moveButton);

    await waitFor(() => {
      expect(mockedConfirm).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/bulk/move',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const [, options] = fetchMock.mock.calls.find(([url]) => url === '/api/items/bulk/move') as [
      string,
      RequestInit
    ];
    expect(JSON.parse(String(options?.body))).toEqual({
      itemIds: ['item-1'],
      toBoxId: 'BOX-42',
      actor: 'tester',
      confirm: true
    });
  });

  it('creates a box before moving the selection when requested', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) } as unknown as Response);
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockedCreateBox.mockResolvedValueOnce({ ok: true, boxId: 'BOX-NEW', status: 201 });
    mockedConfirm.mockResolvedValueOnce(true);

    setup({ selectedIds: ['item-1', 'item-2'] });
    const user = userEvent.setup();

    const createButton = screen.getByRole('button', {
      name: /in neuen behälter verschieben/i
    });
    await user.click(createButton);

    await waitFor(() => {
      expect(mockedCreateBox).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/bulk/move',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const [, options] = fetchMock.mock.calls.find(([url]) => url === '/api/items/bulk/move') as [
      string,
      RequestInit
    ];
    expect(JSON.parse(String(options?.body))).toEqual({
      itemIds: ['item-1', 'item-2'],
      toBoxId: 'BOX-NEW',
      actor: 'tester',
      confirm: true
    });
  });

  it('shows an informational message when the move is cancelled after creating a box', async () => {
    mockedCreateBox.mockResolvedValueOnce({ ok: true, boxId: 'BOX-NEW', status: 201 });
    mockedConfirm.mockResolvedValueOnce(false);

    setup({ selectedIds: ['item-1'] });
    const user = userEvent.setup();

    const createButton = screen.getByRole('button', {
      name: /in neuen behälter verschieben/i
    });
    await user.click(createButton);

    await waitFor(() => {
      expect(mockedCreateBox).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(/verschieben abgebrochen\. neuer behälter box-new wurde erstellt\./i)
    ).toBeInTheDocument();
  });
});
