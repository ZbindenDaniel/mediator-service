// Rebuilds items."QualityScoreMin/Max" for every assessed item and assembly tree. Run after changing
// contract weights (they are config, so no item write triggers a recompute):
//   npm run quality:recompute
import { recomputeAllQualityScores } from '../backend/lib/quality-score';
import { closePool } from '../backend/db-client';

recomputeAllQualityScores()
  .then(({ items, changed }) => console.log(`[quality:recompute] ${items} item(s) checked, ${changed} updated`))
  .catch((err) => { console.error('[quality:recompute] failed', err); process.exitCode = 1; })
  .finally(() => closePool());
