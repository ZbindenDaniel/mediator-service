// Uses the REAL contract files (contracts/assembly/201.json, contracts/specs/201.json) to prove
// the accessory questionnaire and scan-derived specs line up with the canonical spec keys.
import { deriveInstanceSpecsFromScan, normalizeScanComponents, resolveIntakeQuestions, resolveAutoFill } from '../intake-quality-map';
import type { QualityQuestion } from '../../../models/quality-contract';
import { assemblyToQualityContract, buildQualityCheckResponse, loadGeneralContract } from '../quality-contracts';
import { getAssemblyContract, getSpecContract } from '../../contracts/registry';
import type { IntakeScanPayload } from '../../../models/intake';

const laptopScan: IntakeScanPayload = {
  serial: 'PF1ABCDE',
  mac: null,
  vendor: 'HP',
  model: 'EliteBook 840',
  cpu: 'Intel i5-8350U',
  ramMb: 8192,
  disks: [{ name: 'nvme0n1', sizeGb: 256, type: 'nvme', serial: 'S3Z9NX0M12345' }],
  batteryPercent: 87,
};

describe('deriveInstanceSpecsFromScan', () => {
  test('fills the canonical required spec keys from the scan', () => {
    const specs = deriveInstanceSpecsFromScan(laptopScan);
    expect(specs['Prozessor']).toBe('Intel i5-8350U');
    expect(specs['RAM']).toBe('8 GB');
    expect(specs['Speicher']).toBe('256 GB');
    expect(specs['Speichertyp']).toBe('NVMe SSD');
  });

  test('the derived keys cover the spec contract\'s required fields for laptops (201)', () => {
    const specContract = getSpecContract(201);
    expect(specContract).not.toBeNull();
    const requiredKeys = specContract!.fields.filter((f) => f.required).map((f) => f.key);
    const derived = deriveInstanceSpecsFromScan(laptopScan);
    for (const key of requiredKeys) {
      expect(Object.keys(derived)).toContain(key); // Prozessor, RAM, Speicher
    }
  });

  test('omits keys the scan cannot supply', () => {
    expect(deriveInstanceSpecsFromScan({ serial: 'x' } as IntakeScanPayload)).toEqual({});
  });
});

describe('generic component object', () => {
  test('normalizeScanComponents folds the disks shorthand into kind:disk components', () => {
    const comps = normalizeScanComponents({
      disks: [{ name: 'nvme0n1', sizeGb: 256, type: 'nvme', serial: 'SER-A' }],
      components: [{ kind: 'gpu', slotKey: 'gpu', model: 'NVIDIA GT710' }],
    } as any);
    expect(comps).toHaveLength(2);
    const disk = comps.find((c) => c.kind === 'disk');
    expect(disk).toMatchObject({ slotKey: 'nvme0n1', serial: 'SER-A', sizeGb: 256 });
    expect(comps.find((c) => c.kind === 'gpu')).toMatchObject({ slotKey: 'gpu', model: 'NVIDIA GT710' });
  });

  test('a detected serialless component pre-fills its assembly presence + model questions', () => {
    // A future subcategory assembly could carry a "gpu" slot; the image tags a detected card.
    const questions: QualityQuestion[] = [
      { id: 'has_gpu', type: 'boolean', question: 'Grafikkarte vorhanden?' },
      { id: 'gpu_model', type: 'text', question: 'Grafikkarten-Modell?' },
    ];
    const scan = { components: [{ kind: 'gpu', slotKey: 'gpu', model: 'NVIDIA GT710' }] } as any;
    const { ask } = resolveIntakeQuestions(questions, scan);
    expect(ask.find((q) => q.id === 'has_gpu')?.defaultValue).toBe('true');
    expect(ask.find((q) => q.id === 'gpu_model')?.defaultValue).toBe('NVIDIA GT710');
  });
});

