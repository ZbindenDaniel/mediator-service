import { parseLangtext } from '../backend/lib/langtext';

describe('parseLangtext malformed JSON handling', () => {
  it('accepts malformed JSON-like payloads as text with a single warning', () => {
    const warn = jest.fn();
    const logger = { warn } as const;
    const malformedPayload = '{"Formfaktor":"3,5" inch"}';

    const firstResult = parseLangtext(malformedPayload, { logger, context: 'test-parse' });

    expect(typeof firstResult).toBe('string');
    expect((firstResult as string).startsWith('{')).toBe(false);
    expect(firstResult).toContain('Formfaktor');
    expect(warn).toHaveBeenCalledTimes(1);

    const secondResult = parseLangtext(firstResult, { logger, context: 'test-parse' });

    expect(secondResult).toBe(firstResult);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
