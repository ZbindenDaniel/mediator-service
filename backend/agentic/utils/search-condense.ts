// Deterministic, quality-preserving condensation of raw search text for the extraction prompt.
//
// The extraction stage was handed the FULL raw per-query search blob (a 16k+ char page dump), unlike the
// categorizer which gets the heavily-sanitized `buildAggregatedSearchText` output. An oversized blob
// overflowed the model context window and produced empty completions (the "json match missing" /
// EXTRACTION_FAILED loop). Blind truncation would fix the size but discard signal (specs, model IDs,
// prices near the end of the page). This condenser instead keeps the spec-bearing lines and drops
// boilerplate/navigation/marketing, so the model still sees the numbers it needs within a token budget.
//
// It is intentionally deterministic (no LLM call): the raw text is mostly nav/marketing, and the
// spec-line heuristic recovers most of the useful signal at zero cost and no extra failure surface.

export interface CondenseSearchOptions {
  /** Maximum length (chars) of the returned condensed text. Output is guaranteed to be ≤ this. */
  maxLength: number;
  logger?: { warn?: (payload: unknown) => void; debug?: (payload: unknown) => void };
  itemId?: string;
  /** Purely for log correlation (e.g. the search query the text came from). */
  query?: string;
}

export interface CondenseSearchResult {
  text: string;
  originalLength: number;
  condensedLength: number;
  keptLineCount: number;
  droppedLineCount: number;
  specLineCount: number;
  /** True when condensation actually ran (input exceeded the budget). */
  condensed: boolean;
}

const URL_REGEX = /https?:\/\/\S+/gi;
const SEPARATOR_REGEX = /^([-=*_])\1{2,}$/;
// A line "looks like a spec" if it mentions article/price/model keywords, a number with a unit, or a
// model-code token (letters + digits, e.g. ZX-9000, AB1200). Mirrors item-flow-search.ts's heuristic so
// both paths agree on what signal to preserve.
const SPEC_LIKE_LINE_REGEX =
  /\b(artikel|preis|price|modell?|model|\d+(?:[.,]\d+)?\s?(?:mm|cm|kg|g|w|kw|v|gb|tb|mhz|ghz|zoll|inch|"|w)|[a-z]{1,4}[\-_/]?\d{2,}[a-z0-9\-_/]*)\b/i;

function isSpecLikeLine(line: string): boolean {
  return SPEC_LIKE_LINE_REGEX.test(line);
}

/** Drop a line that is essentially just a long URL (nav/tracking noise) with no spec content. */
function isNoiseUrlLine(line: string): boolean {
  const urlMatches = line.match(URL_REGEX);
  if (!urlMatches) {
    return false;
  }
  if (isSpecLikeLine(line)) {
    return false; // a spec line that happens to carry a URL is still worth keeping
  }
  // Multiple URLs, or one long URL-dominated line, with no spec signal → noise.
  return urlMatches.length >= 2 || line.length > 80;
}

/**
 * Condense raw search text to fit `maxLength`, preferring spec-bearing lines over prose/boilerplate.
 *
 * Small inputs (already within budget) are returned verbatim — condensation only runs when the raw text
 * would overflow, so well-sized items behave exactly as before.
 */
export function condenseSearchText(rawText: string, options: CondenseSearchOptions): CondenseSearchResult {
  const { maxLength, logger, itemId, query } = options;
  const originalLength = typeof rawText === 'string' ? rawText.length : 0;

  if (!rawText || !rawText.trim() || originalLength <= maxLength) {
    return {
      text: rawText ?? '',
      originalLength,
      condensedLength: originalLength,
      keptLineCount: 0,
      droppedLineCount: 0,
      specLineCount: 0,
      condensed: false
    };
  }

  const seen = new Set<string>();
  const specLines: string[] = [];
  const otherLines: string[] = [];
  let droppedLineCount = 0;

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line || SEPARATOR_REGEX.test(line) || isNoiseUrlLine(line)) {
      droppedLineCount += 1;
      continue;
    }
    const dedupeKey = line.toLowerCase();
    if (seen.has(dedupeKey)) {
      droppedLineCount += 1;
      continue;
    }
    seen.add(dedupeKey);
    if (isSpecLikeLine(line)) {
      specLines.push(line);
    } else {
      otherLines.push(line);
    }
  }

  // Fill the budget spec-lines-first, then prose, preserving each tier's original order.
  const kept: string[] = [];
  let used = 0;
  const tryAppend = (line: string): boolean => {
    const addition = kept.length === 0 ? line.length : line.length + 1; // +1 for the joining newline
    if (used + addition > maxLength) {
      return false;
    }
    kept.push(line);
    used += addition;
    return true;
  };

  const candidates = [...specLines, ...otherLines];
  let budgetExhausted = false;
  for (const line of candidates) {
    if (!tryAppend(line)) {
      budgetExhausted = true;
      // Keep scanning: a later spec line may be short enough to still fit.
    }
  }

  // Guard: if not even the shortest candidate fit (every line individually exceeds the budget), keep the
  // first candidate sliced to the budget rather than returning nothing — an oversized single line still
  // carries signal, and an empty context would just re-trigger the "no JSON" failure we're preventing.
  if (kept.length === 0 && candidates.length > 0) {
    kept.push(candidates[0].slice(0, maxLength));
  }
  droppedLineCount += candidates.length - kept.length;

  let text = kept.join('\n');
  // Final hard guard so the contract (output ≤ maxLength) always holds.
  if (text.length > maxLength) {
    text = text.slice(0, maxLength);
  }

  const result: CondenseSearchResult = {
    text,
    originalLength,
    condensedLength: text.length,
    keptLineCount: kept.length,
    droppedLineCount,
    specLineCount: specLines.length,
    condensed: true
  };

  logger?.warn?.({
    msg: 'condensed extraction search context',
    itemId,
    query,
    originalLength,
    condensedLength: result.condensedLength,
    keptLineCount: result.keptLineCount,
    droppedLineCount: result.droppedLineCount,
    specLineCount: result.specLineCount,
    budgetExhausted
  });

  return result;
}
