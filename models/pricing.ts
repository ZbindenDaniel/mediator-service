import type { QualityContract } from './quality-contract';

/**
 * Instance pricing: base price (`item_refs.Verkaufspreis` = like-new, grade 5) × a factor from the
 * quality grade, unless the instance carries its own `PreisOverride`. Pure, so the backend (Shopware,
 * labels, stats) and the frontend (instance tab) can never disagree. Docs: docs/detailed/items.md (instance price).
 */

export interface PricingRounding {
  /** Round to multiples of this amount (CHF). */
  step: number;
  mode: 'nearest' | 'up' | 'down';
}

export interface PricingConfig {
  /** `linear-grade`: factor = grade / 5 (grade 5 = 100 % of the base price). */
  model: 'linear-grade';
  /** Lowest factor any instance gets; also used when the grade is unknown. */
  minFactor: number;
  rounding: PricingRounding;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = Object.freeze({
  model: 'linear-grade',
  minFactor: 0.2,
  rounding: Object.freeze({ step: 5, mode: 'nearest' })
}) as PricingConfig;

export type InstancePriceSource = 'override' | 'formula' | 'none';

export interface InstancePriceInput {
  basePrice: number | null | undefined;
  grade: number | null | undefined;
  override?: number | null | undefined;
  config?: PricingConfig;
}

export interface InstancePrice {
  price: number | null;
  source: InstancePriceSource;
  /** Factor applied to the base price (null for override / none). */
  factor: number | null;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function pricingFactorForGrade(grade: number | null | undefined, config: PricingConfig = DEFAULT_PRICING_CONFIG): number {
  const valid = typeof grade === 'number' && Number.isFinite(grade) && grade >= 1 && grade <= 5;
  const linear = valid ? Math.round(grade as number) / 5 : 0;
  return Math.min(1, Math.max(config.minFactor, linear));
}

function roundPrice(raw: number, rounding: PricingRounding): number {
  const step = rounding.step > 0 ? rounding.step : 0;
  if (!step) return Math.round(raw * 100) / 100;
  // Trim float noise first (500 × 0.6 = 300.00000000000006) so "up" doesn't jump a whole step.
  const units = Math.round((raw / step) * 1e6) / 1e6;
  const fn = rounding.mode === 'up' ? Math.ceil : rounding.mode === 'down' ? Math.floor : Math.round;
  const rounded = fn(units) * step;
  // A cheap item must not round to 0 (or to nothing): fall back to whole Rappen (0.05).
  return rounded > 0 ? rounded : Math.round(raw * 20) / 20;
}

export function resolveInstancePrice({ basePrice, grade, override, config = DEFAULT_PRICING_CONFIG }: InstancePriceInput): InstancePrice {
  // 0 / empty = no override (operator decision 2026-11-05): overrides are the exception, never "gratis".
  if (isPositive(override)) {
    return { price: override, source: 'override', factor: null };
  }
  if (!isPositive(basePrice)) {
    return { price: null, source: 'none', factor: null };
  }
  const factor = pricingFactorForGrade(grade, config);
  // A like-new unit sells at exactly the base price; rounding it would silently change the reference price.
  if (factor >= 1) {
    return { price: basePrice, source: 'formula', factor };
  }
  const price = Math.min(basePrice, roundPrice(basePrice * factor, config.rounding));
  return { price, source: 'formula', factor };
}

export function pricingConfigFrom(contracts: Array<Pick<QualityContract, 'pricing'> | null | undefined>): PricingConfig {
  return contracts.find((c) => c?.pricing)?.pricing ?? DEFAULT_PRICING_CONFIG;
}
