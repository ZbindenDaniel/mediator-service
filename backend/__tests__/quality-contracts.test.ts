import {
  assemblyToQualityContract,
  deriveQualityFromAnswers,
  deriveSpecsFromAnswers,
  buildQualityCheckResponse,
} from '../lib/quality-contracts';
import type { QualityContract } from '../../models/quality-contract';
import type { AssemblyContract } from '../../models/assembly-contract';

const generalContract: QualityContract = {
  version: 1,
  subCategory: 0,
  questions: [
    {
      id: 'lieferumfang',
      type: 'select',
      question: 'Lieferumfang?',
      values: ['Vollständig', 'Netzteil fehlt'],
      qualityImpact: { 'Vollständig': 5, 'Netzteil fehlt': 4 },
    },
  ],
};

const subCatContract: QualityContract = {
  version: 4,
  subCategory: 201,
  questions: [
    {
      id: 'keyboard_layout',
      type: 'select',
      question: 'Tastatur-Layout?',
      values: ['CH', 'DE', 'US'],
      specField: 'Tastatur-Layout',
      specValue: '%v',
    },
    {
      id: 'has_os',
      type: 'boolean',
      question: 'Betriebssystem installiert?',
      qualityImpact: { 'true': 5, 'false': 4 },
    },
    {
      id: 'os_installed',
      type: 'text',
      question: 'Welches Betriebssystem?',
      specField: 'Betriebssystem',
      specValue: '%v',
      showIf: { questionId: 'has_os', value: 'true' },
    },
  ],
};

const assemblyContract: AssemblyContract = {
  version: 1,
  subCategory: 201,
  parts: [
    {
      key: 'fan',
      label: 'Lüfter',
      targetSubcategory: 202,
      question: {
        id: 'has_fan',
        type: 'boolean',
        question: 'Lüfter vorhanden?',
        qualityImpact: { 'false': 1 },
      },
    },
    {
      key: 'battery',
      label: 'Akku',
      targetSubcategory: 206,
      question: {
        id: 'battery_condition',
        type: 'select',
        question: 'Akkuzustand?',
        values: ['Gut (>80%)', 'Nicht vorhanden'],
        qualityImpact: { 'Gut (>80%)': 5, 'Nicht vorhanden': 1 },
        specField: 'Akku',
        specValue: '%v',
      },
    },
    {
      key: 'ram',
      label: 'Arbeitsspeicher',
      targetSubcategory: 603,
      question: {
        id: 'ram_gb',
        type: 'select',
        question: 'Wie viel RAM ist verbaut?',
        values: ['8', '16', '32'],
        specField: 'RAM',
        specValue: '%v GB',
      },
    },
    {
      key: 'mainboard',
      label: 'Mainboard',
      targetSubcategory: 601,
      // no qualityQuestion — should be skipped
    },
  ],
};

describe('assemblyToQualityContract', () => {
  it('extracts question from parts that have one', () => {
    const qc = assemblyToQualityContract(assemblyContract);
    expect(qc.questions).toHaveLength(3); // fan, battery, ram — mainboard skipped
    expect(qc.questions.map(q => q.id)).toEqual(['has_fan', 'battery_condition', 'ram_gb']);
  });

  it('preserves version and subCategory', () => {
    const qc = assemblyToQualityContract(assemblyContract);
    expect(qc.version).toBe(1);
    expect(qc.subCategory).toBe(201);
  });

  it('returns empty questions array when no parts have question', () => {
    const dc: AssemblyContract = {
      version: 1,
      subCategory: 999,
      parts: [
        { key: 'board', label: 'Board', targetSubcategory: 601 },
      ],
    };
    const qc = assemblyToQualityContract(dc);
    expect(qc.questions).toHaveLength(0);
  });
});

describe('deriveQualityFromAnswers (unified percentage model)', () => {
  it('returns default value (3) and no range when nothing is scored', () => {
    const specOnly: QualityContract = { version: 1, questions: [{ id: 'keyboard_layout', type: 'select', question: '?', values: ['CH'] }] };
    const result = deriveQualityFromAnswers([specOnly], { keyboard_layout: 'CH' });
    expect(result.value).toBe(3);
    expect(result.range).toBeNull();
  });

  it('is pessimistic: unanswered scored questions pull the lower bound down', () => {
    const result = deriveQualityFromAnswers([generalContract], {});
    expect(result.range).toEqual({ min: 0, max: 1 });
    expect(result.value).toBe(1);
  });

  it('a knock-out answer caps the grade (missing fan → Ersatzteil)', () => {
    const contract: QualityContract = {
      version: 1,
      questions: [
        { id: 'lieferumfang', type: 'select', question: '?', values: ['Vollständig'], weight: 9, states: { 'Vollständig': 1 } },
        { id: 'has_fan', type: 'boolean', question: '?', weight: 1, states: { true: 1, false: 0 }, knockout: { below: 0.25, cap: 0.19 } }
      ]
    };
    const { value, range } = deriveQualityFromAnswers([contract], { lieferumfang: 'Vollständig', has_fan: 'false' });
    expect(range).toEqual({ min: 0.19, max: 0.19 });
    expect(value).toBe(1);
  });

  it('weighs instead of taking the worst answer', () => {
    const answers = { lieferumfang: 'Vollständig', has_os: 'false' }; // legacy impacts 5 and 4 → fractions 1 and 0.75
    const { value, range } = deriveQualityFromAnswers([generalContract, { ...subCatContract, questions: subCatContract.questions.filter((q) => q.id === 'has_os') }], answers);
    expect(range).toEqual({ min: 0.875, max: 0.875 });
    expect(value).toBe(5);
  });

  it('skips questions hidden by showIf', () => {
    const answers = { has_os: 'true', os_installed: 'Ubuntu' };
    const onlyOs: QualityContract = { ...subCatContract, questions: subCatContract.questions.filter((q) => q.id === 'has_os' || q.id === 'os_installed') };
    const { range } = deriveQualityFromAnswers([onlyOs], answers);
    expect(range).toEqual({ min: 1, max: 1 });
  });
});

