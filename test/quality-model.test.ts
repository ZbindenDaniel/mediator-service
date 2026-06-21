import {
  deriveQualityTagFromCondition,
  deriveAiPriorityFromAssessment
} from '../models/quality';

describe('deriveQualityTagFromCondition', () => {
  it('returns Ersatzteil (1) when item is not functional', () => {
    const result = deriveQualityTagFromCondition({ is_functional: false, has_defects: null, is_complete: null });
    expect(result).toEqual({ tag: 'Ersatzteil', value: 1 });
  });

  it('returns Upcycling (2) when defective AND incomplete', () => {
    const result = deriveQualityTagFromCondition({ is_functional: true, has_defects: true, is_complete: false });
    expect(result).toEqual({ tag: 'Upcycling', value: 2 });
  });

  it('returns Ok (3) when defective but complete', () => {
    const result = deriveQualityTagFromCondition({ is_functional: true, has_defects: true, is_complete: true });
    expect(result).toEqual({ tag: 'Ok', value: 3 });
  });

  it('returns Ok (3) when functional and defect-free but incomplete', () => {
    const result = deriveQualityTagFromCondition({ is_functional: true, has_defects: false, is_complete: false });
    expect(result).toEqual({ tag: 'Ok', value: 3 });
  });

  it('returns Gut (4) when fully positive', () => {
    const result = deriveQualityTagFromCondition({ is_functional: true, has_defects: false, is_complete: true });
    expect(result).toEqual({ tag: 'Gut', value: 4 });
  });

  it('returns Gut (4) when all answers are null (unknown)', () => {
    // null is_functional does not trigger Ersatzteil; null defects/complete do not trigger lower tags
    const result = deriveQualityTagFromCondition({ is_functional: null, has_defects: null, is_complete: null });
    expect(result).toEqual({ tag: 'Gut', value: 4 });
  });

  it('functional check takes priority — not-functional beats defective+incomplete', () => {
    const result = deriveQualityTagFromCondition({ is_functional: false, has_defects: true, is_complete: false });
    expect(result.tag).toBe('Ersatzteil');
  });
});

describe('deriveAiPriorityFromAssessment', () => {
  it('maps quality 4 (Gut) to high', () => {
    expect(deriveAiPriorityFromAssessment(4)).toBe('high');
  });

  it('maps quality 5 (Neuwertig) to high', () => {
    expect(deriveAiPriorityFromAssessment(5)).toBe('high');
  });

  it('maps quality 3 (Ok) to normal', () => {
    expect(deriveAiPriorityFromAssessment(3)).toBe('normal');
  });

  it('maps quality 2 (Upcycling) to low', () => {
    expect(deriveAiPriorityFromAssessment(2)).toBe('low');
  });

  it('maps quality 1 (Ersatzteil) to low', () => {
    expect(deriveAiPriorityFromAssessment(1)).toBe('low');
  });
});
