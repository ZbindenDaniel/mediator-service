import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Feature, FeaturesContext } from '../../context/FeaturesContext';
import type { FeatureSet } from '../../context/FeaturesContext';
import { FEATURE_KEYS } from '../../../../models/features';
import { ITEM_TAB_FEATURES, BOX_TAB_FEATURES, resolveTab } from '../../lib/tabFeatures';
import ShopBadge from '../ShopBadge';

const allOn = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as FeatureSet;
const with_ = (overrides: Partial<FeatureSet>): FeatureSet => ({ ...allOn, ...overrides });

describe('resolveTab', () => {
  it('keeps an enabled tab', () => {
    expect(resolveTab('images', 'instance', ITEM_TAB_FEATURES, allOn)).toBe('images');
  });

  it('falls back to the default tab when the requested one is disabled (old ?tab= links)', () => {
    expect(resolveTab('ki', 'instance', ITEM_TAB_FEATURES, with_({ agentic: false }))).toBe('instance');
    expect(resolveTab('notizen', 'info', BOX_TAB_FEATURES, with_({ 'box-notes': false }))).toBe('info');
  });

  it('treats unlisted tabs as core and uses the default when none is requested', () => {
    expect(resolveTab('reference', 'instance', ITEM_TAB_FEATURES, with_({ agentic: false }))).toBe('reference');
    expect(resolveTab(null, 'info', BOX_TAB_FEATURES, allOn)).toBe('info');
  });
});

describe('Feature gating in components', () => {
  const render = (features: FeatureSet, node: React.ReactElement) =>
    renderToStaticMarkup(<FeaturesContext.Provider value={features}>{node}</FeaturesContext.Provider>);

  it('<Feature> renders children only while the feature is on', () => {
    expect(render(allOn, <Feature name="stubs"><span>Fundsachen</span></Feature>)).toContain('Fundsachen');
    expect(render(with_({ stubs: false }), <Feature name="stubs"><span>Fundsachen</span></Feature>)).toBe('');
  });

  it('self-gated widgets disappear with their feature', () => {
    expect(render(allOn, <ShopBadge compact shopartikel={1} publishedStatus="yes" />)).toContain('shop-badge');
    expect(render(with_({ shopware: false }), <ShopBadge compact shopartikel={1} publishedStatus="yes" />)).toBe('');
  });
});
