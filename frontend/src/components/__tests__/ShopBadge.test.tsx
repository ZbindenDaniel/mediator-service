import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ShopBadge from '../ShopBadge';

describe('ShopBadge', () => {
  it('renders active shop and publication states with positive colors', () => {
    const markup = renderToStaticMarkup(
      <ShopBadge compact shopartikel={1} publishedStatus="yes" />
    );

    expect(markup).toContain('class="shop-badge shop-badge--compact"');
    expect(markup).toContain('background-color:var(--positive)');
    expect(markup).toContain('border-color:var(--positive)');
    expect(markup).toContain('>S<');
    expect(markup).toContain('Shopartikel aktiv, Veröffentlichung aktiv');
  });

  it('falls back to negative colors for inactive and unknown values', () => {
    const markup = renderToStaticMarkup(
      <ShopBadge compact shopartikel="unknown" publishedStatus="unknown" />
    );

    expect(markup).toContain('background-color:var(--negative)');
    expect(markup).toContain('border-color:var(--negative)');
    expect(markup).toContain('>–<');
    expect(markup).toContain('Shopartikel inaktiv, Veröffentlichung inaktiv');
  });
});
