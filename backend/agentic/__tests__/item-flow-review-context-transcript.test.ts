import type { ItemFlowDependencies } from '../flow/item-flow';
import type { AgentTranscriptWriter } from '../flow/transcript';

// TODO(agent): Extend review-context transcript assertions to cover extraction path once deterministic fixtures are available.
describe('runItemFlow review-context transcript section', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('writes review-context before shopware shortcut return with sanitized review directives', async () => {
    const appendTranscriptSection = jest.fn().mockResolvedValue(undefined);
    const transcriptWriter: AgentTranscriptWriter = {
      filePath: '/tmp/review-context-transcript.html',
      publicUrl: '/media/review-context/agentic-transcript.html',
      appendSection: jest.fn()
    };

    await (jest as unknown as { isolateModulesAsync: (cb: () => Promise<void>) => Promise<void> }).isolateModulesAsync(
      async () => {
        jest.doMock('../flow/transcript', () => ({
          createTranscriptWriter: jest.fn().mockResolvedValue(transcriptWriter),
          appendTranscriptSection
        }));

        jest.doMock('../flow/item-flow-shopware', () => ({
          resolveShopwareMatch: jest.fn().mockResolvedValue({
            finalData: {
              Artikel_Nummer: 'A-123',
              Artikelbeschreibung: 'Laborgerät 5000'
            },
            sources: [],
            summary: 'Shopware shortcut result',
            reviewNotes: 'Shopware review notes',
            reviewedBy: 'shopware-agent'
          })
        }));

        const { runItemFlow } = await import('../flow/item-flow');

        const dependencies: ItemFlowDependencies = {
          llm: { invoke: jest.fn().mockResolvedValue({ content: null }) },
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
          searchInvoker: jest.fn().mockResolvedValue({ text: '', sources: [] }),
          saveRequestPayload: jest.fn().mockResolvedValue(undefined),
          markNotificationSuccess: jest.fn().mockResolvedValue(undefined),
          markNotificationFailure: jest.fn().mockResolvedValue(undefined),
          applyAgenticResult: jest.fn().mockResolvedValue(undefined),
          shopwareSearch: jest.fn().mockResolvedValue({ text: '', products: [] })
        };

        await runItemFlow(
          {
            target: {
              Artikel_Nummer: 'A-123',
              Artikelbeschreibung: 'Laborgerät 5000'
            },
            reviewNotes:
              ' Please double check details. Missing spec fields to prioritize: Gewicht_kg, Höhe_mm. Spec fields to remove if present: Ausstattung, PlaceholderField. ',
            skipSearch: true
          },
          dependencies
        );

        expect(appendTranscriptSection).toHaveBeenCalledWith(
          transcriptWriter,
          'review-context',
          expect.objectContaining({
            reviewNotes:
              'Please double check details. Missing spec fields to prioritize: Gewicht_kg, Höhe_mm. Spec fields to remove if present: Ausstattung, PlaceholderField.',
            reviewNotesTruncated: false,
            skipSearch: true,
            missingSpecCount: 2,
            unneededSpecCount: 2
          }),
          'Initial reviewer directives captured',
          dependencies.logger,
          'A-123'
        );
      }
    );
  });
});
