// Validates the effective contract set (shipped + CONTRACTS_OVERLAY_DIR) against the taxonomy seed
// (TAXONOMY_SEED_FILE or config/taxonomy.seed.json). Exit code 1 on any problem — usable in CI/deploy.
import { loadContractSetFromDisk, validateContractSet, unusedContractCodes } from '../contracts/validate';
import { loadTaxonomy } from '../lib/taxonomy';
import { parentCodeMap } from '../../models/item-category-lookups';

const taxonomy = loadTaxonomy(true);
const known = new Set<number>(taxonomy.flatMap((c) => c.subcategories.map((s) => s.code)));
// Contracts for subcategories outside this deployment's taxonomy are unused here (e.g. the shipped
// refurbishment files under the catalogue taxonomy) — listed, not failed.
const set = { ...loadContractSetFromDisk(), knownSubcategories: known, parentCodes: parentCodeMap(taxonomy), skipUnknownCodes: true };
const unused = unusedContractCodes(set);
if (unused.length) console.log(`[contracts:check] ${unused.length} contract(s) unused in this taxonomy: ${unused.join(', ')}`);
const errors = validateContractSet(set);
if (errors.length) {
  console.error(`[contracts:check] ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('[contracts:check] OK');
