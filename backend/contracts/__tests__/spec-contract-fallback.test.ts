import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSpecContract, clearContractCaches } from '../registry';

// Codes outside the taxonomy fall back to Math.floor(code / 10) for the group key, so 99xx → group-99x.
// Using out-of-taxonomy codes keeps the test independent of the real taxonomy.
describe('spec contract main-category fallback', () => {
  let overlay: string;

  beforeEach(() => {
    overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-fallback-'));
    fs.mkdirSync(path.join(overlay, 'specs'), { recursive: true });
    process.env.CONTRACTS_OVERLAY_DIR = overlay;
    clearContractCaches();
  });
  afterEach(() => {
    delete process.env.CONTRACTS_OVERLAY_DIR;
    clearContractCaches();
    try { fs.rmSync(overlay, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const writeSpec = (key: string, obj: unknown) =>
    fs.writeFileSync(path.join(overlay, 'specs', `${key}.json`), JSON.stringify(obj));

  it('uses the main-category group contract when the subcategory has no own file', () => {
    writeSpec('group-998', { version: 3, fields: [{ key: 'A', required: true, description: 'a' }] });
    const c = getSpecContract(9989); // no own 9989.json → group-998
    expect(c?.version).toBe(3);
    expect(c?.fields.map((f) => f.key)).toEqual(['A']);
    expect(c?.subCategory).toBe(9989);
  });

  it('merges own over group — subcategory fields lead and win on a key conflict', () => {
    writeSpec('group-998', {
      version: 3,
      fields: [
        { key: 'A', required: true, description: 'group-a' },
        { key: 'B', required: false, description: 'group-b' }
      ]
    });
    writeSpec('9988', {
      version: 5,
      fields: [
        { key: 'A', required: false, description: 'own-a' },
        { key: 'C', required: true, description: 'own-c' }
      ]
    });
    const c = getSpecContract(9988);
    expect(c?.version).toBe(5);
    // own fields first (A, C), then group-only fields (B)
    expect(c?.fields.map((f) => f.key)).toEqual(['A', 'C', 'B']);
    const a = c?.fields.find((f) => f.key === 'A');
    expect(a?.description).toBe('own-a'); // subcategory wins
    expect(a?.required).toBe(false);
  });

  it('returns null when neither the subcategory nor its group has a contract', () => {
    expect(getSpecContract(9977)).toBeNull();
  });
});
