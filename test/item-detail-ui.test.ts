import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AgenticStatusCard, AgenticStatusCardProps } from '../frontend/src/components/ItemDetail';
import { dialogService } from '../frontend/src/components/dialog';
import type { DialogContextValue } from '../frontend/src/components/dialog';

const testDialog: DialogContextValue = {
  alert: async () => undefined,
  confirm: async () => true,
  prompt: async () => ''
};

beforeAll(() => {
  dialogService.register(testDialog);
});

afterAll(() => {
  dialogService.unregister(testDialog);
});

describe('AgenticStatusCard cancel button visibility', () => {
  function renderCard(overrides: Partial<AgenticStatusCardProps> = {}) {
    const props: AgenticStatusCardProps = {
      status: { label: 'Test', className: 'pill status-info', description: 'Beschreibung' },
      rows: [],
      actionPending: false,
      reviewIntent: null,
      error: null,
      needsReview: false,
      hasFailure: false,
      onRestart: () => undefined,
      onReview: () => undefined,
      onCancel: () => undefined,
      ...overrides
    };
    return renderToStaticMarkup(React.createElement(AgenticStatusCard, props));
  }

  test('renders cancel button when review is pending', () => {
    const html = renderCard({ needsReview: true });
    expect(html).toContain('Abbrechen');
  });

  test('renders cancel button when no review is required', () => {
    const html = renderCard({ needsReview: false, hasFailure: true });
    expect(html).toContain('Abbrechen');
  });
});
