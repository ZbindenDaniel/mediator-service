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

describe('deriveQualityFromAnswers', () => {
  it('returns default value (3) when no answers are provided', () => {
    const { value } = deriveQualityFromAnswers([generalContract], {});
    expect(value).toBe(3);
  });

  it('returns default when answers exist but none have qualityImpact', () => {
    const { value } = deriveQualityFromAnswers([subCatContract], { keyboard_layout: 'CH' });
    expect(value).toBe(3);
  });

  it('min score wins across all contracts', () => {
    const answers = {
      lieferumfang: 'Vollständig',  // impact: 5
      has_fan: 'false',             // impact: 1 (from disassembly)
    };
    const assemblyQc = assemblyToQualityContract(assemblyContract);
    const { value } = deriveQualityFromAnswers([generalContract, assemblyQc], answers);
    expect(value).toBe(1);
  });

  it('clamps score to max 5', () => {
    const answers = { lieferumfang: 'Vollständig' };
    const { value } = deriveQualityFromAnswers([generalContract], answers);
    expect(value).toBe(5);
  });

  it('skips questions hidden by showIf when gate answer is false', () => {
    // os_installed has showIf: { questionId: 'has_os', value: 'true' }
    // but has_os is 'false' → os_installed should be skipped
    const answers = { has_os: 'false', os_installed: 'Ubuntu' };
    // os_installed has no qualityImpact, but this tests that it's filtered out
    const { value } = deriveQualityFromAnswers([subCatContract], answers);
    expect(value).toBe(4); // only has_os: false → 4
  });

  it('includes showIf question when gate condition is met', () => {
    const answers = { has_os: 'true' };
    const { value } = deriveQualityFromAnswers([subCatContract], answers);
    expect(value).toBe(5); // has_os: true → 5
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
