/**
 * Domain loader — resolves the active domain at startup from the DOMAIN environment variable.
 *
 * Usage:
 *   DOMAIN=antiques   → loads domains/antiques/
 *   DOMAIN=it-electronics (default) → loads domains/it-electronics/
 *
 * To add a new domain:
 *   1. Create domains/<name>/ with categories.ts, example-item.ts, and prompts/.
 *   2. Add an import entry in the DOMAIN_REGISTRY below.
 *   3. Set DOMAIN=<name> in your .env.
 */

import type { ItemCategoryDefinition } from '../models/item-categories';
import path from 'path';

export interface DomainConfig {
  /** Unique machine-readable key for the domain (matches folder name). */
  id: string;
  /** Human-readable label used in logs. */
  label: string;
  /** Full taxonomy used for categorization. */
  itemCategories: ItemCategoryDefinition[];
  /** Fallback example block injected into LLM prompts when no reviewed examples exist. */
  staticExampleItemBlock: string;
  /** Absolute path to domain-specific prompt overrides directory. */
  promptsDir: string;
}

// Registry: add new domain entries here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DOMAIN_REGISTRY: Record<string, () => DomainConfig> = {
  'it-electronics': () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { itemCategories } = require('./it-electronics/categories') as { itemCategories: ItemCategoryDefinition[] };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STATIC_EXAMPLE_ITEM_BLOCK } = require('./it-electronics/example-item') as { STATIC_EXAMPLE_ITEM_BLOCK: string };
    return {
      id: 'it-electronics',
      label: 'IT & Electronics',
      itemCategories,
      staticExampleItemBlock: STATIC_EXAMPLE_ITEM_BLOCK,
      promptsDir: path.resolve(__dirname, 'it-electronics/prompts')
    };
  },
  antiques: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { itemCategories } = require('./antiques/categories') as { itemCategories: ItemCategoryDefinition[] };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STATIC_EXAMPLE_ITEM_BLOCK } = require('./antiques/example-item') as { STATIC_EXAMPLE_ITEM_BLOCK: string };
    return {
      id: 'antiques',
      label: 'Antiques',
      itemCategories,
      staticExampleItemBlock: STATIC_EXAMPLE_ITEM_BLOCK,
      promptsDir: path.resolve(__dirname, 'antiques/prompts')
    };
  }
};

const DEFAULT_DOMAIN = 'it-electronics';

let _resolved: DomainConfig | null = null;

/**
 * Returns the active DomainConfig. Resolves once and caches the result.
 * Reads DOMAIN env var; falls back to DEFAULT_DOMAIN.
 */
export function getActiveDomain(): DomainConfig {
  if (_resolved) {
    return _resolved;
  }

  const requested = (process.env['DOMAIN'] ?? DEFAULT_DOMAIN).trim().toLowerCase();
  const factory = DOMAIN_REGISTRY[requested];

  if (!factory) {
    const available = Object.keys(DOMAIN_REGISTRY).join(', ');
    throw new Error(
      `[domain-loader] Unknown domain "${requested}". Available: ${available}. ` +
        `Set the DOMAIN environment variable to one of the available values.`
    );
  }

  _resolved = factory();
  return _resolved;
}

/** Exposed for tests only — resets the cached domain so tests can switch domains. */
export function _resetDomainCache(): void {
  _resolved = null;
}
