import { parseWordingResponse, renderStandardsGuidance } from '../flow/item-flow-wording';
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

  it('returns null when nothing usable / invalid JSON', () => {
    expect(parseWordingResponse('{"Kurzbeschreibung":""}')).toBeNull();
    expect(parseWordingResponse('not json')).toBeNull();
    expect(parseWordingResponse('{}')).toBeNull();
  });
});
