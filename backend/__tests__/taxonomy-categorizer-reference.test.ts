import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderCategorizerReference, loadTaxonomy, resetTaxonomyCache } from '../lib/taxonomy';
import { compactTaxonomyReference } from '../agentic/flow/item-flow-categorizer';

// Guards against silent categorizer-prompt drift: the reference rendered from the
// loaded taxonomy must equal the previous docs/data_struct.md-derived reference.
describe('categorizer reference parity', () => {
  beforeEach(() => resetTaxonomyCache());

  it('rendered reference matches the compacted docs/data_struct.md output byte-for-byte', () => {
    loadTaxonomy(true);
    const rendered = renderCategorizerReference();

    const md = readFileSync(resolve(__dirname, '../../docs/data_struct.md'), 'utf8');
    const compactedFromMd = compactTaxonomyReference(md);

    expect(rendered).toBe(compactedFromMd);
  });

  it('appends categorizerDescription only when present (no-op for the default seed)', () => {
    const withDesc = renderCategorizerReference([
      { code: 60, label: 'Mainboard_CPU_Ram', labelExternal: 'Mainboard_CPU_Ram', subcategories: [
        { code: 601, label: 'Mainboard', labelExternal: 'Mainboard', categorizerDescription: 'Hauptplatine' },
        { code: 602, label: 'Prozessor', labelExternal: 'Prozessor' }
      ] }
    ]);
    expect(withDesc).toContain('601 Mainboard (Hauptplatine); 602 Prozessor');
  });
});
