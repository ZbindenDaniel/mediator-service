import {
  computeQualityScore,
  scoreToRange,
  gradeFromRange,
  formatQualityScoreRange,
  parseMultiAnswer,
  multiImpact,
  impactToFraction,
  isScoredQuestion,
  DEFAULT_QUALITY_GRADING
} from '../models/quality-score';
import type { AssemblyContract } from '../models/assembly-contract';
import type { QualityContract } from '../models/quality-contract';

const presence = (id: string) => ({
  id,
  type: 'select' as const,
  question: `${id}?`,
  values: ['Vorhanden', 'Nicht vorhanden', 'Nicht vorgesehen', 'Fest verbaut']
});

const laptop: AssemblyContract = {
  version: 1,
  subCategory: 201,
  parts: [
    { key: 'webcam', label: 'Webcam', targetSubcategory: 2109, weight: 3, question: presence('part_webcam') },
    { key: 'hinges', label: 'Scharniere', targetSubcategory: 2108, weight: 4, question: presence('part_hinges') },
    { key: 'keyboard', label: 'Tastatur', targetSubcategory: 2104, weight: 5, question: presence('part_keyboard') },
    { key: 'mainboard', label: 'Mainboard', targetSubcategory: 601, weight: 8, question: presence('part_mainboard') }
  ]
};

const scale = { Neuwertig: 1, Gut: 0.75, Ok: 0.5, Kaputt: 0, 'Nicht zutreffend': null };
const general: QualityContract = { version: 1, scale, questions: [] };

