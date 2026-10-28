// Makes the database taxonomy match a seed file on an existing database (startup only seeds an empty
// one). Upserts the file, deactivates (hides) every other category — nothing is deleted.
//   npm run taxonomy:apply -- config/catalogue/taxonomy.seed.json
//   (defaults to TAXONOMY_SEED_FILE; add --keep-others to leave the rest active)
// Restart the server afterwards: it caches the taxonomy at startup.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseTaxonomySeed } from '../lib/taxonomy';
import { applyTaxonomy } from '../lib/taxonomy-apply';
import { closePool } from '../db-client';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--')) ?? process.env.TAXONOMY_SEED_FILE;
if (!file) {
  console.error('[taxonomy:apply] pass a seed file or set TAXONOMY_SEED_FILE');
  process.exit(1);
}
const categories = parseTaxonomySeed(JSON.parse(readFileSync(resolve(file), 'utf8')));
applyTaxonomy(categories, { deactivateMissing: !args.includes('--keep-others') })
  .then((r) => {
    console.log(`[taxonomy:apply] ${r.categoriesUpserted} categories / ${r.subcategoriesUpserted} subcategories applied from ${file}`);
    console.log(`[taxonomy:apply] deactivated ${r.categoriesDeactivated.length} categories, ${r.subcategoriesDeactivated.length} subcategories`);
    console.log('[taxonomy:apply] restart the mediator so it reloads the taxonomy');
  })
  .catch((err) => { console.error('[taxonomy:apply] failed — nothing changed', err.message ?? err); process.exitCode = 1; })
  .finally(() => closePool());
