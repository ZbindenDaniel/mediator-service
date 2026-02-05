import type { SearchInvoker } from '../flow/item-flow-search';
import { collectSearchContexts } from '../flow/item-flow-search';

describe('collectSearchContexts sanitization', () => {
  it('preserves spec-like URL lines and keeps output bounded', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const sourceText = [
      'https://example.com/path/to/resource/that/is/long/and/mostly/noise/for/the-model/but/contains/nothing/technical',
      '',
      'Artikel 123-ABC Preis 49,99 EUR https://example.com/product/123-abc/details/specification-page-with-very-long-url-string',
      '',
      'Gewicht 5 kg | Leistung 220 W | Spannung 230 V | Modell ZX-9000 https://example.com/specs/energy/long-long-long'
    ].join('\n');

    const searchInvoker: SearchInvoker = jest.fn(async () => ({
      text: sourceText,
      sources: [
        {
          title: 'Product source',
          url: 'https://example.com/product/123-abc',
          description: 'Specs and price'
        }
      ]
    }));

    const result = await collectSearchContexts({
      searchTerm: 'Gerät ZX',
      searchInvoker,
      logger,
      itemId: 'item-sanitize-1',
      shouldSearch: true,
      plannerDecision: {
        shouldSearch: true,
        plans: [{ query: 'Gerätedaten Gerät ZX', metadata: { context: 'planner' } }]
      }
    });

    const aggregatedText = result.buildAggregatedSearchText();

    expect(aggregatedText).toContain('Artikel 123-ABC Preis 49,99 EUR');
    expect(aggregatedText).toContain('Gewicht 5 kg | Leistung 220 W | Spannung 230 V | Modell ZX-9000');

    const paragraphCount = aggregatedText.split('\n\n').length;
    expect(paragraphCount).toBeLessThanOrEqual(4);
  });

  it('logs preserved spec-like lines when sanitization is heavy', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const searchInvoker: SearchInvoker = jest.fn(async () => ({
      text: [
        'https://example.com/noise/one/two/three/four/five/six/seven/eight/nine/ten/eleven',
        'https://example.com/noise/alpha/beta/gamma/delta/epsilon/zeta/eta/theta/iota/kappa/lambda',
        '',
        'Artikel 555 Preis 199,00 EUR https://example.com/product/555/specs/very/long/url/path/with/tracking/parameter',
        '',
        'Model AB-1200 https://example.com/models/ab-1200?tracking=abcdefghijklmnopqrstuv'
      ].join('\n'),
      sources: []
    }));

    const result = await collectSearchContexts({
      searchTerm: 'Maschine AB-1200',
      searchInvoker,
      logger,
      itemId: 'item-sanitize-2',
      shouldSearch: true,
      plannerDecision: {
        shouldSearch: true,
        plans: [{ query: 'Gerätedaten Maschine AB-1200', metadata: { context: 'planner' } }]
      }
    });

    result.buildAggregatedSearchText();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'aggregated search text sanitized heavily',
        itemId: 'item-sanitize-2',
        preservedSpecLineCount: expect.any(Number)
      })
    );

    const heavySanitizationLog = logger.warn.mock.calls.find(
      ([entry]) => entry?.msg === 'aggregated search text sanitized heavily'
    );
    expect(heavySanitizationLog?.[0]?.preservedSpecLineCount).toBeGreaterThan(0);
  });
});
