/**
 * Shopware product tags the mediator manages. Tags are derived from data by rules, never typed in, and
 * the sync only adds/removes tags listed in MANAGED_SHOP_TAGS — tags set by hand in the shop admin survive.
 * Docs: docs/detailed/shopware.md (Tags).
 */

export interface ShopTagSource {
  Mietware?: boolean | null;
}

interface ShopTagRule {
  /** Exact Shopware tag name (renaming it orphans the old tag in the shop; remove that one by hand). */
  tag: string;
  applies: (ref: ShopTagSource) => boolean;
}

const SHOP_TAG_RULES: readonly ShopTagRule[] = Object.freeze([
  // Name agreed with the shop side (2026-11-05); rental items stay buyable, the shop decides how to show them.
  { tag: 'rental', applies: (ref) => ref.Mietware === true }
]);

export const MANAGED_SHOP_TAGS: readonly string[] = Object.freeze(SHOP_TAG_RULES.map((r) => r.tag));

export function deriveShopTags(ref: ShopTagSource): string[] {
  return SHOP_TAG_RULES.filter((rule) => rule.applies(ref)).map((rule) => rule.tag);
}
