/** @jest-environment jsdom */

import React from 'react';
import ItemForm from '../ItemForm';
import { render, screen } from '@testing-library/react';

describe('ItemForm header rendering', () => {
  function createBaseProps() {
    return {
      item: {},
      submitLabel: 'Speichern',
      onSubmit: jest.fn().mockResolvedValue(undefined)
    };
  }

  it('omits the header container when no custom content is provided', () => {
    const { container } = render(<ItemForm {...createBaseProps()} />);

    expect(container.querySelector('.item-form__header')).toBeNull();
  });

  it('renders the provided header content when supplied', () => {
    const customHeaderText = 'Benutzerdefinierter Header';
    const { container } = render(
      <ItemForm
        {...createBaseProps()}
        headerContent={<span>{customHeaderText}</span>}
      />
    );

    expect(container.querySelector('.item-form__header')).not.toBeNull();
    expect(screen.getByText(customHeaderText)).toBeDefined();
  });
});

