import { decideContractAuditAction } from '../index';

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
