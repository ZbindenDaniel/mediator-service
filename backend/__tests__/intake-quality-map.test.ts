import { resolveIntakeQuestions } from '../lib/intake-quality-map';
import type { QualityQuestion } from '../../models/quality-contract';
import type { IntakeScanPayload } from '../../models/intake';

function makeScan(overrides: Partial<IntakeScanPayload> = {}): IntakeScanPayload {
  return { serial: 'SN123', mac: null, cpu: null, ramMb: null, disks: null, batteryPercent: null, ...overrides };
}

describe('resolveIntakeQuestions — ask vs. auto-answer', () => {
  it('asks a plain question and passes through values/suggestions/specField/showIf', () => {
    const q = {
      id: 'cosmetic', type: 'select', question: 'Zustand?', values: ['A', 'B'],
      specField: 'cosmetic_grade', showIf: { questionId: 'other', value: 'yes' },
    } as QualityQuestion;
    (q as any).suggestions = ['hint'];
    const { ask, autoAnswers } = resolveIntakeQuestions([q], makeScan());
    expect(ask).toHaveLength(1);
    expect(ask[0].values).toEqual(['A', 'B']);
    expect(ask[0].specField).toBe('cosmetic_grade');
    expect(ask[0].showIf).toEqual({ questionId: 'other', value: 'yes' });
    expect(ask[0].suggestions).toEqual(['hint']);
    expect(ask[0].defaultValue).toBeUndefined();
    expect(autoAnswers).toEqual({});
  });

  it('auto-answers an autoFill question from the scan (snapped to its values) and drops it', () => {
    const q: QualityQuestion = { id: 'ram_gb', type: 'select', question: 'RAM?', values: ['4', '8', '16'], autoFill: 'ram' };
    const { ask, autoAnswers } = resolveIntakeQuestions([q], makeScan({ ramMb: 8192 }));
    expect(ask).toHaveLength(0);
    expect(autoAnswers).toEqual({ ram_gb: '8' });
  });

  it('asks an autoFill question when the scan lacks the data', () => {
    const q: QualityQuestion = { id: 'ram_gb', type: 'select', question: 'RAM?', values: ['4', '8'], autoFill: 'ram' };
    const { ask, autoAnswers } = resolveIntakeQuestions([q], makeScan({ ramMb: null }));
    expect(ask.map((x) => x.id)).toEqual(['ram_gb']);
    expect(autoAnswers).toEqual({});
  });

  it('maps a string signal to a valid option (drive type)', () => {
    const q: QualityQuestion = { id: 'drive_type', type: 'select', question: 'Typ?', values: ['SSD', 'NVMe SSD', 'HDD'], autoFill: 'storageType' };
    const scan = makeScan({ disks: [{ name: 'nvme0n1', sizeGb: 256, type: 'nvme' }] });
    expect(resolveIntakeQuestions([q], scan).autoAnswers).toEqual({ drive_type: 'NVMe SSD' });
  });

  it('skipAtIntake booleans are assumed present and dropped', () => {
    const q: QualityQuestion = { id: 'has_fan', type: 'boolean', question: 'Lüfter?', skipAtIntake: true };
    const { ask, autoAnswers } = resolveIntakeQuestions([q], makeScan());
    expect(ask).toHaveLength(0);
    expect(autoAnswers).toEqual({ has_fan: 'true' });
  });

  it('resolves showIf against an auto-answered controller (keeps dependent when met)', () => {
    const questions: QualityQuestion[] = [
      { id: 'has_fan', type: 'boolean', question: 'Lüfter?', skipAtIntake: true }, // auto → "true"
      { id: 'fan_rpm', type: 'text', question: 'Lüfter-Drehzahl?', showIf: { questionId: 'has_fan', value: 'true' } },
    ];
    const { ask, autoAnswers } = resolveIntakeQuestions(questions, makeScan());
    expect(autoAnswers).toEqual({ has_fan: 'true' });
    const dep = ask.find((q) => q.id === 'fan_rpm');
    expect(dep).toBeDefined();          // condition met → still asked
    expect(dep!.showIf).toBeUndefined(); // showIf stripped (controller isn't shown to the script)
  });

  it('drops a showIf dependent when its auto-answered controller does not meet the condition', () => {
    const questions: QualityQuestion[] = [
      { id: 'has_fan', type: 'boolean', question: 'Lüfter?', skipAtIntake: true }, // auto → "true"
      { id: 'why_no_fan', type: 'text', question: 'Warum kein Lüfter?', showIf: { questionId: 'has_fan', value: 'false' } },
    ];
    const { ask } = resolveIntakeQuestions(questions, makeScan());
    expect(ask.find((q) => q.id === 'why_no_fan')).toBeUndefined();
  });

  it('a detected component pre-fills a kept presence question by slot convention', () => {
    const q: QualityQuestion = { id: 'has_gpu', type: 'boolean', question: 'GPU?' };
    const scan = makeScan({ components: [{ kind: 'gpu', slotKey: 'gpu', model: 'GT710' }] });
    const { ask } = resolveIntakeQuestions([q], scan);
    expect(ask[0].defaultValue).toBe('true'); // asked, but pre-answered for confirmation
  });

  it('reports scan-answered autoFill questions as `detected`, rendered via specValue', () => {
    const questions: QualityQuestion[] = [
      { id: 'ram_gb', type: 'select', question: 'RAM?', values: ['4', '8', '16'], autoFill: 'ram', specField: 'RAM', specValue: '%v GB' },
      { id: 'drive_type', type: 'select', question: 'Typ?', values: ['SSD', 'NVMe SSD'], autoFill: 'storageType', specField: 'Speichertyp', specValue: '%v' },
    ];
    const scan = makeScan({ ramMb: 8192, disks: [{ name: 'nvme0n1', sizeGb: 256, type: 'nvme' }] });
    const { ask, detected } = resolveIntakeQuestions(questions, scan);
    expect(ask).toHaveLength(0);
    expect(detected).toEqual([
      { id: 'ram_gb', label: 'RAM', value: '8 GB' },
      { id: 'drive_type', label: 'Speichertyp', value: 'NVMe SSD' },
    ]);
  });

  it('flags an autoFill question the scan could not answer in `unresolvedAutoFill` (NVMe size=0 mis-scan)', () => {
    // smartctl-sourced size is 0 for NVMe → storageSize signal returns null → still asked. This is
    // the exact production symptom: the field is scan-answerable but the scan did not carry it.
    const q: QualityQuestion = { id: 'storage_gb', type: 'select', question: 'Speicher?', values: ['128', '256', '512'], autoFill: 'storageSize', specField: 'Speicher', specValue: '%v GB' };
    const scan = makeScan({ disks: [{ name: 'nvme0n1', sizeGb: 0, type: 'nvme' }] });
    const { ask, detected, unresolvedAutoFill } = resolveIntakeQuestions([q], scan);
    expect(ask.map((x) => x.id)).toEqual(['storage_gb']);
    expect(detected).toEqual([]);
    expect(unresolvedAutoFill).toEqual([{ id: 'storage_gb', autoFill: 'storageSize' }]);
  });
});
