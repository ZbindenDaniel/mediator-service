// TODO: Expand dialog provider tests with edge cases around error handling when additional helpers are introduced.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DialogProvider, useDialog } from '../dialog';
import { dialogService } from '../dialog/dialogService';

function AlertTester() {
  const dialog = useDialog();
  const [resolved, setResolved] = React.useState(false);

  return (
    <button
      onClick={async () => {
        await dialog.alert({ message: 'Alert body', title: 'Alert title' });
        setResolved(true);
      }}
      type="button"
    >
      {resolved ? 'resolved' : 'trigger alert'}
    </button>
  );
}

function ConfirmTester() {
  const dialog = useDialog();
  const [result, setResult] = React.useState<boolean | null>(null);

  return (
    <button
      onClick={async () => {
        const confirmation = await dialog.confirm({
          message: 'Confirm body',
          title: 'Confirm title'
        });
        setResult(confirmation);
      }}
      type="button"
    >
      {result === null ? 'trigger confirm' : `confirm:${result}`}
    </button>
  );
}

describe('DialogProvider', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('resolves alert dialogs and logs progress', async () => {
    const user = userEvent.setup();

    render(
      <DialogProvider>
        <AlertTester />
      </DialogProvider>
    );

    await user.click(screen.getByText('trigger alert'));

    expect(await screen.findByRole('dialog', { name: 'Alert title' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Schließen' }));

    await waitFor(() => expect(screen.getByText('resolved')).toBeInTheDocument());

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith('Dialog alert resolved');
    });
  });

  it('allows cancelling confirm dialogs and logs cancellation', async () => {
    const user = userEvent.setup();

    render(
      <DialogProvider>
        <ConfirmTester />
      </DialogProvider>
    );

    await user.click(screen.getByText('trigger confirm'));
    expect(await screen.findByRole('dialog', { name: 'Confirm title' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    await waitFor(() => expect(screen.getByText('confirm:false')).toBeInTheDocument());

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith('Dialog confirm resolved', false);
      expect(logSpy).toHaveBeenCalledWith('Dialog cancelled', { type: 'confirm' });
    });
  });

  it('resolves prompt dialogs through the service with typed results and logging', async () => {
    const user = userEvent.setup();

    render(
      <DialogProvider>
        <div>service consumer</div>
      </DialogProvider>
    );

    let promptPromise: Promise<string | null> | undefined;

    await act(async () => {
      promptPromise = dialogService.prompt({
        message: 'Prompt body',
        title: 'Prompt title',
        defaultValue: 'initial'
      });
    });

    expect(await screen.findByRole('dialog', { name: 'Prompt title' })).toBeInTheDocument();

    const input = screen.getByLabelText('Dialog prompt input');
    await user.clear(input);
    await user.type(input, 'updated value');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    const resolvedPromise = promptPromise as Promise<string | null>;
    expect(resolvedPromise).toBeDefined();
    await expect(resolvedPromise).resolves.toBe('updated value');

    await waitFor(() => {
      expect(logSpy).toHaveBeenCalledWith('Dialog prompt resolved', 'updated value');
    });
  });
});
