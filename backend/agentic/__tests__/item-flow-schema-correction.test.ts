// Repro of a production failure: the extraction model returned a fully-populated but wrong-shaped
// payload (English datasheet-style keys instead of the canonical schema) on a search-context
// continuation pass. Schema validation correctly rejected it, but the run then burned all 3
// attempts on repeated retries that drifted further from the schema each time, discarding a
// response that already had all the real data — just under the wrong key names.
import type { ChatModel } from '../flow/item-flow-extraction';
import type { AgenticTarget } from '../flow/item-flow-schemas';
import { runExtractionAttempts } from '../flow/item-flow-extraction';

jest.mock('../flow/item-flow-categorizer', () => ({
  runCategorizerStage: jest.fn(async () => ({}))
}));

jest.mock('../flow/item-flow-pricing', () => ({
  isUsablePrice: jest.fn(() => true),
  runPricingStage: jest.fn(async () => ({}))
}));

const buildTarget = (): AgenticTarget => ({
  Artikel_Nummer: '004685',
  Artikelbeschreibung: 'ATI 102-A771, 256MB',
  Verkaufspreis: 0,
  Kurzbeschreibung: '',
  Langtext: '',
  Hersteller: 'ATI',
  Länge_mm: 18,
  Breite_mm: 8,
  Höhe_mm: 2,
  Gewicht_kg: 500,
  Hauptkategorien_A: null,
  Unterkategorien_A: null,
  Hauptkategorien_B: null,
  Unterkategorien_B: null
});

// The exact wrong shape observed in production: no canonical keys at all, English datasheet-style
// labels mirroring the scraped source content instead of the target schema.
const wrongShapedExtraction = JSON.stringify({
  product_name: 'ATI Radeon X100 (ATI-102) Grafikkarten',
  manufacturer: 'ATI Technologies',
  model: 'ATI-102',
  category: 'Computer Hardware / Video Cards',
  description: 'Eine Low-Profile Grafikkarte basierend auf der Radeon X100 Architektur.',
  key_specifications: { architecture: 'Radeon X100', vram: '128 MB' }
});

const remappedExtraction = JSON.stringify({
  Artikelbeschreibung: 'ATI Radeon X100 (ATI-102) Grafikkarten',
  Kurzbeschreibung: 'Eine Low-Profile Grafikkarte basierend auf der Radeon X100 Architektur.',
  Hersteller: 'ATI Technologies',
  Langtext: { Modell: 'ATI-102', Architektur: 'Radeon X100', VRAM: '128 MB' },
  Verkaufspreis: null,
  Länge_mm: null,
  Breite_mm: null,
  Höhe_mm: null,
  Gewicht_kg: null,
  Hauptkategorien_A: null,
  Unterkategorien_A: null,
  Hauptkategorien_B: null,
  Unterkategorien_B: null
});

describe('runExtractionAttempts schema correction', () => {
  it('salvages a wrong-shaped-but-complete response via the correction agent without burning a retry attempt', async () => {
    const target = buildTarget();
    const extractionResponses = [{ content: wrongShapedExtraction }, { content: 'pass' }];
    const llm: ChatModel = {
      invoke: jest.fn(async () => extractionResponses.shift() ?? { content: '' })
    };
    const correctionLlm: ChatModel = {
      invoke: jest.fn(async () => ({ content: remappedExtraction }))
    };

    const result = await runExtractionAttempts({
      llm,
      correctionModel: correctionLlm,
      logger: console,
      itemId: target.Artikel_Nummer,
      maxAttempts: 3,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract',
      correctionPrompt: 'repair json',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor',
      categorizerPrompt: 'categorizer',
      pricingPrompt: 'pricing',
      searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
      target,
      reviewNotes: null,
      skipSearch: true,
      transcriptWriter: null
    });

    expect(result.success).toBe(true);
    expect(result.data.Artikelbeschreibung).toBe('ATI Radeon X100 (ATI-102) Grafikkarten');
    expect(result.data.Hersteller).toBe('ATI Technologies');
    expect(correctionLlm.invoke).toHaveBeenCalledTimes(1);
    // Extraction call + supervisor call only — the schema correction salvage must not have
    // consumed one of the 3 available extraction attempts (llm.invoke would be 3+ if it had).
    expect(llm.invoke).toHaveBeenCalledTimes(2);
  });

  it('falls through to the plain-language retry hint when the correction agent cannot produce a valid remap', async () => {
    const target = buildTarget();
    // No distinct correctionModel is passed, so the correction attempt reuses the same `llm` mock —
    // its response here (still wrong-shaped) simulates the correction agent failing to repair it.
    const extractionResponses = [
      { content: wrongShapedExtraction }, // extraction attempt 1
      { content: wrongShapedExtraction }, // schema-correction attempt (still fails validation)
      { content: remappedExtraction }, // extraction attempt 2 (retry, now correct)
      { content: 'pass' } // supervisor
    ];
    const llm: ChatModel = {
      invoke: jest.fn(async () => extractionResponses.shift() ?? { content: '' })
    };

    const result = await runExtractionAttempts({
      llm,
      logger: console,
      itemId: target.Artikel_Nummer,
      maxAttempts: 3,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract',
      correctionPrompt: 'repair json',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor',
      categorizerPrompt: 'categorizer',
      pricingPrompt: 'pricing',
      searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
      target,
      reviewNotes: null,
      skipSearch: true,
      transcriptWriter: null
    });

    expect(result.success).toBe(true);
    expect(llm.invoke).toHaveBeenCalledTimes(4);

    const retriedExtractionCall = (llm.invoke as jest.Mock).mock.calls[2]?.[0];
    const retriedCallUserContent = JSON.stringify(retriedExtractionCall);
    expect(retriedCallUserContent).toContain('Missing required field(s): Artikelbeschreibung, Kurzbeschreibung, Hersteller');
    expect(retriedCallUserContent).toContain('do not rename, translate, or abbreviate');
  });
});
