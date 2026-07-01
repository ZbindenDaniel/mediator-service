jest.mock('fs/promises', () => ({
  readFile: jest
    .fn()
    .mockResolvedValue('# Kategoriecodes\n\n## 160 – Kabel_Adapter_Montage\n\n- **1603** – Adapter\n- **1602** – Kabel Intern\n')
}));

import { compactTaxonomyReference, runCategorizerStage } from '../flow/item-flow-categorizer';

const baseCandidate = {
  Artikel_Nummer: '019157',
  Artikelbeschreibung: 'adapter',
  Verkaufspreis: 0,
  Kurzbeschreibung: '',
  Langtext: '',
  Hersteller: '',
  Länge_mm: null,
  Breite_mm: null,
  Höhe_mm: null,
  Gewicht_kg: null,
  Hauptkategorien_A: null,
  Unterkategorien_A: null,
  Hauptkategorien_B: null,
  Unterkategorien_B: null
} as any;

describe('runCategorizerStage alt-shape handling', () => {
  // Repro of a production transcript: model returned a valid-JSON-but-wrong-shape response
  // ({ assigned_categories: { primary, secondary } }) which used to validate against the
  // permissive passthrough schema and silently resolve to an empty patch, leaving the item
  // with null categories despite the model having picked correct codes.
  it('remaps assigned_categories.primary/secondary onto canonical fields', async () => {
    const invoke = jest.fn().mockResolvedValueOnce({
      content: '```json\n{\n  "assigned_categories": {\n    "primary": 1603,\n    "secondary": 1602\n  }\n}\n```'
    });

    const result = await runCategorizerStage({
      llm: { invoke } as any,
      itemId: '019157',
      categorizerPrompt: 'categorize',
      candidate: baseCandidate
    });

    expect(result).toEqual({
      Hauptkategorien_A: 160,
      Unterkategorien_A: 1603,
      Hauptkategorien_B: 160,
      Unterkategorien_B: 1602
    });
  });

  it('throws CATEGORIZER_UNRECOGNIZED_SHAPE instead of silently returning an empty patch', async () => {
    const invoke = jest.fn().mockResolvedValueOnce({ content: '{"foo": "bar", "baz": 42}' });

    await expect(
      runCategorizerStage({
        llm: { invoke } as any,
        itemId: '019158',
        categorizerPrompt: 'categorize',
        candidate: baseCandidate
      })
    ).rejects.toMatchObject({ code: 'CATEGORIZER_UNRECOGNIZED_SHAPE' });
  });

  it('still accepts the canonical flat shape unchanged', async () => {
    const invoke = jest.fn().mockResolvedValueOnce({
      content: JSON.stringify({
        Hauptkategorien_A: 160,
        Unterkategorien_A: 1603,
        Hauptkategorien_B: null,
        Unterkategorien_B: null
      })
    });

    const result = await runCategorizerStage({
      llm: { invoke } as any,
      itemId: '019159',
      categorizerPrompt: 'categorize',
      candidate: baseCandidate
    });

    expect(result).toEqual({
      Hauptkategorien_A: 160,
      Unterkategorien_A: 1603,
      Hauptkategorien_B: null,
      Unterkategorien_B: null
    });
  });
});

describe('compactTaxonomyReference', () => {
  // The taxonomy reference is the single largest fixed cost in the categorizer prompt (a full
  // markdown category catalog injected on every call). This strips markdown formatting overhead
  // and an irrelevant CSV-import section without dropping any category code, to reduce the risk
  // of overflowing the model's context window (which manifests as an empty completion).
  const sample = [
    '# Kategoriecodes',
    '',
    'Die folgenden Codes werden für Haupt- und Unterkategorien verwendet. Die Hauptkategorien sind in Zehnerschritten nummeriert.',
    '',
    '## Unterstützte Kategorienamen für CSV-Importe',
    '',
    'Die Import-APIs akzeptieren auch ausgeschriebene Namen.',
    '',
    '- Groß- und Kleinschreibung wird ignoriert.',
    '',
    '## 120 – Externe_Netzwerkgeräte',
    '',
    '- **1201** – 5G-, LTE-, UMTS-, GPRS-, GMS-Modems',
    '- **1202** – Wireless Adapter',
    '',
    '## 200 – Non_IT',
    '',
    '- Keine Unterkategorien definiert',
    ''
  ].join('\n');

  it('drops the CSV-import section but keeps the numbering-convention sentence', () => {
    const compact = compactTaxonomyReference(sample);
    expect(compact).toContain('Die Hauptkategorien sind in Zehnerschritten nummeriert');
    expect(compact).not.toContain('CSV-Importe');
    expect(compact).not.toContain('Groß- und Kleinschreibung');
  });

  it('preserves every category and subcategory code', () => {
    const compact = compactTaxonomyReference(sample);
    expect(compact).toContain('120 Externe_Netzwerkgeräte');
    expect(compact).toContain('1201');
    expect(compact).toContain('1202 Wireless Adapter');
    expect(compact).toContain('200 Non_IT');
  });

  it('joins entries with semicolons so a comma-containing name stays unambiguous', () => {
    const compact = compactTaxonomyReference(sample);
    expect(compact).toContain('1201 5G-, LTE-, UMTS-, GPRS-, GMS-Modems; 1202 Wireless Adapter');
  });

  it('marks a heading with no subcategory bullets as having none', () => {
    const compact = compactTaxonomyReference(sample);
    expect(compact).toContain('200 Non_IT (keine Unterkategorien)');
  });

  it('is shorter than the raw source', () => {
    const compact = compactTaxonomyReference(sample);
    expect(compact.length).toBeLessThan(sample.length);
  });

  it('falls back to the raw text when no category headings are found', () => {
    const malformed = 'not a taxonomy document at all';
    expect(compactTaxonomyReference(malformed)).toBe(malformed);
  });
});
