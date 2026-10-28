import type { FeatureKey } from '../../../models/features';

// Which deployment feature each detail tab belongs to (tabs not listed are core). Shared by the tab
// bar and the detail views, so a disabled tab is hidden AND an old ?tab= link falls back instead of
// rendering a panel whose API is blocked.
export const ITEM_TAB_FEATURES: Record<string, FeatureKey> = {
  ki: 'agentic',
  review: 'agentic',
  images: 'item-images',
  attachments: 'item-attachments',
  events: 'logs',
  markierung: 'item-marks'
};

export const BOX_TAB_FEATURES: Record<string, FeatureKey> = {
  notizen: 'box-notes',
  items: 'box-items',
  events: 'logs',
  stubs: 'stubs'
};

export function isTabEnabled(
  tab: string,
  map: Record<string, FeatureKey>,
  features: Record<FeatureKey, boolean>
): boolean {
  const feature = map[tab];
  return !feature || features[feature];
}

/** The tab to show: the requested one if enabled, else the view's default tab. */
export function resolveTab(
  requested: string | null | undefined,
  fallback: string,
  map: Record<string, FeatureKey>,
  features: Record<FeatureKey, boolean>
): string {
  const tab = requested ?? fallback;
  return isTabEnabled(tab, map, features) ? tab : fallback;
}
