import { decideContractAuditAction, decideSelfHealAction, planContractSweep, planSelfHealSweep, planStandardsSweep } from '../index';
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

describe('planStandardsSweep — observation-only standards backlog', () => {
  it('flags items with a stored version below current, and never-stamped (null) rows, skipping current ones', () => {
    const plan = planStandardsSweep(
      [
        { Artikel_Nummer: 'A', StandardsVersion: 1 },    // stale
        { Artikel_Nummer: 'B', StandardsVersion: null },  // never stamped → stale
        { Artikel_Nummer: 'C', StandardsVersion: 2 },    // current → skipped
        { Artikel_Nummer: 'D', StandardsVersion: 3 }     // newer than current → skipped
      ],
      2
    );
    expect(plan).toEqual([
      { artikelNummer: 'A', fromVersion: 1, toVersion: 2 },
      { artikelNummer: 'B', fromVersion: null, toVersion: 2 }
    ]);
  });

  it('returns an empty plan when there is no standards contract (null current version)', () => {
    expect(planStandardsSweep([{ Artikel_Nummer: 'A', StandardsVersion: null }], null)).toEqual([]);
  });
});

describe('decideSelfHealAction — unified entry-point router (both axes)', () => {
  it('skips when current on both axes', () => {
    expect(decideSelfHealAction(2, 2, 3, 3, [])).toEqual({ action: 'skip' });
  });

  it('restamps when contract stale-but-complete and standards current', () => {
    expect(decideSelfHealAction(1, 2, 3, 3, [])).toEqual({ action: 'restamp' });
  });

  it('reworks (targeted extraction) when contract stale + missing required and standards current', () => {
    expect(decideSelfHealAction(1, 2, 3, 3, ['Prozessor'])).toEqual({ action: 'rework', fields: ['Prozessor'] });
  });

  it('re-words when only standards are stale (no extraction need)', () => {
    expect(decideSelfHealAction(2, 2, 1, 2, [])).toEqual({ action: 'reword' });
    // never-stamped standards (null) counts as stale
    expect(decideSelfHealAction(2, 2, null, 1, [])).toEqual({ action: 'reword' });
    // contract stale-but-complete AND standards stale → the re-word run covers both (it re-stamps both)
    expect(decideSelfHealAction(1, 2, 1, 2, [])).toEqual({ action: 'reword' });
  });

  it('escalates to a full rerun when extraction is needed AND standards are stale (rework would skip wording)', () => {
    expect(decideSelfHealAction(1, 2, 1, 2, ['Prozessor'])).toEqual({ action: 'rerun', fields: ['Prozessor'] });
  });

  it('disables the wording axis when standardsCurrent is null (contract-only behaviour)', () => {
    expect(decideSelfHealAction(2, 2, null, null, [])).toEqual({ action: 'skip' });
    expect(decideSelfHealAction(1, 2, null, null, ['Prozessor'])).toEqual({ action: 'rework', fields: ['Prozessor'] });
  });
});

describe('planSelfHealSweep — unified plan across both axes', () => {
  const contract: SpecContract = {
    version: 2,
    fields: [
      { key: 'Prozessor', required: true, description: '' },
      { key: 'Farbe', required: false, description: '' }
    ]
  };
  const getContract = (sub: number): SpecContract | null => (sub === 201 ? contract : null);

  it('classifies each staleness combination and carries both version axes', () => {
    const plan = planSelfHealSweep(
      [
        // contract current, standards stale → reword
        { Artikel_Nummer: 'A', SubCategory: 201, SpecContractVersion: 2, StandardsVersion: 1, Langtext: JSON.stringify({ Prozessor: 'i5' }) },
        // contract stale + missing required, standards current → rework
        { Artikel_Nummer: 'B', SubCategory: 201, SpecContractVersion: 1, StandardsVersion: 3, Langtext: JSON.stringify({ Farbe: 'Schwarz' }) },
        // contract stale + missing required AND standards stale → rerun
        { Artikel_Nummer: 'C', SubCategory: 201, SpecContractVersion: 1, StandardsVersion: 1, Langtext: JSON.stringify({ Farbe: 'Grau' }) },
        // contract stale-but-complete, standards current → restamp
        { Artikel_Nummer: 'D', SubCategory: 201, SpecContractVersion: 1, StandardsVersion: 3, Langtext: JSON.stringify({ Prozessor: 'i7' }) },
        // current on both → skipped
        { Artikel_Nummer: 'E', SubCategory: 201, SpecContractVersion: 2, StandardsVersion: 3, Langtext: JSON.stringify({ Prozessor: 'i9' }) }
      ],
      getContract,
      3
    );
    expect(plan).toEqual([
      { artikelNummer: 'A', subCategory: 201, action: 'reword', fromVersion: 2, toVersion: 2, standardsFromVersion: 1, standardsToVersion: 3 },
      { artikelNummer: 'B', subCategory: 201, action: 'rework', fields: ['Prozessor'], fromVersion: 1, toVersion: 2, standardsFromVersion: 3, standardsToVersion: 3 },
      { artikelNummer: 'C', subCategory: 201, action: 'rerun', fields: ['Prozessor'], fromVersion: 1, toVersion: 2, standardsFromVersion: 1, standardsToVersion: 3 },
      { artikelNummer: 'D', subCategory: 201, action: 'restamp', fromVersion: 1, toVersion: 2, standardsFromVersion: 3, standardsToVersion: 3 }
    ]);
  });

  it('with standardsCurrent null, behaves exactly like the contract-only plan', () => {
    const rows = [
      { Artikel_Nummer: 'A', SubCategory: 201, SpecContractVersion: 2, StandardsVersion: 1, Langtext: JSON.stringify({ Prozessor: 'i5' }) }
    ];
    expect(planSelfHealSweep(rows, getContract, null)).toEqual([]); // standards axis off → nothing stale
    expect(planContractSweep(rows, getContract)).toEqual([]);
  });
});
