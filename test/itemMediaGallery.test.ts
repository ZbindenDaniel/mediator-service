import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ItemMediaGallery from '../frontend/src/components/ItemMediaGallery';

describe('ItemMediaGallery', () => {
  test('renders fallback when no media are available', () => {
    const html = renderToStaticMarkup(React.createElement(ItemMediaGallery, { itemId: 'ITEM-EMPTY' }));
    expect(html).toMatch(/Keine Medien verfügbar/);
  });

  test('renders primary and secondary media assets', () => {
    const grafikname = '/media/ITEM-1/cover.png';
    const assets = ['/media/ITEM-1/cover.png', '/media/ITEM-1/detail.png'];
    const html = renderToStaticMarkup(
      React.createElement(ItemMediaGallery, {
        itemId: 'ITEM-1',
        grafikname,
        mediaAssets: assets
      })
    );

    const imageMatches = html.match(/<img[^>]+src="([^"]+)"/g) || [];
    expect(imageMatches.length).toBe(2);
    expect(html).toContain('Hauptbild');
    expect(html).toContain('detail.png');
  });

  test('logs errors and renders fallback for known broken sources', () => {
    const grafikname = '/media/ITEM-ERR/broken.png';
    const originalError = console.error;
    const captured: Array<[unknown, ...unknown[]]> = [];
    console.error = ((...args: [unknown, ...unknown[]]) => {
      captured.push(args);
    }) as typeof console.error;

    try {
      const html = renderToStaticMarkup(
        React.createElement(ItemMediaGallery, {
          itemId: 'ITEM-ERR',
          grafikname,
          mediaAssets: [grafikname],
          initialFailedSources: [grafikname]
        })
      );

      expect(html).toMatch(/Bild konnte nicht geladen werden/);
      expect(captured.length).toBeGreaterThan(0);
      const [message, details] = captured[0];
      expect(message).toBe('Failed to load media asset');
      if (typeof details === 'object' && details) {
        expect((details as Record<string, unknown>).itemId).toBe('ITEM-ERR');
      } else {
        throw new Error('Expected error details to be an object');
      }
    } finally {
      console.error = originalError;
    }
  });
});
