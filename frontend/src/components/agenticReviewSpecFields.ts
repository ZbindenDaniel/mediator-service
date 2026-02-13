import { parseLangtext } from '../lib/langtext';
import { logger } from '../utils/logger';

// TODO(agentic-review-spec-fields): Revisit normalization if Langtext parser contracts change.
export interface NormalizedReviewSpecField {
  key: string;
  value: string;
}

function normalizeReviewSpecToken(token: string): string {
  return token.trim().replace(/\s+/g, ' ');
}

export function parseReviewSpecTokenList(raw: string): string[] {
  return raw
    .split(',')
    .map(normalizeReviewSpecToken)
    .filter((entry) => entry.length > 0);
}

export function mergeSpecFieldSelection(selectedFields: string[], additionalInput: string): string {
  const normalizedSelected = selectedFields.map(normalizeReviewSpecToken).filter((entry) => entry.length > 0);
  const normalizedAdditional = parseReviewSpecTokenList(additionalInput);
  return [...normalizedSelected, ...normalizedAdditional].join(',');
}

export function buildNormalizedReviewSpecFields(
  itemValue: unknown,
  itemId: string,
  placeholderValue: string,
  formatValue: (value: unknown) => string
): NormalizedReviewSpecField[] {
  try {
    const parsed = parseLangtext(itemValue ?? '', logger);
    if (parsed.kind === 'json') {
      const unique = new Map<string, NormalizedReviewSpecField>();
      for (const entry of parsed.entries) {
        const key = normalizeReviewSpecToken(entry.key);
        if (!key) {
          continue;
        }
        if (!unique.has(key.toLowerCase())) {
          unique.set(key.toLowerCase(), { key, value: formatValue(entry.value) });
        }
      }
      return Array.from(unique.values());
    }

    const fromText = parsed.text
      .split(/[,\n]/)
      .map(normalizeReviewSpecToken)
      .filter((entry) => entry.length > 0)
      .map((entry) => ({ key: entry, value: placeholderValue }));

    const unique = new Map<string, NormalizedReviewSpecField>();
    for (const entry of fromText) {
      if (!unique.has(entry.key.toLowerCase())) {
        unique.set(entry.key.toLowerCase(), entry);
      }
    }
    return Array.from(unique.values());
  } catch (error) {
    logger.warn?.('ItemDetail: Failed to normalize review spec fields; falling back to plain text preview.', {
      itemId,
      error
    });
    return [];
  }
}
