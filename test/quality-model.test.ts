import {
  deriveAiPriorityFromAssessment
} from '../models/quality';

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
