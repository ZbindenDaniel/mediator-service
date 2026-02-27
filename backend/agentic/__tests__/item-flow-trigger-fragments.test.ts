import type { ChatModel } from '../flow/item-flow-extraction';
import type { AgenticTarget } from '../flow/item-flow-schemas';
import { runExtractionAttempts } from '../flow/item-flow-extraction';
import { loadSubcategoryReviewAutomationSignals } from '../review-automation-signals';

jest.mock('../flow/item-flow-categorizer', () => ({
  runCategorizerStage: jest.fn(async () => ({}))
}));

jest.mock('../flow/item-flow-pricing', () => ({
  isUsablePrice: jest.fn(() => true),
  runPricingStage: jest.fn(async () => ({}))
}));

jest.mock('../review-automation-signals', () => ({
  loadSubcategoryReviewAutomationSignals: jest.fn()
}));

const mockedLoadSubcategoryReviewAutomationSignals = loadSubcategoryReviewAutomationSignals as jest.MockedFunction<
typeof loadSubcategoryReviewAutomationSignals
>;

const buildTarget = (): AgenticTarget => ({
  Artikel_Nummer: 'item-1',
  Artikelbeschreibung: 'Widget',
  Verkaufspreis: 10,
  Kurzbeschreibung: 'Short description',
  Langtext: { Veröffentlicht: '', Stromversorgung: '' },
  Hersteller: 'Acme',
  Länge_mm: null,
  Breite_mm: null,
  Höhe_mm: null,
  Gewicht_kg: null,
  Hauptkategorien_A: 1,
  Unterkategorien_A: 11,
  Hauptkategorien_B: 2,
  Unterkategorien_B: 22
});

const baseSignals = {
  sampleSize: 0,
  sampleTarget: 10,
  lowConfidence: true,
  badFormatTrueCount: 0,
  badFormatTruePct: 0,
  wrongInformationTrueCount: 0,
  wrongInformationTruePct: 0,
  wrongPhysicalDimensionsTrueCount: 0,
  wrongPhysicalDimensionsTruePct: 0,
  informationPresentFalseCount: 0,
  informationPresentFalsePct: 0,
  missingSpecTopKeys: [],
  bad_format_trigger: false,
  wrong_information_trigger: false,
  wrong_physical_dimensions_trigger: false,
  missing_spec_trigger: false,
  information_present_low_trigger: false
};

const asJsonBlock = (jsonText: string): string => `\`\`\`json\n${jsonText}\n\`\`\``;