describe('contract-declared auto-resolution at intake', () => {
  const scan = {
    cpu: 'Intel i5', ramMb: 8192, batteryPercent: 87,
    disks: [{ name: 'nvme0n1', sizeGb: 250, type: 'nvme', serial: 'X' }],
  } as any;

  test('resolveAutoFill snaps a numeric signal to the question\'s own values', () => {
    const ram: QualityQuestion = { id: 'ram_gb', type: 'select', question: '', values: ['2','4','8','16'], autoFill: 'ram' };
    expect(resolveAutoFill(ram, scan)).toBe('8');
    const storage: QualityQuestion = { id: 'storage_gb', type: 'select', question: '', values: ['128','256','512'], autoFill: 'storageSize' };
    expect(resolveAutoFill(storage, scan)).toBe('256'); // 250 → nearest option
  });

  test('resolveAutoFill maps string signals (battery bucket, drive type) to a valid option', () => {
    const bat: QualityQuestion = { id: 'battery_condition', type: 'select', question: '', values: ['Gut (>80%)','Mittel (50–80%)','Schwach (<50%)'], autoFill: 'battery' };
    expect(resolveAutoFill(bat, scan)).toBe('Gut (>80%)');
    const dt: QualityQuestion = { id: 'drive_type', type: 'select', question: '', values: ['SSD','NVMe SSD','HDD'], autoFill: 'storageType' };
    expect(resolveAutoFill(dt, scan)).toBe('NVMe SSD');
  });

  test('resolveAutoFill returns undefined when the scan lacks the data', () => {
    const bat: QualityQuestion = { id: 'battery_condition', type: 'select', question: '', values: ['Gut (>80%)'], autoFill: 'battery' };
    expect(resolveAutoFill(bat, { cpu: 'x' } as any)).toBeUndefined();
  });

  test('resolveIntakeQuestions auto-answers autoFill + skipAtIntake and asks the rest', () => {
    const questions: QualityQuestion[] = [
      { id: 'condition_optical', type: 'select', question: 'Zustand?', values: ['Gut','Beschädigt'] },
      { id: 'has_fan', type: 'boolean', question: 'Lüfter vorhanden?', skipAtIntake: true },
      { id: 'ram_gb', type: 'select', question: 'RAM?', values: ['4','8','16'], autoFill: 'ram' },
      { id: 'battery_condition', type: 'select', question: 'Akku?', values: ['Gut (>80%)'], autoFill: 'battery' },
    ];
    const { ask, autoAnswers } = resolveIntakeQuestions(questions, scan);
    // Only the human-judgment question remains.
    expect(ask.map((q) => q.id)).toEqual(['condition_optical']);
    expect(autoAnswers).toEqual({ has_fan: 'true', ram_gb: '8', battery_condition: 'Gut (>80%)' });
  });
});

describe('assembly contract as intake questions', () => {
  test('laptop assembly (201) exposes accessory questions incl. presence + spec parts', () => {
    const assembly = getAssemblyContract(201);
    expect(assembly).not.toBeNull();
    const q = assemblyToQualityContract(assembly!);
    const ids = q.questions.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['has_fan', 'has_keyboard', 'keyboard_layout', 'battery_condition', 'ram_gb', 'storage_gb', 'drive_type']));
  });

  test('accessory answers drive both quality (presence) and specs (spec answers)', () => {
    const assembly = assemblyToQualityContract(getAssemblyContract(201)!);
    const general = loadGeneralContract();
    const res = buildQualityCheckResponse(
      general,
      null,
      { has_fan: 'false', ram_gb: '16', keyboard_layout: 'CH' },
      assembly
    );
    // Missing fan forces quality to 1 (Ersatzteil) via qualityImpact.
    expect(res.qualityValue).toBe(1);
    // Spec answers become Spezifikationen entries.
    expect(res.derivedSpecs['RAM']).toBe('16 GB');
    expect(res.derivedSpecs['Tastatur-Layout']).toBe('CH');
  });
});
