import { lockedSpecsFromAnswers } from '../backend/lib/quality-contracts';
import type { QualityContract } from '../models/quality-contract';

const device: QualityContract = {
  version: 1,
  questions: [
    { id: 'case_condition', type: 'select', question: 'Gehäuse?', values: ['Gut', 'Beschädigt'], specField: 'Gehäuse-Zustand', specValue: '%v', refinedBy: ['palmrest'] },
    { id: 'screen_condition', type: 'select', question: 'Display?', values: ['Einwandfrei', 'Kratzer'], specField: 'Display-Zustand', specValue: '%v', refinedBy: ['display_assembly'] },
    { id: 'battery_wear', type: 'select', question: 'Akku?', values: ['Gut'], specField: 'Akku' }
  ]
};
const answers = { case_condition: 'Beschädigt', screen_condition: 'Kratzer', battery_wear: 'Gut' };

describe('lockedSpecsFromAnswers', () => {
  it('returns only the spec lines of locked questions', () => {
    expect(lockedSpecsFromAnswers([device], answers, new Set(['case_condition']))).toEqual({ 'Gehäuse-Zustand': 'Beschädigt' });
  });

  it('returns nothing when no question is locked', () => {
    expect(lockedSpecsFromAnswers([device], answers, new Set())).toEqual({});
  });

  it('keeps a spec field an open question still renders', () => {
    const shared: QualityContract = {
      version: 1,
      questions: [{ id: 'case_condition_v2', type: 'select', question: 'Gehäuse?', values: ['Gut'], specField: 'Gehäuse-Zustand' }]
    };
    const result = lockedSpecsFromAnswers([device, shared], { ...answers, case_condition_v2: 'Gut' }, new Set(['case_condition']));
    expect(result).toEqual({});
  });
});
