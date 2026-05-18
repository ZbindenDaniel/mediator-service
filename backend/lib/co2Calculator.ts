import fs from 'fs';
import path from 'path';
import type { Co2CalculationResult } from '../../models/co2';

const CO2_CONTRACT_PATH = path.resolve(process.cwd(), 'contracts/impact/co2.json');

type RefurbIntensity = 'light' | 'medium' | 'heavy';

interface Co2Category {
  unterkategorie: number;
  label: string;
  e_new_kg: number;
  typical_life_new_yr: number;
  total_achievable_life_yr: number;
}

interface Co2Contract {
  version: number;
  r_reuse: number;
  o_refurb_kg: Record<RefurbIntensity, number>;
  quality_to_refurb_intensity: Record<string, RefurbIntensity>;
  default_age_yr: number;
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

function resolveAgeYears(datumErfasst: Date | string | null | undefined, defaultAge: number): number {
  if (!datumErfasst) {
    return defaultAge;
  }
  try {
    const ms = typeof datumErfasst === 'string' ? Date.parse(datumErfasst) : datumErfasst.getTime();
    if (Number.isNaN(ms)) {
      return defaultAge;
    }
    const ageMs = Date.now() - ms;
    return Math.max(0, ageMs / (1000 * 60 * 60 * 24 * 365.25));
  } catch {
    return defaultAge;
  }
}

function resolveRefurbIntensity(
  quality: number | null | undefined,
  mapping: Record<string, RefurbIntensity>
): RefurbIntensity {
  if (quality !== null && quality !== undefined) {
    const key = String(Math.round(quality));
    const intensity = mapping[key];
    if (intensity) {
      return intensity;
    }
  }
  return 'medium';
}

export interface Co2CalculationInput {
  unterkategorien?: Array<unknown>;
  datumErfasst?: Date | string | null;
  quality?: number | null;
}

export function calculateCo2Savings(input: Co2CalculationInput, logger: Logger = console): Co2CalculationResult | null {
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

  const ageYears = resolveAgeYears(input.datumErfasst, contract.default_age_yr);
  const remainingYears = Math.max(0, categoryRow.total_achievable_life_yr - ageYears);
  // L_factor: fraction of typical new-device life that remains for reuse
  const lFactor = Math.min(1, remainingYears / categoryRow.typical_life_new_yr);

  const intensity = resolveRefurbIntensity(input.quality, contract.quality_to_refurb_intensity);
  const oRefurbKg = contract.o_refurb_kg[intensity];
  const rReuse = contract.r_reuse;

  const co2SavedKg = Math.max(0, categoryRow.e_new_kg * rReuse * lFactor - oRefurbKg);

  return {
    co2SavedKg,
    eNewKg: categoryRow.e_new_kg,
    rReuse,
    lFactor,
    oRefurbKg,
    ageYears,
    source: 'category-lookup'
  };
}
