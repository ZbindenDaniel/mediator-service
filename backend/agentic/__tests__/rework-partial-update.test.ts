import { applyReworkPartialUpdate } from '../flow/item-flow';

describe('applyReworkPartialUpdate — targeted rework preservation', () => {
  const original = {
    Artikel_Nummer: 'A-1',
    Artikelbeschreibung: 'Laptop Dell XPS 13',
    Kurzbeschreibung: 'Ein guter Laptop.',
    Verkaufspreis: 499,
    Hauptkategorien_A: 201,
    Langtext: {
      Prozessor: 'Intel i5',
      RAM: '16 GB',
      Speicher: '512 GB SSD',
      Grafikkarte: 'Intel Iris',
    },
  } as Record<string, unknown>;

  it('overlays only the selected Langtext keys and preserves all others', () => {
    const model = {
      Artikelbeschreibung: 'COMPLETELY DIFFERENT NAME',
      Verkaufspreis: 999,
      Langtext: {
        Prozessor: 'Intel Core i5-1135G7',
        RAM: 'WRONG',
        Speicher: 'WRONG',
        Grafikkarte: 'WRONG',
      },
    } as Record<string, unknown>;

    const result = applyReworkPartialUpdate(original, model, ['Prozessor'], 'A-1') as any;

    // Selected key took the model value:
    expect(result.Langtext.Prozessor).toBe('Intel Core i5-1135G7');
    // Every other Langtext key kept its original value:
    expect(result.Langtext.RAM).toBe('16 GB');
    expect(result.Langtext.Speicher).toBe('512 GB SSD');
    expect(result.Langtext.Grafikkarte).toBe('Intel Iris');
    // Top-level fields untouched (model tried to change them but they weren't selected):
    expect(result.Artikelbeschreibung).toBe('Laptop Dell XPS 13');
    expect(result.Verkaufspreis).toBe(499);
    expect(result.Hauptkategorien_A).toBe(201);
  });

  it('overlays a selected top-level field while leaving Langtext intact', () => {
    const model = {
      Kurzbeschreibung: 'A crisp, reworded German summary.',
      Langtext: { Prozessor: 'SHOULD-NOT-APPLY' },
    } as Record<string, unknown>;

    const result = applyReworkPartialUpdate(original, model, ['Kurzbeschreibung'], 'A-1') as any;

    expect(result.Kurzbeschreibung).toBe('A crisp, reworded German summary.');
    // Langtext must be untouched because Prozessor was not selected:
    expect(result.Langtext.Prozessor).toBe('Intel i5');
  });

  it('keeps the original value for a selected key the model did not return', () => {
    const model = { Langtext: {} } as Record<string, unknown>;
    const result = applyReworkPartialUpdate(original, model, ['Prozessor'], 'A-1') as any;
    expect(result.Langtext.Prozessor).toBe('Intel i5');
  });

  it('handles multiple selected keys (mix of Langtext + top-level)', () => {
    const model = {
      Artikelbeschreibung: 'Neuer Name',
      Langtext: { RAM: '32 GB', Speicher: 'ignored-not-selected' },
    } as Record<string, unknown>;

    const result = applyReworkPartialUpdate(original, model, ['Artikelbeschreibung', 'RAM'], 'A-1') as any;

    expect(result.Artikelbeschreibung).toBe('Neuer Name');
    expect(result.Langtext.RAM).toBe('32 GB');
    expect(result.Langtext.Speicher).toBe('512 GB SSD'); // not selected → original
    expect(result.Kurzbeschreibung).toBe('Ein guter Laptop.'); // not selected → original
  });
});
