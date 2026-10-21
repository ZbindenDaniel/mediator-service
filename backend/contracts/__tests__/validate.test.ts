import { validateContractDocument, validateContractSet, loadContractSetFromDisk, unusedContractCodes } from '../validate';
import { parseTaxonomySeed } from '../../lib/taxonomy';
import fs from 'fs';
import path from 'path';

const set = (parts: { quality?: Record<string, unknown>; specs?: Record<string, unknown>; assembly?: Record<string, unknown> }, known?: number[]) =>
  validateContractSet({
    quality: new Map(Object.entries(parts.quality ?? { general: { version: 1, questions: [] } })),
    specs: new Map(Object.entries(parts.specs ?? {})),
    assembly: new Map(Object.entries(parts.assembly ?? {})),
    knownSubcategories: known ? new Set(known) : undefined
  });

const slot = (key: string, target: number, extra: Record<string, unknown> = {}) => ({ key, label: key, targetSubcategory: target, ...extra });

describe('contract validator', () => {
  it('accepts the shipped contracts against the shipped taxonomy seed', () => {
    const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../config/taxonomy.seed.json'), 'utf8'));
    const known = new Set(parseTaxonomySeed(seed).flatMap((c) => c.subcategories.map((s) => s.code)));
    expect(validateContractSet({ ...loadContractSetFromDisk(), knownSubcategories: known })).toEqual([]);
  });

  it('accepts the catalogue draft (config/catalogue) as an overlay on the shipped set', () => {
    const repo = path.resolve(__dirname, '../../..');
    const seed = JSON.parse(fs.readFileSync(path.join(repo, 'config/catalogue/taxonomy.seed.json'), 'utf8'));
    const known = new Set(parseTaxonomySeed(seed).flatMap((c) => c.subcategories.map((s) => s.code)));
    const shipped = loadContractSetFromDisk();
    for (const type of ['quality', 'specs', 'assembly'] as const) {
      const dir = path.join(repo, 'config/catalogue/contracts', type);
      for (const f of fs.readdirSync(dir)) shipped[type].set(f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    }
    expect(validateContractSet({ ...shipped, knownSubcategories: known, skipUnknownCodes: true })).toEqual([]);
    // the catalogue taxonomy is only Laptop + its components, so the shipped refurbishment files are unused there
    expect(unusedContractCodes({ ...shipped, knownSubcategories: known })).toContain('quality/102.json');
  });

  it('rejects unknown question types, out-of-range impacts and impact keys that are not values', () => {
    const errors = validateContractDocument('quality', {
      version: 1,
      questions: [
        { id: 'a', type: 'slider', question: 'a' },
        { id: 'b', type: 'boolean', question: 'b', qualityImpact: { true: 0 } },
        { id: 'c', type: 'select', question: 'c', values: ['x'], qualityImpact: { y: 3 } },
        { id: 'c', type: 'text', question: 'dup' }
      ]
    });
    expect(errors.join('\n')).toMatch(/unknown type "slider"/);
    expect(errors.join('\n')).toMatch(/qualityImpact "true" must be a number 1–5/);
    expect(errors.join('\n')).toMatch(/qualityImpact key "y" is not one of its values/);
    expect(errors.join('\n')).toMatch(/duplicate question id "c"/);
  });

  it('checks multi questions: values xor suggestions, numeric count keys', () => {
    const errors = validateContractDocument('quality', {
      questions: [{ id: 'm', type: 'multi', question: 'm', values: ['a'], suggestions: ['b'], qualityImpact: { many: 2 } }]
    });
    expect(errors.join('\n')).toMatch(/either "values" or "suggestions"/);
    expect(errors.join('\n')).toMatch(/keys are entry counts/);
  });

  it('requires canonical presence values and no own qualityImpact on weighted slots', () => {
    const errors = validateContractDocument('assembly', {
      parts: [
        slot('webcam', 2109, { weight: 3, question: { id: 'part_webcam', type: 'select', question: '?', values: ['Ja', 'Nein'] } }),
        slot('fan', 2118, { weight: 2, question: { id: 'has_fan', type: 'boolean', question: '?', qualityImpact: { false: 1 } } }),
        slot('lcd', 2105, { weight: -1 })
      ]
    });
    expect(errors.join('\n')).toMatch(/presence values must be/);
    expect(errors.join('\n')).toMatch(/must not also carry qualityImpact/);
    expect(errors.join('\n')).toMatch(/"weight" must be a positive number/);
  });

  it('detects assembly cycles', () => {
    const errors = set({
      assembly: {
        '201': { parts: [slot('display', 2101)] },
        '2101': { parts: [slot('panel', 2105), slot('oops', 201)] }
      }
    });
    expect(errors).toContain('assembly cycle: 201 → 2101 → 201');
  });

  it('flags question ids shared across merged contracts and showIf on unknown or multi targets', () => {
    const errors = set({
      quality: {
        general: { questions: [{ id: 'x', type: 'boolean', question: 'x' }] },
        '201': {
          questions: [
            { id: 'keys', type: 'multi', question: 'k' },
            { id: 'y', type: 'boolean', question: 'y', showIf: { questionId: 'keys', value: '[]' } },
            { id: 'z', type: 'boolean', question: 'z', showIf: { questionId: 'nope', value: 'true' } }
          ]
        }
      },
      assembly: { '201': { parts: [slot('a', 2101, { question: { id: 'x', type: 'boolean', question: 'x' } })] } }
    });
    expect(errors.join('\n')).toMatch(/"x" is defined in both quality\/general.json and assembly\/201.json/);
    expect(errors.join('\n')).toMatch(/showIf cannot target multi question "keys"/);
    expect(errors.join('\n')).toMatch(/showIf targets unknown question "nope"/);
  });

  it('allows showIf on a slot presence answer (e.g. missing keys when the keyboard is integrated)', () => {
    const errors = set({
      quality: {
        general: { questions: [] },
        '2102': { questions: [{ id: 'missing_keys', type: 'multi', question: 'k', showIf: { questionId: 'part_keyboard', value: 'Fest verbaut' } }] }
      },
      assembly: {
        '2102': { parts: [slot('keyboard', 2104, { weight: 5, question: { id: 'part_keyboard', type: 'select', question: '?', values: ['Vorhanden', 'Nicht vorhanden', 'Nicht vorgesehen', 'Fest verbaut'] } })] }
      }
    }, [2102, 2104]);
    expect(errors).toEqual([]);
  });

  it('checks slot targets and file codes against the taxonomy', () => {
    const errors = set({ assembly: { '201': { parts: [slot('gpu', 604)] } } }, [201]);
    expect(errors).toContain('assembly/201.json part "gpu": targetSubcategory 604 does not exist in the taxonomy');
  });

  it('checks states, knock-outs, scale and grading', () => {
    const errors = validateContractDocument('quality', {
      scale: { Gut: 0.7, Bad: 2 },
      grading: { bands: [{ min: 0.8, value: 9 }], maxUncertainty: 0.25 },
      questions: [
        { id: 'a', type: 'select', question: 'a', values: ['x'], states: { y: 0.5 } },
        { id: 'b', type: 'boolean', question: 'b', states: { yes: 1 } },
        { id: 'c', type: 'select', question: 'c', values: ['x'], states: { x: 1 }, knockout: { below: 2 } }
      ]
    });
    const text = errors.join('\n');
    expect(text).toMatch(/scale "Bad" must be a fraction/);
    expect(text).toMatch(/grading band needs/);
    expect(text).toMatch(/state "y" is not one of its values/);
    expect(text).toMatch(/boolean states are "true"\/"false"/);
    expect(text).toMatch(/"knockout" needs fractions/);
  });

  it('flags a scored question whose answers all lack a value (typo guard)', () => {
    const errors = set({
      quality: {
        general: { scale: { Gut: 0.7 }, questions: [] },
        '201': { questions: [{ id: 'k', type: 'select', question: 'k', weight: 2, values: ['Guut', 'Kaput'] }] }
      }
    });
    expect(errors.join('\n')).toMatch(/none of its answers has a value/);
  });

  it('merges the Hauptkategorie group contract into the id check', () => {
    const errors = set({
      quality: {
        general: { questions: [] },
        'group-210': { questions: [{ id: 'part_condition', type: 'select', question: '?', values: ['Gut'] }] },
        '2109': { questions: [{ id: 'part_condition', type: 'select', question: '?', values: ['Gut'] }] }
      }
    });
    expect(errors.join('\n')).toMatch(/"part_condition" is defined in both quality\/group-210.json and quality\/2109.json/);
  });

  describe('Phase 6 fields (askOnCreate, steps, default, refinedBy)', () => {
    const presence = (id: string) => ({ id, type: 'select', question: '?', values: ['Vorhanden', 'Nicht vorhanden', 'Nicht vorgesehen', 'Fest verbaut'] });

    it('accepts a well-formed assembly with steps, defaults and askOnCreate', () => {
      expect(validateContractDocument('assembly', {
        version: 1,
        askOnCreate: ['battery'],
        steps: [{ key: 'bottom', label: 'Akku & Boden' }],
        parts: [
          slot('battery', 2132, { weight: 5, step: 'bottom', question: presence('part_battery') }),
          slot('drive_2', 2130, { weight: 2, default: 'Nicht vorgesehen', question: presence('part_drive_2') })
        ]
      })).toEqual([]);
    });

    it('rejects unknown askOnCreate keys, undeclared or duplicate steps', () => {
      const errors = validateContractDocument('assembly', {
        askOnCreate: ['nope'],
        steps: [{ key: 's', label: 'S' }, { key: 's', label: 'again' }],
        parts: [slot('a', 1, { step: 'missing' })]
      }).join('\n');
      expect(errors).toMatch(/askOnCreate "nope" is not a part key/);
      expect(errors).toMatch(/duplicate step key "s"/);
      expect(errors).toMatch(/step "missing" is not declared/);
    });

    it('rejects a default that is not a value, is "missing", or has no question', () => {
      const errors = validateContractDocument('assembly', {
        parts: [
          slot('a', 1, { default: 'Vielleicht', question: presence('qa') }),
          slot('b', 1, { default: 'Nicht vorhanden', question: presence('qb') }),
          slot('c', 1, { default: 'Vorhanden' })
        ]
      }).join('\n');
      expect(errors).toMatch(/part "a": default "Vielleicht" is not one of/);
      expect(errors).toMatch(/part "b": default must not be a "missing" answer/);
      expect(errors).toMatch(/part "c": "default" needs a presence "question"/);
    });

    it('refinedBy must name weighted slots of the same subcategory and sit on a scored question', () => {
      const errors = set({
        quality: {
          general: { scale: { Gut: 1 }, questions: [] },
          '201': {
            questions: [
              { id: 'chassis', type: 'select', question: '?', values: ['Gut'], weight: 3, refinedBy: ['palmrest', 'fan'] },
              { id: 'note', type: 'text', question: '?', refinedBy: ['palmrest'] }
            ]
          }
        },
        assembly: {
          '201': { parts: [slot('palmrest', 2102, { weight: 6, question: presence('part_palmrest') }), slot('fan', 2118)] }
        }
      }).join('\n');
      expect(errors).toMatch(/refinedBy "fan" is not a weighted slot of assembly\/201.json/);
      expect(errors).not.toMatch(/refinedBy "palmrest" is not/);
      expect(errors).toMatch(/question "note": "refinedBy" only makes sense on a scored question/);
    });
  });
});
