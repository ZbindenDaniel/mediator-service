import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeaturesContext } from '../../context/FeaturesContext';
import type { FeatureSet } from '../../context/FeaturesContext';
import { FEATURE_KEYS } from '../../../../models/features';
import type { Item } from '../../../../models';
import BulkItemActionBar from '../BulkItemActionBar';

const allOn = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as FeatureSet;
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(<FeaturesContext.Provider value={allOn}>{node}</FeaturesContext.Provider>);

// Minimal item rows as the list hands them to the bar; foreign ones arrive with LocationRedacted set
// by the server (Phase 3 read redaction).
const item = (id: string, foreign = false): Item =>
  ({ ItemUUID: id, BoxID: null, Location: null, UpdatedAt: '', LocationRedacted: foreign } as unknown as Item);

// The primary "Verschieben" button, with or without a disabled attribute.
const primaryDisabled = (html: string) => /bulk-item-action-bar__button--primary"[^>]*\sdisabled/.test(html);

describe('BulkItemActionBar tenancy guard', () => {
  it('blocks mass actions and explains why when the selection includes foreign items', () => {
    const html = render(
      <BulkItemActionBar
        selectedIds={['own', 'foreign']}
        selectedItems={[item('own'), item('foreign', true)]}
        onClearSelection={() => undefined}
      />
    );
    expect(html).toContain('bulk-foreign-notice');
    expect(html).toContain('1 von 2'); // partial-foreign wording
    expect(primaryDisabled(html)).toBe(true);
    expect(html).toContain('Export CSV'); // read-only action stays available
  });

  it('is a no-op when every selected item belongs to the viewer', () => {
    const html = render(
      <BulkItemActionBar
        selectedIds={['own1', 'own2']}
        selectedItems={[item('own1'), item('own2')]}
        onClearSelection={() => undefined}
      />
    );
    expect(html).not.toContain('bulk-foreign-notice');
    expect(primaryDisabled(html)).toBe(false);
  });

  it('wording switches when the whole selection is foreign', () => {
    const html = render(
      <BulkItemActionBar
        selectedIds={['f1']}
        selectedItems={[item('f1', true)]}
        onClearSelection={() => undefined}
      />
    );
    expect(html).toContain('Auswahl gehört anderen Organisationen');
    expect(primaryDisabled(html)).toBe(true);
  });
});
