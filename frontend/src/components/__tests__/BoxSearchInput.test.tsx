/** @jest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import BoxSearchInput from '../BoxSearchInput';

const boxes = [
  { BoxID: 'B-000123', Label: 'Cables and adapters', Location: 'Shelf A' },
  { BoxID: 'B-000456', Label: 'Red cables' },
  { BoxID: 'B-000789', Label: null }
];

describe('BoxSearchInput', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ boxes })
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(['cables', 'red adapters', 'B-000123'])(
    'preserves backend matches and their order when searching for %s',
    async (query) => {
      render(<BoxSearchInput value={query} onValueChange={jest.fn()} />);
      fireEvent.focus(screen.getByRole('textbox'));

      const options = await screen.findAllByRole('option');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/search?scope=boxes&term=' + encodeURIComponent(query),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(options.map((option) => option.querySelector('.mono')?.textContent))
        .toEqual(boxes.map((box) => box.BoxID));
      expect(within(options[0]).getByText('Cables and adapters')).toBeTruthy();
      expect(within(options[0]).getByText('Shelf A')).toBeTruthy();
      expect(within(options[1]).getByText('Red cables')).toBeTruthy();
    }
  );

  it.each(['mouse', 'keyboard'])('selects a name match by BoxID using the %s', async (method) => {
    const onValueChange = jest.fn();
    const onSuggestionSelected = jest.fn();
    render(
      <BoxSearchInput
        value="cables"
        onValueChange={onValueChange}
        onSuggestionSelected={onSuggestionSelected}
      />
    );
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    const options = await screen.findAllByRole('option');

    if (method === 'mouse') {
      fireEvent.mouseDown(options[0]);
    } else {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });
    }

    expect(onValueChange).toHaveBeenCalledWith('B-000123');
    expect(onSuggestionSelected).toHaveBeenCalledWith(boxes[0]);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