describe('computeQualityScore', () => {
  it('reproduces the worked example: 20 total, 12 certain, 17 possible → 60–85 %', () => {
    // The unchecked keyboard is a device question here: unanswered questions are uncertainty,
    // while an unassessed slot no longer counts (next test).
    const keyboardQuestion: QualityContract = {
      version: 1,
      questions: [{ id: 'keyboard_condition', type: 'select', question: 'Tastatur?', weight: 5, values: ['Gut', 'Kaputt'], states: { Gut: 1, Kaputt: 0 } }]
    };
    const score = computeQualityScore({
      contracts: [keyboardQuestion],
      answers: {},
      assembly: { ...laptop, parts: laptop.parts.filter((p) => p.key !== 'keyboard') },
      children: [
        { slotKey: 'webcam', inDevice: true, score: { min: 1, max: 1 } },
        { slotKey: 'hinges', inDevice: true, score: { min: 0.75, max: 0.75 } },
        { slotKey: 'mainboard', inDevice: true, score: { min: 0.75, max: 0.75 } }
      ]
    });
    expect(score).toEqual({ total: 20, certain: 12, possible: 17, cap: null });
    expect(formatQualityScoreRange(scoreToRange(score))).toBe('60–85 %');
  });

  it('propagates a child range (uncertainty) into the parent', () => {
    const score = computeQualityScore({
      contracts: [],
      answers: {},
      assembly: { ...laptop, parts: [laptop.parts[0]] },
      children: [{ slotKey: 'webcam', inDevice: true, score: { min: 0.5, max: 0.9 } }]
    });
    expect(score.certain).toBeCloseTo(1.5);
    expect(score.possible).toBeCloseTo(2.7);
  });

  it('counts missing and removed parts as 0, excludes not-applicable and integrated parts', () => {
    const score = computeQualityScore({
      contracts: [],
      answers: { part_webcam: 'Nicht vorhanden', part_keyboard: 'Fest verbaut', part_mainboard: 'Nicht vorgesehen' },
      assembly: laptop,
      children: [{ slotKey: 'hinges', inDevice: false, score: { min: 1, max: 1 } }]
    });
    expect(score).toEqual({ total: 7, certain: 0, possible: 0, cap: null });
  });

  it('leaves out slots nobody looked at: unanswered, present without an assessed part, unassessed child', () => {
    const score = computeQualityScore({
      contracts: [],
      answers: { part_keyboard: 'Vorhanden' },
      assembly: laptop,
      children: [{ slotKey: 'webcam', inDevice: true, score: null }]
    });
    expect(score).toEqual({ total: 0, certain: 0, possible: 0, cap: null });
    expect(scoreToRange(score)).toBeNull();
  });

  it('a multipleAllowed slot averages only its assessed instances', () => {
    const score = computeQualityScore({
      contracts: [],
      answers: {},
      assembly: { ...laptop, parts: [{ ...laptop.parts[3], key: 'ram', multipleAllowed: true }] },
      children: [
        { slotKey: 'ram', inDevice: true, score: { min: 0.5, max: 0.5 } },
        { slotKey: 'ram', inDevice: true, score: null }
      ]
    });
    expect(score).toEqual({ total: 8, certain: 4, possible: 4, cap: null });
  });

  describe('refinedBy (S1): parts replace the device question they cover', () => {
    const chassis: QualityContract = {
      version: 1,
      questions: [{
        id: 'chassis_condition', type: 'select', question: 'Gehäuse?', weight: 4,
        values: ['Gut', 'Kaputt'], states: { Gut: 1, Kaputt: 0 }, refinedBy: ['webcam', 'hinges']
      }]
    };
    const assembly: AssemblyContract = { ...laptop, parts: laptop.parts.slice(0, 2) };
    const run = (answers: Record<string, string>, children: Array<{ slotKey: string; inDevice: boolean; score: { min: number; max: number } | null }>) =>
      computeQualityScore({ contracts: [chassis], answers: { chassis_condition: 'Gut', ...answers }, assembly, children });

    it('keeps the device question while one covered part is still open', () => {
      expect(run({}, [{ slotKey: 'webcam', inDevice: true, score: { min: 0.5, max: 0.5 } }]))
        .toEqual({ total: 4 + 3, certain: 4 + 1.5, possible: 4 + 1.5, cap: null });
    });

    it('drops it once every covered slot is assessed, removed or missing', () => {
      expect(run({ part_hinges: 'Nicht vorhanden' }, [{ slotKey: 'webcam', inDevice: true, score: { min: 0.5, max: 0.5 } }]))
        .toEqual({ total: 3 + 4, certain: 1.5, possible: 1.5, cap: null });
      expect(run({}, [
        { slotKey: 'webcam', inDevice: false, score: { min: 1, max: 1 } },
        { slotKey: 'hinges', inDevice: true, score: { min: 1, max: 1 } }
      ])).toEqual({ total: 3 + 4, certain: 4, possible: 4, cap: null });
    });

    it('keeps it when a covered slot is built in or not applicable (judged on the device)', () => {
      expect(run({ part_hinges: 'Fest verbaut' }, [{ slotKey: 'webcam', inDevice: true, score: { min: 1, max: 1 } }]))
        .toEqual({ total: 4 + 3, certain: 4 + 3, possible: 4 + 3, cap: null });
    });
  });

  it('averages the instances of a multipleAllowed slot', () => {
    const score = computeQualityScore({
      contracts: [],
      answers: {},
      assembly: { ...laptop, parts: [{ ...laptop.parts[3], key: 'ram', multipleAllowed: true }] },
      children: [
        { slotKey: 'ram', inDevice: true, score: { min: 1, max: 1 } },
        { slotKey: 'ram', inDevice: true, score: { min: 0, max: 0 } }
      ]
    });
    expect(score).toEqual({ total: 8, certain: 4, possible: 4, cap: null });
  });

  it('scores answers through the contract scale, per-question states override it, null excludes', () => {
    const contract: QualityContract = {
      version: 1,
      questions: [
        { id: 'keyboard', type: 'select', question: 'Tastatur?', weight: 4, values: ['Gut', 'Ok', 'Kaputt', 'Ungetestet'] },
        { id: 'battery', type: 'select', question: 'Akku?', weight: 2, values: ['>80%', '<50%', 'Nicht zutreffend'], states: { '>80%': 1, '<50%': 0.25 } },
        { id: 'swollen', type: 'boolean', question: 'Aufgebläht?', weight: 2, states: { true: 0, false: 1 } },
        { id: 'na', type: 'select', question: 'NA?', weight: 9, values: ['Nicht zutreffend'], states: { 'Nicht zutreffend': null } }
      ]
    };
    const score = computeQualityScore({
      contracts: [general, contract],
      answers: { keyboard: 'Gut', battery: '<50%', swollen: 'false', na: 'Nicht zutreffend' }
    });
    expect(score).toEqual({ total: 8, certain: 3 + 0.5 + 2, possible: 3 + 0.5 + 2, cap: null });
    // "Ungetestet" has no value anywhere → uncertainty
    const untested = computeQualityScore({ contracts: [general, contract], answers: { keyboard: 'Ungetestet', battery: '>80%', swollen: 'false', na: 'Nicht zutreffend' } });
    expect(untested.possible - untested.certain).toBe(4);
  });

  it('only questions with scoring info take part; weight defaults to 1', () => {
    const spec = { id: 'ram', type: 'select' as const, question: 'RAM?', values: ['8', '16'] };
    const legacy = { id: 'os', type: 'boolean' as const, question: 'OS?', qualityImpact: { true: 5, false: 4 } as Record<'true' | 'false', number> };
    expect(isScoredQuestion(spec)).toBe(false);
    expect(isScoredQuestion(legacy)).toBe(true);
    const score = computeQualityScore({ contracts: [{ version: 1, questions: [spec, legacy] }], answers: { ram: '8', os: 'false' } });
    expect(score).toEqual({ total: 1, certain: 0.75, possible: 0.75, cap: null });
  });

  it('knock-out caps the whole item only when the component is certainly below its threshold', () => {
    const contract: QualityContract = {
      version: 1,
      questions: [
        { id: 'swollen', type: 'boolean', question: 'Aufgebläht?', weight: 1, states: { true: 0, false: 1 }, knockout: { below: 0.5, cap: 0.19 } },
        { id: 'scratches', type: 'select', question: 'Kratzer?', weight: 9, values: ['Gut'] }
      ]
    };
    const swollen = scoreToRange(computeQualityScore({ contracts: [general, contract], answers: { swollen: 'true', scratches: 'Gut' } }));
    expect(swollen).toEqual({ min: 0.19, max: 0.19 });
    expect(gradeFromRange(swollen)).toBe(1);
    // unanswered: uncertainty only, no cap
    const open = computeQualityScore({ contracts: [general, contract], answers: { scratches: 'Gut' } });
    expect(open.cap).toBeNull();
  });

  it('applies a slot knock-out to a missing or broken part', () => {
    const parts = [{ ...laptop.parts[3], knockout: { below: 0.5, cap: 0.19 } }, laptop.parts[0]];
    const missing = computeQualityScore({ contracts: [], answers: { part_mainboard: 'Nicht vorhanden' }, assembly: { ...laptop, parts } });
    expect(missing.cap).toBe(0.19);
    const broken = computeQualityScore({
      contracts: [], answers: {}, assembly: { ...laptop, parts },
      children: [{ slotKey: 'mainboard', inDevice: true, score: { min: 0.1, max: 0.3 } }]
    });
    expect(broken.cap).toBe(0.19);
    const maybe = computeQualityScore({
      contracts: [], answers: {}, assembly: { ...laptop, parts },
      children: [{ slotKey: 'mainboard', inDevice: true, score: { min: 0.1, max: 0.9 } }]
    });
    expect(maybe.cap).toBeNull();
  });

  it('scores an unweighted slot question like any question (refurbishment presence booleans)', () => {
    const assembly: AssemblyContract = {
      version: 1, subCategory: 201,
      parts: [{ key: 'fan', label: 'Lüfter', targetSubcategory: 202, question: { id: 'has_fan', type: 'boolean', question: '?', states: { true: 1, false: 0 }, knockout: { below: 0.5, cap: 0.19 } } }]
    };
    const synthetic: QualityContract = { version: 1, questions: [assembly.parts[0].question!] };
    const score = computeQualityScore({ contracts: [synthetic], answers: { has_fan: 'false' }, assembly });
    expect(score).toEqual({ total: 1, certain: 0, possible: 0, cap: 0.19 });
  });

  it('skips questions hidden by showIf and does not count a question id twice', () => {
    const q = { id: 'x', type: 'boolean' as const, question: 'x', weight: 1, states: { true: 1, false: 0 } };
    const hidden = { ...q, id: 'y', showIf: { questionId: 'x', value: 'false' } };
    const score = computeQualityScore({ contracts: [{ version: 1, questions: [q, hidden] }, { version: 1, questions: [q] }], answers: { x: 'true' } });
    expect(score).toEqual({ total: 1, certain: 1, possible: 1, cap: null });
  });

  it('scores a multi question by count thresholds; "[]" is checked-and-fine, absent is unchecked', () => {
    const multi = { id: 'missing_keys', type: 'multi' as const, question: 'Fehlende Tasten?', weight: 4, states: { '1': 0.75, '3': 0.5 } };
    const run = (answer?: string) => computeQualityScore({ contracts: [{ version: 1, questions: [multi] }], answers: answer === undefined ? {} : { missing_keys: answer } });
    expect(run('[]')).toEqual({ total: 4, certain: 4, possible: 4, cap: null });
    expect(run('["F5"]')).toEqual({ total: 4, certain: 3, possible: 3, cap: null });
    expect(run('["F5",",","Ä"]')).toEqual({ total: 4, certain: 2, possible: 2, cap: null });
    expect(run()).toEqual({ total: 4, certain: 0, possible: 4, cap: null });
  });

  it('returns no range when nothing is scored', () => {
    expect(scoreToRange(computeQualityScore({ contracts: [], answers: {} }))).toBeNull();
    expect(formatQualityScoreRange(null)).toBe('–');
  });
});

