/** @jest-environment jsdom */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkItemActionBar from '../BulkItemActionBar';
import { dialogService } from '../dialog';
import { ensureUser } from '../../lib/user';

type ConfirmMock = jest.MockedFunction<typeof dialogService.confirm>;
type EnsureUserMock = jest.MockedFunction<typeof ensureUser>;

jest.mock('../dialog', () => ({
  dialogService: {
    confirm: jest.fn()
  }
}));

jest.mock('../../lib/user', () => ({
  ensureUser: jest.fn()
}));

const mockedDialogConfirm = dialogService.confirm as ConfirmMock;
const mockedEnsureUser = ensureUser as EnsureUserMock;

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
    mockedEnsureUser.mockResolvedValue('tester');
    mockedDialogConfirm.mockReset();
  });

  afterEach(() => {
    jest.resetAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  it('renders compact icon buttons with accessible labels', () => {
    setup();

    expect(
      screen.getByRole('button', { name: /ausgewählte artikel verschieben/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /bestand für auswahl entfernen/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /auswahl aufheben/i })
    ).toBeInTheDocument();
  });

  it('confirms and submits a bulk move including the selected box id', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockedDialogConfirm.mockResolvedValueOnce(true);

    setup({ selectedIds: ['item-1'] });
    const user = userEvent.setup();

    const targetInput = screen.getByLabelText('Ziel-Box');
    await user.clear(targetInput);
    await user.type(targetInput, 'BOX-42');

    const moveButton = screen.getByRole('button', { name: /ausgewählte artikel verschieben/i });
    await user.click(moveButton);

    await waitFor(() => {
      expect(mockedDialogConfirm).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/bulk/move',
        expect.objectContaining({ method: 'POST' })
      );
    });

    const [, options] = fetchMock.mock.calls.find(([url]) => url === '/api/items/bulk/move') as [string, RequestInit];
    expect(JSON.parse(String(options?.body))).toEqual({
      itemIds: ['item-1'],
      toBoxId: 'BOX-42',
      actor: 'tester',
      confirm: true
    });
  });

  it('does not submit when the move confirmation is declined', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
    mockedDialogConfirm.mockResolvedValueOnce(false);

    setup({ selectedIds: ['item-1'] });
    const user = userEvent.setup();

    const targetInput = screen.getByLabelText('Ziel-Box');
    await user.clear(targetInput);
    await user.type(targetInput, 'BOX-42');

    const moveButton = screen.getByRole('button', { name: /ausgewählte artikel verschieben/i });
    await user.click(moveButton);

    await waitFor(() => {
      expect(mockedDialogConfirm).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
