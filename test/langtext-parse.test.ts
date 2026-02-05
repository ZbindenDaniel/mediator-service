import { parseLangtext as parseBackendLangtext } from '../backend/lib/langtext';
import { parseLangtext as parseFrontendLangtext, stringifyLangtextEntries } from '../frontend/src/lib/langtext';

describe('parseLangtext malformed JSON handling', () => {
  it('accepts malformed JSON-like payloads as text with a single warning', () => {
    const warn = jest.fn();
    const logger = { warn } as const;
    const malformedPayload = '{"Formfaktor":"3,5" inch"}';

    const firstResult = parseBackendLangtext(malformedPayload, { logger, context: 'test-parse' });

    expect(typeof firstResult).toBe('string');
    expect((firstResult as string).startsWith('{')).toBe(false);
    expect(firstResult).toContain('Formfaktor');
    expect(warn).toHaveBeenCalledTimes(1);

    const secondResult = parseBackendLangtext(firstResult, { logger, context: 'test-parse' });

    expect(secondResult).toBe(firstResult);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('preserves string arrays while dropping invalid entries with warning telemetry', () => {
    const warn = jest.fn();
    const debug = jest.fn();
    const logger = { warn, debug } as const;

    const parsed = parseBackendLangtext(
      {
        RAM: ['16 GB', 'DDR5', 6400],
        Ports: ['USB-C', 'HDMI'],
        Note: 'Business-class'
      },
      { logger, context: 'test-parse-arrays' }
    );

    expect(parsed).toEqual({
      RAM: ['16 GB', 'DDR5'],
      Ports: ['USB-C', 'HDMI'],
      Note: 'Business-class'
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Dropping non-string values from Langtext array payload entry'),
      expect.objectContaining({ key: 'RAM', droppedCount: 1, originalLength: 3 })
    );
    expect(debug).not.toHaveBeenCalled();
  });

  it('round-trips array payloads between frontend parse/stringify helpers', () => {
    const warn = jest.fn();
    const error = jest.fn();
    const logger = { warn, error } as const;

    const parseResult = parseFrontendLangtext('{"Ports":["USB-C","HDMI"],"Note":"Compact"}', logger);
    expect(parseResult.kind).toBe('json');
    if (parseResult.kind !== 'json') {
      throw new Error('expected json parse result');
    }

    expect(parseResult.rawObject).toEqual({ Ports: ['USB-C', 'HDMI'], Note: 'Compact' });

    const serialized = stringifyLangtextEntries(parseResult.entries);
    expect(serialized).toBe('{"Ports":"USB-C\\nHDMI","Note":"Compact"}');
    expect(warn).toHaveBeenCalledWith(
      'Langtext array value converted to newline-delimited editor string',
      expect.objectContaining({ key: 'Ports', count: 2 })
    );
    expect(error).not.toHaveBeenCalled();
  });
});
