import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QualityBadge from '../frontend/src/components/QualityBadge';

describe('QualityBadge', () => {
  test('renders descriptive label for provided quality', () => {
    const markup = renderToStaticMarkup(<QualityBadge value={5} />);

    expect(markup).toContain('Qualität');
    expect(markup).toContain('Neuwertig');
    expect(markup).toContain('quality-badge');
  });

  test('applies compact styling', () => {
    const markup = renderToStaticMarkup(<QualityBadge compact value={2} />);

    expect(markup).toContain('quality-badge--compact');
  });
});
