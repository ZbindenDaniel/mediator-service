import fs from 'fs';
import path from 'path';

import { AgentOutputSchema } from '../flow/item-flow-schemas';
import { collectSchemaKeys } from '../flow/schema-contract';

describe('agent schema contract compatibility', () => {
  const validItem = {
    Artikel_Nummer: 'A-1',
    Artikelbeschreibung: 'Laptop Beispiel',
    Verkaufspreis: null,
    Kurzbeschreibung: 'Kurz',
    Spezifikationen: {
      Stromversorgung: '230V',
      Lieferumfang: ['Netzteil', 'Handbuch']
    },
    Hersteller: 'Acme',
    Länge_mm: null,
    Breite_mm: null,
    Höhe_mm: null,
    Gewicht_kg: null,
    Hauptkategorien_A: null,
    Unterkategorien_A: null,
    Hauptkategorien_B: null,
    Unterkategorien_B: null
  };

  it('accepts canonical item payload in output schema', () => {
    const outputParsed = AgentOutputSchema.safeParse(validItem);
    expect(outputParsed.success).toBe(true);
  });

  it('collects canonical item keys for telemetry checks', () => {
    const keys = collectSchemaKeys(validItem);
    expect(keys).toContain('Spezifikationen');
    expect(keys).toContain('Artikelbeschreibung');
  });

  it('keeps extraction/categorizer/supervisor prompts anchored to canonical contract', () => {
    const extractPrompt = fs.readFileSync(path.resolve(__dirname, '../prompts/extract.md'), 'utf8');
    const categorizerPrompt = fs.readFileSync(path.resolve(__dirname, '../prompts/categorizer.md'), 'utf8');
    const supervisorPrompt = fs.readFileSync(path.resolve(__dirname, '../prompts/supervisor.md'), 'utf8');

    expect(extractPrompt).toContain('schema-contract.md');
    expect(categorizerPrompt).toContain('schema-contract.md');
    expect(supervisorPrompt).toContain('schema-contract.md');
  });
});
