import { assemblyToQualityContract, partsInScope } from '../models/assembly-contract';
import type { AssemblyContract } from '../models/assembly-contract';

const q = (id: string) => ({ id, type: 'select' as const, question: `${id}?`, values: ['Vorhanden', 'Nicht vorhanden'] });

const base: AssemblyContract = {
  version: 1,
  subCategory: 201,
  parts: [
    { key: 'battery', label: 'Akku', targetSubcategory: 2132, question: q('part_battery') },
    { key: 'storage', label: 'Speicher', targetSubcategory: 901, question: q('storage_gb'), specQuestion: q('drive_type') },
    { key: 'webcam', label: 'Webcam', targetSubcategory: 2109, question: q('part_webcam') }
  ]
};

describe('assembly question scope (askOnCreate)', () => {
  it('asks every slot when askOnCreate is absent — refurbishment contracts are unchanged', () => {
    expect(partsInScope(base, 'create').map((p) => p.key)).toEqual(['battery', 'storage', 'webcam']);
  });

  it('asks only the listed slots at creation, all of them otherwise', () => {
    const ac = { ...base, askOnCreate: ['storage'] };
    expect(assemblyToQualityContract(ac, 'create').questions.map((x) => x.id)).toEqual(['storage_gb', 'drive_type']);
    expect(assemblyToQualityContract(ac).questions).toHaveLength(4);
  });

  it('asks no slot at creation for an empty list', () => {
    expect(assemblyToQualityContract({ ...base, askOnCreate: [] }, 'create').questions).toEqual([]);
  });
});
