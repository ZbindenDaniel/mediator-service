import { FEATURE_KEYS, parseFeatures } from '../lib/features';
import { loadActions } from '../actions';

describe('parseFeatures', () => {
  it('turns everything on when no manifest is configured', () => {
    const f = parseFeatures(null);
    expect(FEATURE_KEYS.every((k) => f[k])).toBe(true);
  });

  it('switches off listed features and leaves the rest on', () => {
    const f = parseFeatures('{"agentic": false, "printing": false, "logs": true}');
    expect(f.agentic).toBe(false);
    expect(f.printing).toBe(false);
    expect(f.logs).toBe(true);
    expect(f['item-images']).toBe(true);
  });

  it('rejects unknown keys so typos cannot leave a feature on', () => {
    expect(() => parseFeatures('{"item-atachments": false}')).toThrow(/Unknown feature "item-atachments"/);
  });

  it('rejects invalid JSON, non-objects and non-boolean values', () => {
    expect(() => parseFeatures('{agentic: false}')).toThrow(/not valid JSON/);
    expect(() => parseFeatures('["agentic"]')).toThrow(/JSON object/);
    expect(() => parseFeatures('{"agentic": "off"}')).toThrow(/true or false/);
  });
});

describe('feature tags on actions', () => {
  const actions = loadActions();

  it('only uses known feature keys', () => {
    const known = new Set<string>(FEATURE_KEYS);
    const bad = actions.filter((a) => a.feature && !known.has(a.feature)).map((a) => a.key);
    expect(bad).toEqual([]);
  });

  it('tags the AI and print APIs, leaves core item APIs untagged', () => {
    const byKey = new Map(actions.map((a) => [a.key, a.feature]));
    expect(byKey.get('agentic-trigger')).toBe('agentic');
    expect(byKey.get('print-unified')).toBe('printing');
    expect(byKey.get('import-item')).toBeUndefined();
    expect(byKey.get('save-item')).toBeUndefined();
  });
});