describe('gradeFromRange (pessimistic, U3/U4)', () => {
  it('grades by the lower bound', () => {
    expect(gradeFromRange({ min: 0.85, max: 0.9 })).toBe(5);
    expect(gradeFromRange({ min: 0.6, max: 0.8 })).toBe(4);
    expect(gradeFromRange({ min: 0.45, max: 0.5 })).toBe(3);
    expect(gradeFromRange({ min: 0.2, max: 0.2 })).toBe(2);
    expect(gradeFromRange({ min: 0.05, max: 0.1 })).toBe(1);
  });

  it('gives no grade when the range is wider than maxUncertainty', () => {
    expect(gradeFromRange({ min: 0.6, max: 0.85 })).toBe(4); // exactly 0.25 wide
    expect(gradeFromRange({ min: 0.6, max: 0.86 })).toBeNull();
    expect(gradeFromRange(null)).toBeNull();
    expect(gradeFromRange({ min: 0, max: 1 }, { ...DEFAULT_QUALITY_GRADING, maxUncertainty: 1 })).toBe(1);
  });
});

describe('helpers', () => {
  it('parseMultiAnswer keeps commas as values and tolerates non-JSON', () => {
    expect(parseMultiAnswer('[",","Ä"]')).toEqual([',', 'Ä']);
    expect(parseMultiAnswer('F5')).toEqual(['F5']);
    expect(parseMultiAnswer('')).toBeUndefined();
  });

  it('multiImpact picks the highest threshold ≤ count, 5 below the lowest', () => {
    expect(multiImpact({ '1': 4, '3': 3 }, 0)).toBe(5);
    expect(multiImpact({ '1': 4, '3': 3 }, 2)).toBe(4);
    expect(multiImpact({ '1': 4, '3': 3 }, 7)).toBe(3);
    expect(multiImpact(undefined, 2)).toBeUndefined();
  });

  it('impactToFraction maps legacy 1 → 0 and 5 → 1', () => {
    expect(impactToFraction(1)).toBe(0);
    expect(impactToFraction(3)).toBe(0.5);
    expect(impactToFraction(5)).toBe(1);
  });
});
