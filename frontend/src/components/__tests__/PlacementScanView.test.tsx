import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mockNavigate = jest.fn();

// react-router-dom hooks are mocked before the component is imported
jest.mock('react-router-dom', () => ({
  useParams: jest.fn(() => ({ targetId: 'B-042' })),
  useSearchParams: jest.fn(() => [new URLSearchParams('mode=items')]),
  useLocation: jest.fn(() => ({ state: null, pathname: '/placement/B-042', search: '?mode=items' })),
  useNavigate: jest.fn(() => mockNavigate),
}));

// ../../lib/* because the test file is at __tests__/ one level below components/
jest.mock('../../lib/user', () => ({ ensureUser: jest.fn(async () => 'tester') }));
jest.mock('../../lib/logger', () => ({ logError: jest.fn() }));

import PlacementScanView from '../PlacementScanView';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';

describe('PlacementScanView', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    (useParams as jest.Mock).mockReturnValue({ targetId: 'B-042' });
    (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams('mode=items')]);
    (useLocation as jest.Mock).mockReturnValue({ state: null, pathname: '/placement/B-042', search: '?mode=items' });
  });

  it('renders header with Abbrechen and Fertig buttons', () => {
    const markup = renderToStaticMarkup(<PlacementScanView />);
    expect(markup).toContain('Abbrechen');
    expect(markup).toContain('Fertig');
  });

  it('renders Scannen starten button on first visit (no qrReturn in state)', () => {
    const markup = renderToStaticMarkup(<PlacementScanView />);
    expect(markup).toContain('Scannen starten');
  });

  it('shows items mode title with targetId', () => {
    const markup = renderToStaticMarkup(<PlacementScanView />);
    expect(markup).toContain('Artikel einscannen');
    expect(markup).toContain('B-042');
  });

  it('shows boxes mode title when mode=boxes', () => {
    (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams('mode=boxes')]);
    const markup = renderToStaticMarkup(<PlacementScanView />);
    expect(markup).toContain('Behälter einlagern');
  });

  it('does not crash when targetId is missing', () => {
    (useParams as jest.Mock).mockReturnValue({ targetId: undefined });
    expect(() => renderToStaticMarkup(<PlacementScanView />)).not.toThrow();
  });

  // effects do not run in renderToStaticMarkup, so auto-navigation is not triggered
  it('does not call navigate during static render', () => {
    renderToStaticMarkup(<PlacementScanView />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
