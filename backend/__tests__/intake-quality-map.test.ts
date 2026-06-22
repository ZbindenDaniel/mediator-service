import { preFillQualityQuestions } from '../lib/intake-quality-map';
import type { QualityQuestion } from '../../models/quality-contract';
import type { IntakeScanPayload } from '../../models/intake';

function makeQuestion(overrides: Partial<QualityQuestion> = {}): QualityQuestion {
  return {
    id: 'test_q',
    type: 'select',
    question: 'Test question?',
    ...overrides,
  } as QualityQuestion;
}

function makeScan(overrides: Partial<IntakeScanPayload> = {}): IntakeScanPayload {
  return {
    serial: 'SN123',
    mac: null,
    vendor: null,
    model: null,
    cpu: null,
    ramMb: null,
    disks: null,
    batteryPercent: null,
    ...overrides,
  };
}

describe('preFillQualityQuestions', () => {
  it('returns question without defaultValue when no mapper for field', () => {
    const questions = [makeQuestion({ id: 'unknown_field', specField: 'unknown_field' })];
    const result = preFillQualityQuestions(questions, makeScan());
    expect(result[0].defaultValue).toBeUndefined();
  });

  it('pre-fills drive_type as NVMe SSD from nvme disk', () => {
    const questions = [makeQuestion({ id: 'drive_type' })];
    const scan = makeScan({ disks: [{ name: 'nvme0n1', sizeGb: 256, type: 'nvme' }] });
    const result = preFillQualityQuestions(questions, scan);
    expect(result[0].defaultValue).toBe('NVMe SSD');
  });

  it('pre-fills drive_type as SSD from ssd disk', () => {
    const questions = [makeQuestion({ id: 'drive_type' })];
    const scan = makeScan({ disks: [{ name: 'sda', sizeGb: 500, type: 'ssd' }] });
    const result = preFillQualityQuestions(questions, scan);
    expect(result[0].defaultValue).toBe('SSD');
  });

  it('pre-fills drive_type as HDD from hdd disk', () => {
    const questions = [makeQuestion({ id: 'drive_type' })];
    const scan = makeScan({ disks: [{ name: 'sda', sizeGb: 1000, type: 'HDD' }] });
    const result = preFillQualityQuestions(questions, scan);
    expect(result[0].defaultValue).toBe('HDD');
  });

  it('pre-fills drive_type as eMMC from emmc disk', () => {
    const questions = [makeQuestion({ id: 'drive_type' })];
    const scan = makeScan({ disks: [{ name: 'mmcblk0', sizeGb: 32, type: 'eMMC' }] });
    const result = preFillQualityQuestions(questions, scan);
    expect(result[0].defaultValue).toBe('eMMC');
  });

  it('leaves defaultValue undefined when disk is absent', () => {
    const questions = [makeQuestion({ id: 'drive_type' })];
    const scan = makeScan({ disks: null });
    const result = preFillQualityQuestions(questions, scan);
    expect(result[0].defaultValue).toBeUndefined();
  });

  it('leaves defaultValue undefined when disk type is unrecognized', () => {
    const questions = [makeQuestion({ id: 'drive_type' })];
    const scan = makeScan({ disks: [{ name: 'unknown', sizeGb: 128, type: 'scsi' }] });
    const result = preFillQualityQuestions(questions, scan);
    expect(result[0].defaultValue).toBeUndefined();
  });

  it('copies values, suggestions, specField, showIf from source question', () => {
    const q = makeQuestion({
      id: 'cosmetic',
      values: ['A', 'B'],
      specField: 'cosmetic_grade',
      showIf: { questionId: 'other', value: 'yes' },
    });
    (q as any).suggestions = ['hint'];
    const result = preFillQualityQuestions([q], makeScan());
    expect(result[0].values).toEqual(['A', 'B']);
    expect(result[0].specField).toBe('cosmetic_grade');
    expect(result[0].showIf).toEqual({ questionId: 'other', value: 'yes' });
    expect(result[0].suggestions).toEqual(['hint']);
  });

  it('maps multiple questions independently', () => {
    const questions = [
      makeQuestion({ id: 'drive_type' }),
      makeQuestion({ id: 'cosmetic' }),
    ];
    const scan = makeScan({ disks: [{ name: 'nvme0', sizeGb: 512, type: 'NVMe' }] });
    const result = preFillQualityQuestions(questions, scan);
    expect(result[0].defaultValue).toBe('NVMe SSD');
    expect(result[1].defaultValue).toBeUndefined();
  });
});