describe('deriveSpecsFromAnswers', () => {
  it('renders specValue template with answer', () => {
    const answers = { ram_gb: '16' };
    const assemblyQc = assemblyToQualityContract(assemblyContract);
    const specs = deriveSpecsFromAnswers([assemblyQc], answers);
    expect(specs['RAM']).toBe('16 GB');
  });

  it('skips questions with no specField', () => {
    const answers = { has_fan: 'true', lieferumfang: 'Vollständig' };
    const assemblyQc = assemblyToQualityContract(assemblyContract);
    const specs = deriveSpecsFromAnswers([generalContract, assemblyQc], answers);
    // has_fan and lieferumfang have no specField
    expect(Object.keys(specs)).not.toContain('has_fan');
    expect(Object.keys(specs)).not.toContain('Lieferumfang');
  });

  it('skips unanswered questions', () => {
    const specs = deriveSpecsFromAnswers([subCatContract], {});
    expect(Object.keys(specs)).toHaveLength(0);
  });

  it('treats an empty ("don\'t know") answer as unanswered — no junk spec', () => {
    const assemblyQc = assemblyToQualityContract(assemblyContract);
    const specs = deriveSpecsFromAnswers([assemblyQc], { ram_gb: '' });
    // Must NOT render "%v GB" as " GB" — the skipped question yields no spec at all.
    expect(specs['RAM']).toBeUndefined();
  });

  it('respects showIf: omits spec for hidden question', () => {
    // os_installed is hidden when has_os=false
    const answers = { has_os: 'false', os_installed: 'Ubuntu' };
    const specs = deriveSpecsFromAnswers([subCatContract], answers);
    expect(specs['Betriebssystem']).toBeUndefined();
  });

  it('includes spec for visible showIf question', () => {
    const answers = { has_os: 'true', os_installed: 'Ubuntu 24.04' };
    const specs = deriveSpecsFromAnswers([subCatContract], answers);
    expect(specs['Betriebssystem']).toBe('Ubuntu 24.04');
  });

  it('collects specs from all contracts', () => {
    const answers = {
      keyboard_layout: 'CH',
      battery_condition: 'Gut (>80%)',
      ram_gb: '8',
    };
    const assemblyQc = assemblyToQualityContract(assemblyContract);
    const specs = deriveSpecsFromAnswers([subCatContract, assemblyQc], answers);
    expect(specs['Tastatur-Layout']).toBe('CH');
    expect(specs['Akku']).toBe('Gut (>80%)');
    expect(specs['RAM']).toBe('8 GB');
  });
});

describe('buildQualityCheckResponse', () => {
  it('merges assembly contract specs into derivedSpecs', () => {
    const assemblyQc = assemblyToQualityContract(assemblyContract);
    const answers = { ram_gb: '16', battery_condition: 'Gut (>80%)' };
    const result = buildQualityCheckResponse(generalContract, subCatContract, answers, assemblyQc);
    expect(result.derivedSpecs['RAM']).toBe('16 GB');
    expect(result.derivedSpecs['Akku']).toBe('Gut (>80%)');
  });

  it('qualityValue reflects assembly impact when merged', () => {
    const assemblyQc = assemblyToQualityContract(assemblyContract);
    const answers = { has_fan: 'false' }; // fan missing → quality 1
    const result = buildQualityCheckResponse(generalContract, subCatContract, answers, assemblyQc);
    expect(result.qualityValue).toBe(1);
  });

  it('works without assembly contract', () => {
    const answers = { lieferumfang: 'Vollständig' };
    const result = buildQualityCheckResponse(generalContract, null, answers);
    expect(result.qualityValue).toBe(5);
    expect(result.generalContractVersion).toBe(1);
  });

  it('includes subCategoryContractVersion when subCat contract provided', () => {
    const result = buildQualityCheckResponse(generalContract, subCatContract, {});
    expect(result.subCategoryContractVersion).toBe(4);
  });
});
