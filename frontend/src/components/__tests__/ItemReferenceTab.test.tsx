import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeaturesContext } from '../../context/FeaturesContext';
import type { FeatureSet } from '../../context/FeaturesContext';
import { FEATURE_KEYS } from '../../../../models/features';
import type { Item } from '../../../../models';
import ItemReferenceTab from '../item-tabs/ItemReferenceTab';

const allOn = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as FeatureSet;
const render = (node: React.ReactElement, features: FeatureSet = allOn) =>
  renderToStaticMarkup(<FeaturesContext.Provider value={features}>{node}</FeaturesContext.Provider>);

const item = { ItemUUID: 'I-1', Artikel_Nummer: 'A-1', BoxID: null, Location: null, UpdatedAt: '' } as unknown as Item;
const base = { item, referenceDetailRows: [] as [string, React.ReactNode][], connectedToDevices: [], compatibleParentRefs: [] };

describe('ItemReferenceTab action gating', () => {
  it('shows each action only when its handler is provided', () => {
    const all = render(<ItemReferenceTab {...base} onEdit={() => {}} onShopStatus={() => {}} onDelete={() => {}} />);
    expect(all).toContain('Bearbeiten');
    expect(all).toContain('Shopartikel');
    expect(all).toContain('Referenz löschen');

    const none = render(<ItemReferenceTab {...base} />);
    expect(none).not.toContain('Bearbeiten');
    expect(none).not.toContain('Referenz löschen');
  });

  it('hides the delete button for users without canDeleteReference (onDelete omitted)', () => {
    const html = render(<ItemReferenceTab {...base} onEdit={() => {}} />);
    expect(html).toContain('Bearbeiten');            // operator can still edit own-org ref
    expect(html).not.toContain('Referenz löschen');  // but never sees delete
  });

  it('hides Shopartikel when the shopware feature is off, even with a handler', () => {
    const html = render(<ItemReferenceTab {...base} onShopStatus={() => {}} />, { ...allOn, shopware: false });
    expect(html).not.toContain('Shopartikel');
  });
});
