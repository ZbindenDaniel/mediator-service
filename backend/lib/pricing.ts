import { DEFAULT_PRICING_CONFIG, pricingConfigFrom, resolveInstancePrice } from '../../models/pricing';
import type { InstancePrice, PricingConfig } from '../../models/pricing';
import { getGeneralQualityContract } from '../contracts/registry';

// The registry caches and clears on admin upload, so a formula change applies without a restart.
export function getPricingConfig(): PricingConfig {
  try {
    return pricingConfigFrom([getGeneralQualityContract()]);
  } catch (error) {
    console.warn('[pricing] Failed to load pricing config from the general contract; using defaults', error);
    return DEFAULT_PRICING_CONFIG;
  }
}

export interface PriceableInstance {
  Verkaufspreis?: number | null;
  Quality?: number | null;
  PreisOverride?: number | null;
}

export function instancePriceFor(item: PriceableInstance, config: PricingConfig = getPricingConfig()): InstancePrice {
  return resolveInstancePrice({
    basePrice: item.Verkaufspreis ?? null,
    grade: item.Quality ?? null,
    override: item.PreisOverride ?? null,
    config
  });
}

/** The read-only price fields an API response carries for one instance (`Item.InstancePrice*`). */
export function instancePriceFields(item: PriceableInstance): { InstancePrice: number | null; InstancePriceSource: InstancePrice['source'] } {
  const { price, source } = instancePriceFor(item);
  return { InstancePrice: price, InstancePriceSource: source };
}