describe('runExtractionAttempts review trigger prompt fragment injection', () => {
  beforeEach(() => {
    mockedLoadSubcategoryReviewAutomationSignals.mockReturnValue(baseSignals);
  });

  it('injects strict JSON/schema fragments when bad_format_trigger is active', async () => {
    mockedLoadSubcategoryReviewAutomationSignals.mockReturnValue({
      ...baseSignals,
      sampleSize: 5,
      badFormatTrueCount: 4,
      badFormatTruePct: 80,
      bad_format_trigger: true
    });

    const target = buildTarget();
    const validExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,"Unterkategorien_A":11,"Hauptkategorien_B":2,' +
      '"Unterkategorien_B":22}';
    const llm: ChatModel = {
      invoke: jest.fn(async () => ({ content: asJsonBlock(validExtraction) }))
    };
    const logger = { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() };

    await runExtractionAttempts({
      llm,
      logger,
      itemId: target.Artikel_Nummer,
      maxAttempts: 1,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract {{EXTRACTION_REVIEW}}',
      correctionPrompt: 'repair json',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor {{SUPERVISOR_REVIEW}}',
      categorizerPrompt: 'categorizer',
      pricingPrompt: 'pricing',
      searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
      target,
      reviewNotes: null,
      skipSearch: true,
      transcriptWriter: null
    });

    const extractionMessages = (llm.invoke as jest.Mock).mock.calls[0]?.[0];
    const userExtractionMessage = extractionMessages?.find((entry: { role: string; content: unknown }) => entry.role === 'user');
    const supervisorMessages = (llm.invoke as jest.Mock).mock.calls[1]?.[0];
    expect(JSON.stringify(extractionMessages)).toContain('Strict output contract: return only one valid JSON object that matches the exact target schema.');
    expect(JSON.stringify(supervisorMessages)).toContain('Reject responses that are not strict schema-conformant JSON payloads');
    expect(String(userExtractionMessage?.content ?? '')).toContain('Signal note: prior reviews flagged formatting risk.');
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'review automation signal prompt injection complete',
      activeTriggers: ['bad_format_trigger'],
      injectedPlaceholderFragments: expect.objectContaining({
        byTrigger: expect.objectContaining({
          bad_format_trigger: expect.objectContaining({ extraction: 1, supervisor: 1, user: 1 })
        })
      })
    }));
  });

  it('injects completeness fragment when information_present_low_trigger is active', async () => {
    mockedLoadSubcategoryReviewAutomationSignals.mockReturnValue({
      ...baseSignals,
      sampleSize: 6,
      informationPresentFalseCount: 5,
      informationPresentFalsePct: 83.3,
      information_present_low_trigger: true
    });

    const target = buildTarget();
    const validExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,"Unterkategorien_A":11,"Hauptkategorien_B":2,' +
      '"Unterkategorien_B":22}';
    const llm: ChatModel = {
      invoke: jest.fn(async () => ({ content: asJsonBlock(validExtraction) }))
    };

    await runExtractionAttempts({
      llm,
      logger: console,
      itemId: target.Artikel_Nummer,
      maxAttempts: 1,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract {{EXTRACTION_REVIEW}}',
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

    const extractionMessages = (llm.invoke as jest.Mock).mock.calls[0]?.[0];
    const userExtractionMessage = extractionMessages?.find((entry: { role: string; content: unknown }) => entry.role === 'user');
    expect(String(userExtractionMessage?.content ?? '')).toContain(
      'Signal note: prior reviews found missing evidence coverage. Prefer explicit unknown/null values over omissions and include every field supported by evidence.'
    );
  });

  it('adds wrong-information preface into extraction user message when trigger is active', async () => {
    mockedLoadSubcategoryReviewAutomationSignals.mockReturnValue({
      ...baseSignals,
      sampleSize: 6,
      wrongInformationTrueCount: 5,
      wrongInformationTruePct: 83.3,
      wrong_information_trigger: true
    });

    const target = buildTarget();
    const validExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,"Unterkategorien_A":11,"Hauptkategorien_B":2,' +
      '"Unterkategorien_B":22}';
    const llm: ChatModel = {
      invoke: jest.fn(async () => ({ content: asJsonBlock(validExtraction) }))
    };
    const logger = { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() };

    await runExtractionAttempts({
      llm,
      logger,
      itemId: target.Artikel_Nummer,
      maxAttempts: 1,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract {{EXTRACTION_REVIEW}}',
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

    const extractionMessages = (llm.invoke as jest.Mock).mock.calls[0]?.[0];
    const userExtractionMessage = extractionMessages?.find((entry: { role: string; content: unknown }) => entry.role === 'user');
    expect(String(userExtractionMessage?.content ?? '')).toContain(
      'Signal note: current data may contain wrong information; consolidate sources before finalizing claims.'
    );
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({
      msg: 'review automation signal prompt injection complete',
      activeTriggers: ['wrong_information_trigger'],
      injectedPlaceholderFragments: expect.objectContaining({
        byTrigger: expect.objectContaining({
          wrong_information_trigger: expect.objectContaining({ extraction: 1, user: 1 })
        })
      })
    }));
  });

  it('applies missing/unneeded spec guidance to injected target snapshot content', async () => {
    const target = buildTarget();
    const validExtraction =
      '{"Artikel_Nummer":"item-1","Artikelbeschreibung":"Widget","Verkaufspreis":10,"Kurzbeschreibung":"Short description",' +
      '"Langtext":{"Veröffentlicht":"","Stromversorgung":""},"Hersteller":"Acme","Länge_mm":null,"Breite_mm":null,' +
      '"Höhe_mm":null,"Gewicht_kg":null,"Hauptkategorien_A":1,"Unterkategorien_A":11,"Hauptkategorien_B":2,' +
      '"Unterkategorien_B":22}';
    const llm: ChatModel = {
      invoke: jest.fn(async () => ({ content: asJsonBlock(validExtraction) }))
    };

    await runExtractionAttempts({
      llm,
      logger: console,
      itemId: target.Artikel_Nummer,
      maxAttempts: 1,
      searchContexts: [],
      aggregatedSources: [],
      recordSources: jest.fn(),
      buildAggregatedSearchText: () => '',
      extractPrompt: 'extract {{EXTRACTION_REVIEW}}',
      correctionPrompt: 'repair json',
      targetFormat: '{}',
      supervisorPrompt: 'supervisor',
      categorizerPrompt: 'categorizer',
      pricingPrompt: 'pricing',
      searchInvoker: jest.fn(async () => ({ text: '', sources: [] })),
      target,
      reviewNotes: null,
      missingSpecFields: ['Leistung'],
      unneededSpecFields: ['Stromversorgung'],
      skipSearch: true,
      transcriptWriter: null
    });

    const extractionMessages = (llm.invoke as jest.Mock).mock.calls[0]?.[0];
    const userExtractionMessage = extractionMessages?.find((entry: { role: string; content: unknown }) => entry.role === 'user');
    const userContent = String(userExtractionMessage?.content ?? '');
    expect(userContent).toContain('"Leistung": null');
    expect(userContent).not.toContain('"Stromversorgung"');
  });
});
