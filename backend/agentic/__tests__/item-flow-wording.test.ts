import { parseWordingResponse, renderStandardsGuidance, runWordingStage } from '../flow/item-flow-wording';
import type { StandardsContract } from '../../../models/agentic-findings';

describe('renderStandardsGuidance', () => {
  it('renders literal banned phrases as house-style guidance with reasons', () => {
    const standards: StandardsContract = {
      version: 1,
      bannedPhrases: [
        { id: 'w', pattern: 'mit einer Garantie von', message: 'Garantie-Formulierung entfernen.' },
        { id: 'l', pattern: 'im Lieferumfang enthalten', message: 'Lieferumfang-Baustein.' }
      ]
    };
    const rules = renderStandardsGuidance(standards);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain('mit einer Garantie von');
    expect(rules[0]).toContain('Garantie-Formulierung entfernen.');
  });

  it('skips regex rules (only literal phrases become human guidance) and handles null', () => {
    const standards: StandardsContract = {
      version: 1,
      bannedPhrases: [{ id: 'r', pattern: '\\d+GB', regex: true, message: 'x' }]
    };
    expect(renderStandardsGuidance(standards)).toEqual([]);
    expect(renderStandardsGuidance(null)).toEqual([]);
  });
});

describe('parseWordingResponse', () => {
  it('extracts trimmed, non-empty prose fields', () => {
    const raw = '{"Artikelbeschreibung":"  Lenovo ThinkPad X1  ","Kurzbeschreibung":"Gebrauchtes Notebook."}';
    expect(parseWordingResponse(raw)).toEqual({
      Artikelbeschreibung: 'Lenovo ThinkPad X1',
      Kurzbeschreibung: 'Gebrauchtes Notebook.'
    });
  });

  it('returns only the fields present, ignoring empty/blank ones', () => {
    expect(parseWordingResponse('{"Artikelbeschreibung":"X1","Kurzbeschreibung":"   "}')).toEqual({ Artikelbeschreibung: 'X1' });
  });

  it('maps a non-empty Spezifikationen object back to Langtext (tidied key names)', () => {
    const raw = '{"Kurzbeschreibung":"Notebook.","Spezifikationen":{"Prozessor":"Intel Core i5","Speichertyp":"SSD"}}';
    expect(parseWordingResponse(raw)).toEqual({
      Kurzbeschreibung: 'Notebook.',
      Langtext: { Prozessor: 'Intel Core i5', Speichertyp: 'SSD' }
    });
  });

  it('never blanks specs: an empty or missing Spezifikationen leaves Langtext untouched', () => {
    expect(parseWordingResponse('{"Artikelbeschreibung":"X1","Spezifikationen":{}}')).toEqual({ Artikelbeschreibung: 'X1' });
  });

  it('returns null when nothing usable / invalid JSON', () => {
    expect(parseWordingResponse('{"Kurzbeschreibung":""}')).toBeNull();
    expect(parseWordingResponse('not json')).toBeNull();
    expect(parseWordingResponse('{}')).toBeNull();
  });
});

describe('runWordingStage — operator exclusions + recognized spec fields reach the model', () => {
  it('includes exclusions and recognizedSpecFields in the payload', async () => {
    let userContent = '';
    const llm = {
      invoke: async (messages: Array<{ role: string; content: string }>) => {
        userContent = messages[1].content;
        return { content: '{"Kurzbeschreibung":"Notebook.","Spezifikationen":{"Prozessor":"i5"}}' };
      }
    } as unknown as Parameters<typeof runWordingStage>[0]['llm'];

    const result = await runWordingStage({
      llm,
      itemId: 'A1',
      wordingPrompt: 'system',
      candidate: { Hersteller: 'Lenovo', Artikelbeschreibung: 'X', Kurzbeschreibung: 'y', Langtext: { Prozessor: 'i5', OS: 'Win' } } as never,
      standards: { version: 1, exclusions: ['Kein Betriebssystem / OS'] },
      recognizedSpecFields: ['Prozessor', 'Display']
    });

    const payload = JSON.parse(userContent);
    expect(payload.exclusions).toEqual(['Kein Betriebssystem / OS']);
    expect(payload.recognizedSpecFields).toEqual(['Prozessor', 'Display']);
    expect(result).toEqual({ Kurzbeschreibung: 'Notebook.', Langtext: { Prozessor: 'i5' } });
  });

  it('omits exclusions/recognizedSpecFields when empty or absent', async () => {
    let userContent = '';
    const llm = {
      invoke: async (messages: Array<{ role: string; content: string }>) => {
        userContent = messages[1].content;
        return { content: '{"Kurzbeschreibung":"z"}' };
      }
    } as unknown as Parameters<typeof runWordingStage>[0]['llm'];

    await runWordingStage({ llm, itemId: 'A', wordingPrompt: 's', candidate: {} as never, standards: { version: 1 } });
    const payload = JSON.parse(userContent);
    expect('exclusions' in payload).toBe(false);
    expect('recognizedSpecFields' in payload).toBe(false);
  });
});
