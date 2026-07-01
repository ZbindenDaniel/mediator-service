jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('# Kategoriecodes\n\n## 160 – Kabel_Adapter_Montage\n- 1603 – Adapter\n- 1602 – Kabel Intern\n')
}));

import { runCategorizerStage } from '../flow/item-flow-categorizer';

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
