import fs from 'fs';
import path from 'path';
import type { Co2ImpactLabel, Co2ImpactResult } from '../../models/co2';

// __dirname resolves to dist/backend/lib/ at runtime, so ../../contracts lands in dist/contracts/
const CO2_CONTRACT_PATH = path.resolve(__dirname, '../../contracts/impact/co2.json');

interface Co2Category {
  unterkategorie: number;
  label: string;
  e_new_kg: number;
  typical_life_new_yr: number;
  total_achievable_life_yr: number;
}

interface Co2Contract {
  version: number;
  label_thresholds: Array<{ min: number; label: Co2ImpactLabel }>;
  categories: Co2Category[];
}

type Logger = Pick<Console, 'debug' | 'error' | 'info' | 'warn'>;

let cachedContract: Co2Contract | null = null;

function ensureContract(logger: Logger = console): Co2Contract | null {
  if (cachedContract) {
    return cachedContract;
  }
  try {
    const raw = fs.readFileSync(CO2_CONTRACT_PATH, 'utf8');
    cachedContract = JSON.parse(raw) as Co2Contract;
    logger.debug?.('[co2-calculator] Loaded CO2 contract', { version: cachedContract.version, categories: cachedContract.categories.length });
  } catch (error) {
    logger.error?.('[co2-calculator] Failed to load CO2 contract', { path: CO2_CONTRACT_PATH, error });
    return null;
  }
  return cachedContract;
}

export function resetCo2ContractCache(): void {
  cachedContract = null;
}

function resolveUnterkategorie(unterkategorien: Array<unknown>): number | null {
  for (const value of unterkategorien) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value.trim(), 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function scoreToLabel(score: number, thresholds: Array<{ min: number; label: Co2ImpactLabel }>): Co2ImpactLabel {
  // thresholds are ordered descending by min in the contract
  for (const threshold of thresholds) {
    if (score >= threshold.min) {
      return threshold.label;
    }
  }
  return 'irrelevant';
}

export interface Co2CalculationInput {
  unterkategorien?: Array<unknown>;
  quality?: number | null;
}

export function calculateCo2Impact(input: Co2CalculationInput, logger: Logger = console): Co2ImpactResult | null {
  const contract = ensureContract(logger);
  if (!contract) {
    return null;
  }

  const unterkategorie = resolveUnterkategorie(input.unterkategorien ?? []);
  if (unterkategorie === null) {
    return null;
  }

  const categoryRow = contract.categories.find((c) => c.unterkategorie === unterkategorie);
  if (!categoryRow) {
    return null;
  }

  const quality = input.quality != null ? Math.min(5, Math.max(1, Math.round(input.quality))) : 3;
  const score = categoryRow.e_new_kg * (quality / 5);
  const label = scoreToLabel(score, contract.label_thresholds);

  return {
    label,
    score,
    eNewKg: categoryRow.e_new_kg,
    source: 'category-lookup'
  };
}
