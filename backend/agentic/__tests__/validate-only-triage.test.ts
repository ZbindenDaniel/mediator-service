import fs from 'fs';
import os from 'os';
import path from 'path';
import { isValidateOnlyEligible } from '../reference-findings';
import { clearContractCaches } from '../../contracts/registry';

describe('isValidateOnlyEligible — enrol-time triage routing', () => {
  let overlay: string;

  beforeEach(() => {
    overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'triage-'));
    fs.mkdirSync(path.join(overlay, 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(overlay, 'specs', '9971.json'),
      JSON.stringify({ version: 1, fields: [{ key: 'Prozessor', required: true, description: 'cpu' }] })
    );
    process.env.CONTRACTS_OVERLAY_DIR = overlay;
    clearContractCaches();
  });
  afterEach(() => {
    delete process.env.CONTRACTS_OVERLAY_DIR;
    clearContractCaches();
    try { fs.rmSync(overlay, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('eligible: has its contract and every required field present + clean prose', () => {
    expect(isValidateOnlyEligible({
      Unterkategorien_A: 9971,
      Artikelbeschreibung: 'Dell OptiPlex',
      Langtext: JSON.stringify({ Prozessor: 'Intel i5' })
    })).toBe(true);
  });

  it('NOT eligible when a required field is missing (needs a real run to fill it)', () => {
    expect(isValidateOnlyEligible({
      Unterkategorien_A: 9971,
      Artikelbeschreibung: 'Dell OptiPlex',
      Langtext: JSON.stringify({})
    })).toBe(false);
  });

  it('NOT eligible when the subcategory has no spec contract (may need categorization)', () => {
    expect(isValidateOnlyEligible({
      Unterkategorien_A: 9999,
      Artikelbeschreibung: 'something',
      Langtext: JSON.stringify({ Prozessor: 'i5' })
    })).toBe(false);
  });

  it('NOT eligible for a missing/invalid ref or one with no subcategory', () => {
    expect(isValidateOnlyEligible(null)).toBe(false);
    expect(isValidateOnlyEligible({ Artikelbeschreibung: 'x' })).toBe(false);
  });
});
