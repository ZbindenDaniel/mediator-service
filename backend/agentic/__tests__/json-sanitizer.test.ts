import { sanitizeJsonInput, parseJsonWithSanitizer } from '../utils/json';

describe('sanitizeJsonInput', () => {
  it('returns a clean JSON string unchanged', () => {
    const input = '{"a":1}';
    expect(sanitizeJsonInput(input)).toBe(input);
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeJsonInput('  {"b":2}  ')).toBe('{"b":2}');
  });

  it('strips code fences with a language tag', () => {
    const input = '```json\n{"c":3}\n```';
    expect(sanitizeJsonInput(input)).toBe('{"c":3}');
  });

  it('strips plain code fences without a language tag', () => {
    const input = '```\n{"d":4}\n```';
    expect(sanitizeJsonInput(input)).toBe('{"d":4}');
  });

  it('extracts the braced segment when surrounded by prose', () => {
    const input = 'Here is the result: {"e":5} done.';
    expect(sanitizeJsonInput(input)).toBe('{"e":5}');
  });

  it('handles nested braces correctly', () => {
    const input = 'prefix {"a":{"b":1}} suffix';
    expect(sanitizeJsonInput(input)).toBe('{"a":{"b":1}}');
  });

  it('throws TypeError when input is not a string', () => {
    expect(() => sanitizeJsonInput(null)).toThrow(TypeError);
    expect(() => sanitizeJsonInput(42)).toThrow(TypeError);
    expect(() => sanitizeJsonInput({})).toThrow(TypeError);
  });
});

describe('parseJsonWithSanitizer', () => {
  it('parses clean JSON', () => {
    expect(parseJsonWithSanitizer('{"x":1}')).toEqual({ x: 1 });
  });

  it('parses JSON wrapped in code fences', () => {
    const raw = '```json\n{"y":2}\n```';
    expect(parseJsonWithSanitizer(raw)).toEqual({ y: 2 });
  });

  it('parses JSON after trimming whitespace', () => {
    expect(parseJsonWithSanitizer('  {"z":3}  ')).toEqual({ z: 3 });
  });

  it('parses JSON embedded in prose', () => {
    expect(parseJsonWithSanitizer('Output: {"n":7} end')).toEqual({ n: 7 });
  });

  it('throws when placeholder token "..." appears as an object value', () => {
    const input = '{"key": ...}';
    expect(() => parseJsonWithSanitizer(input)).toThrow(/Placeholder token/i);
  });

  it('attaches placeholderIssues to the thrown error', () => {
    const input = '{"missingField": ...}';
    let caught: Error & { placeholderIssues?: Array<{ keyPath: string }> } | undefined;
    try {
      parseJsonWithSanitizer(input);
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught?.placeholderIssues).toBeDefined();
    expect(caught?.placeholderIssues?.[0].keyPath).toBe('missingField');
  });

  it('throws when em-dash placeholder appears as an object value', () => {
    const input = '{"field": ——}';
    expect(() => parseJsonWithSanitizer(input)).toThrow(/Placeholder token/i);
  });

  it('throws on genuinely invalid JSON with no recoverable segment', () => {
    expect(() => parseJsonWithSanitizer('not json at all')).toThrow();
  });

  it('recovers from a fenced JSON block after initial parse fails', () => {
    // The outer string is not valid JSON but contains a valid ```json fence
    const raw = 'Some prose\n```json\n{"recovered":true}\n```\nmore prose';
    expect(parseJsonWithSanitizer(raw)).toEqual({ recovered: true });
  });

  it('attaches the sanitized string to parse error for diagnostics', () => {
    let caught: Error & { sanitized?: string } | undefined;
    try {
      parseJsonWithSanitizer('{ bad json');
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(typeof caught?.sanitized).toBe('string');
  });

  it('parses complex nested objects', () => {
    const obj = { a: [1, 2, 3], b: { c: null, d: 'text' } };
    expect(parseJsonWithSanitizer(JSON.stringify(obj))).toEqual(obj);
  });
});
