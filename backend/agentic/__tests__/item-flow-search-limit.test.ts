import fs from 'fs';
import path from 'path';
import { searchLimits } from '../config';
import { AgentOutputSchema, type AgenticTarget } from '../flow/item-flow-schemas';

// TODO(agent): Add runtime integration coverage for multi-attempt truncation once extraction harness fixtures are stable.
const buildTarget = (): AgenticTarget => ({
  Artikel_Nummer: 'item-1',
  Artikelbeschreibung: 'Widget',
  Verkaufspreis: null,
  Kurzbeschreibung: 'Short description',
  Langtext: { Veröffentlicht: '', Stromversorgung: '' },
  Hersteller: 'Acme',
  Länge_mm: null,
  Breite_mm: null,
  Höhe_mm: null,
  Gewicht_kg: null,
  Hauptkategorien_A: null,
  Unterkategorien_A: null,
  Hauptkategorien_B: null,
  Unterkategorien_B: null
});

describe('item flow search query limits', () => {
  it('default configuration permits up to 3 agent follow-up queries', () => {
    expect(searchLimits.maxAgentQueriesPerRequest).toBe(3);

    const withinLimit = AgentOutputSchema.safeParse({
      ...buildTarget(),
      __searchQueries: ['q1', 'q2', 'q3']
    });

    expect(withinLimit.success).toBe(true);
  });

  it('enforces truncation boundary semantics by rejecting only above configured schema limit', () => {
    const atLimit = AgentOutputSchema.safeParse({
      ...buildTarget(),
      __searchQueries: ['q1', 'q2', 'q3']
    });
    const aboveLimit = AgentOutputSchema.safeParse({
      ...buildTarget(),
      __searchQueries: ['q1', 'q2', 'q3', 'q4']
    });

    expect(atLimit.success).toBe(true);
    expect(aboveLimit.success).toBe(false);
  });

  it('logs truncation with requested and allowed counts in extraction guard payload', () => {
    const extractionFlowPath = path.resolve(__dirname, '../flow/item-flow-extraction.ts');
    const extractionFlowSource = fs.readFileSync(extractionFlowPath, 'utf8');

    expect(extractionFlowSource).toContain("msg: 'truncating agent search queries before schema validation'");
    expect(extractionFlowSource).toContain('requestedCount: rawQueries.length');
    expect(extractionFlowSource).toContain('allowedCount: resolvedLimit');
    expect(extractionFlowSource).toContain('configuredLimit: maxAgentSearchesPerRequest');
    expect(extractionFlowSource).toContain('effectiveLimit: resolvedLimit');
    expect(extractionFlowSource).toContain('itemId');
  });
});
