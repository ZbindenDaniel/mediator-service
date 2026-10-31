import { decideContractAuditAction, planContractSweep } from '../index';
import type { SpecContract } from '../../../models/spec-contract';

describe('decideContractAuditAction — idle contract-audit sweep decision', () => {
  it('skips when the stored version is current or newer', () => {
    expect(decideContractAuditAction(3, 3, ['Prozessor'])).toEqual({ action: 'skip' });
    expect(decideContractAuditAction(4, 3, [])).toEqual({ action: 'skip' });
  });

  it('reworks when stale and a required field is now missing', () => {
    expect(decideContractAuditAction(2, 3, ['Prozessor', 'RAM'])).toEqual({
      action: 'rework',
      fields: ['Prozessor', 'RAM'],
    });
    // Never stamped yet (null) counts as stale.
    expect(decideContractAuditAction(null, 1, ['Speicher'])).toEqual({
      action: 'rework',
      fields: ['Speicher'],
    });
  });

  it('re-stamps when stale but already complete under the new contract', () => {
    expect(decideContractAuditAction(2, 3, [])).toEqual({ action: 'restamp' });
    expect(decideContractAuditAction(null, 1, [])).toEqual({ action: 'restamp' });
  });
});

describe('planContractSweep — L4 legible sweep plan (the dry-run backlog)', () => {
  // v2 contract requiring Prozessor; fields drive checkSpecGap against each candidate's Langtext.
  const contract: SpecContract = {
    version: 2,
    fields: [
      { key: 'Prozessor', required: true, description: '' },
      { key: 'Farbe', required: false, description: '' }
    ]
  };
  const getContract = (sub: number): SpecContract | null => (sub === 201 ? contract : null);

  it('plans the whole stale backlog in order, classified rework vs restamp, skipping current rows', () => {
    const plan = planContractSweep(
      [
        // stale + missing the required Prozessor → rework
        { Artikel_Nummer: 'A', SubCategory: 201, SpecContractVersion: 1, Langtext: JSON.stringify({ Farbe: 'Schwarz' }) },
        // stale but complete (has Prozessor) → restamp
        { Artikel_Nummer: 'B', SubCategory: 201, SpecContractVersion: 1, Langtext: JSON.stringify({ Prozessor: 'i5' }) },
        // already current → skipped entirely
        { Artikel_Nummer: 'C', SubCategory: 201, SpecContractVersion: 2, Langtext: JSON.stringify({ Prozessor: 'i7' }) },
        // no contract for its subcategory → skipped
        { Artikel_Nummer: 'D', SubCategory: 999, SpecContractVersion: 1, Langtext: null }
      ],
      getContract
    );
    expect(plan).toEqual([
      { artikelNummer: 'A', subCategory: 201, action: 'rework', fields: ['Prozessor'], fromVersion: 1, toVersion: 2 },
      { artikelNummer: 'B', subCategory: 201, action: 'restamp', fromVersion: 1, toVersion: 2 }
    ]);
  });

  it('treats a never-stamped (null) row as stale and unparseable Langtext as empty → rework', () => {
    const plan = planContractSweep(
      [{ Artikel_Nummer: 'E', SubCategory: 201, SpecContractVersion: null, Langtext: 'not-json' }],
      getContract
    );
    expect(plan).toEqual([
      { artikelNummer: 'E', subCategory: 201, action: 'rework', fields: ['Prozessor'], fromVersion: null, toVersion: 2 }
    ]);
  });

  it('returns an empty plan when nothing is stale', () => {
    const plan = planContractSweep(
      [{ Artikel_Nummer: 'F', SubCategory: 201, SpecContractVersion: 2, Langtext: JSON.stringify({ Prozessor: 'i9' }) }],
      getContract
    );
    expect(plan).toEqual([]);
  });
});
