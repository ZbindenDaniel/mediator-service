import type { AgenticRunReviewHistoryEntry } from '../../models';

const AGGREGATION_WINDOW = 10;
const BAD_FORMAT_THRESHOLD = 3;
const WRONG_INFORMATION_THRESHOLD = 3;
const WRONG_PHYSICAL_DIMENSIONS_THRESHOLD = 2;
const MISSING_SPEC_THRESHOLD = 2;
const INFORMATION_PRESENT_LOW_THRESHOLD = 4;
const TOP_MISSING_SPEC_LIMIT = 5;

export interface ReviewAutomationSignalLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface ReviewAutomationSignalStats {
  sampleSize: number;
  sampleTarget: number;
  lowConfidence: boolean;
  badFormatTrueCount: number;
  badFormatTruePct: number;
  wrongInformationTrueCount: number;
  wrongInformationTruePct: number;
  wrongPhysicalDimensionsTrueCount: number;
  wrongPhysicalDimensionsTruePct: number;
  informationPresentFalseCount: number;
  informationPresentFalsePct: number;
  missingSpecTopKeys: Array<{ key: string; count: number; pct: number }>;
}

export interface ReviewAutomationSignals extends ReviewAutomationSignalStats {
  bad_format_trigger: boolean;
  wrong_information_trigger: boolean;
  wrong_physical_dimensions_trigger: boolean;
  missing_spec_trigger: boolean;
  information_present_low_trigger: boolean;
}

export interface ReviewAutomationSignalThresholds {
  badFormatMinCount: number;
  wrongInformationMinCount: number;
  wrongPhysicalDimensionsMinCount: number;
  missingSpecMinCount: number;
  informationPresentLowMinCount: number;
}

export interface ReviewAutomationSignalDependencies {
  getItemReference: {
    get: (artikelNummer: string) => { Unterkategorien_A?: number | string | null } | undefined;
  };
  listRecentReviewHistoryBySubcategory: (
    subcategory: number,
    limit: number
  ) => AgenticRunReviewHistoryEntry[];
  logger?: ReviewAutomationSignalLogger;
}

interface NormalizedReviewSignals {
  bad_format: boolean | null;
  wrong_information: boolean | null;
  wrong_physical_dimensions: boolean | null;
  information_present: boolean | null;
  missing_spec: string[];
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['true', '1', 'yes', 'y', 'ja'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'nein'].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeMissingSpec(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Map<string, string>();
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const normalizedKey = trimmed.toLowerCase();
    if (!deduped.has(normalizedKey)) {
      deduped.set(normalizedKey, trimmed);
    }
  }
  return Array.from(deduped.values());
}

function thresholdForSample(baseThreshold: number, sampleSize: number): number {
  if (sampleSize <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(1, Math.ceil((baseThreshold / AGGREGATION_WINDOW) * sampleSize));
}

function roundPct(count: number, sampleSize: number): number {
  if (sampleSize <= 0) {
    return 0;
  }
  return Number(((count / sampleSize) * 100).toFixed(1));
}

function parseReviewSignals(entry: AgenticRunReviewHistoryEntry, logger: ReviewAutomationSignalLogger): NormalizedReviewSignals {
  try {
    const metadata = typeof entry.ReviewMetadata === 'string' && entry.ReviewMetadata.trim()
      ? (JSON.parse(entry.ReviewMetadata) as Record<string, unknown>)
      : {};

    return {
      bad_format: normalizeNullableBoolean(metadata.bad_format),
      wrong_information: normalizeNullableBoolean(metadata.wrong_information),
      wrong_physical_dimensions: normalizeNullableBoolean(metadata.wrong_physical_dimensions),
      information_present: normalizeNullableBoolean(metadata.information_present),
      missing_spec: normalizeMissingSpec(metadata.missing_spec)
    };
  } catch (err) {
    logger.warn?.('[agentic-review-automation] Failed to parse review metadata payload for aggregation', {
      artikelNummer: entry.Artikel_Nummer,
      reviewHistoryId: entry.Id,
      error: err instanceof Error ? err.message : err
    });
    return {
      bad_format: null,
      wrong_information: null,
      wrong_physical_dimensions: null,
      information_present: null,
      missing_spec: []
    };
  }
}

export function aggregateReviewAutomationSignals(
  history: AgenticRunReviewHistoryEntry[],
  logger: ReviewAutomationSignalLogger = console
): ReviewAutomationSignals {
  try {
    // TODO(agentic-review-signals): Consider category-specific overrides when enough production telemetry is available.
    const sample = history.slice(0, AGGREGATION_WINDOW);
    const sampleSize = sample.length;
    const lowConfidence = sampleSize < AGGREGATION_WINDOW;
    const thresholds: ReviewAutomationSignalThresholds = {
      badFormatMinCount: thresholdForSample(BAD_FORMAT_THRESHOLD, sampleSize),
      wrongInformationMinCount: thresholdForSample(WRONG_INFORMATION_THRESHOLD, sampleSize),
      wrongPhysicalDimensionsMinCount: thresholdForSample(WRONG_PHYSICAL_DIMENSIONS_THRESHOLD, sampleSize),
      missingSpecMinCount: thresholdForSample(MISSING_SPEC_THRESHOLD, sampleSize),
      informationPresentLowMinCount: thresholdForSample(INFORMATION_PRESENT_LOW_THRESHOLD, sampleSize)
    };

    let badFormatTrueCount = 0;
    let wrongInformationTrueCount = 0;
    let wrongPhysicalDimensionsTrueCount = 0;
    let informationPresentFalseCount = 0;
    const missingSpecCounts = new Map<string, { key: string; count: number }>();

    for (const entry of sample) {
      const normalized = parseReviewSignals(entry, logger);
      if (normalized.bad_format === true) {
        badFormatTrueCount += 1;
      }
      if (normalized.wrong_information === true) {
        wrongInformationTrueCount += 1;
      }
      if (normalized.wrong_physical_dimensions === true) {
        wrongPhysicalDimensionsTrueCount += 1;
      }
      if (normalized.information_present === false) {
        informationPresentFalseCount += 1;
      }

      for (const key of normalized.missing_spec) {
        const normalizedKey = key.toLowerCase();
        const existing = missingSpecCounts.get(normalizedKey);
        if (existing) {
          existing.count += 1;
          continue;
        }
        missingSpecCounts.set(normalizedKey, { key, count: 1 });
      }
    }

    const missingSpecTopKeys = Array.from(missingSpecCounts.values())
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.key.localeCompare(b.key);
      })
      .slice(0, TOP_MISSING_SPEC_LIMIT)
      .map((entry) => ({
        key: entry.key,
        count: entry.count,
        pct: roundPct(entry.count, sampleSize)
      }));

    const topMissingSpecCount = missingSpecTopKeys[0]?.count ?? 0;
    const signals: ReviewAutomationSignals = {
      sampleSize,
      sampleTarget: AGGREGATION_WINDOW,
      lowConfidence,
      badFormatTrueCount,
      badFormatTruePct: roundPct(badFormatTrueCount, sampleSize),
      wrongInformationTrueCount,
      wrongInformationTruePct: roundPct(wrongInformationTrueCount, sampleSize),
      wrongPhysicalDimensionsTrueCount,
      wrongPhysicalDimensionsTruePct: roundPct(wrongPhysicalDimensionsTrueCount, sampleSize),
      informationPresentFalseCount,
      informationPresentFalsePct: roundPct(informationPresentFalseCount, sampleSize),
      missingSpecTopKeys,
      bad_format_trigger: badFormatTrueCount >= thresholds.badFormatMinCount,
      wrong_information_trigger: wrongInformationTrueCount >= thresholds.wrongInformationMinCount,
      wrong_physical_dimensions_trigger: wrongPhysicalDimensionsTrueCount >= thresholds.wrongPhysicalDimensionsMinCount,
      missing_spec_trigger: topMissingSpecCount >= thresholds.missingSpecMinCount,
      information_present_low_trigger: informationPresentFalseCount >= thresholds.informationPresentLowMinCount
    };

    logger.info?.('[agentic-review-automation] Computed aggregate review automation signals', {
      sampleSize,
      sampleTarget: AGGREGATION_WINDOW,
      lowConfidence,
      thresholds,
      triggerStates: {
        bad_format_trigger: signals.bad_format_trigger,
        wrong_information_trigger: signals.wrong_information_trigger,
        wrong_physical_dimensions_trigger: signals.wrong_physical_dimensions_trigger,
        missing_spec_trigger: signals.missing_spec_trigger,
        information_present_low_trigger: signals.information_present_low_trigger
      }
    });

    return signals;
  } catch (err) {
    logger.error?.('[agentic-review-automation] Failed to aggregate review automation signals', {
      sampleSize: history.length,
      error: err instanceof Error ? err.message : err
    });

    return {
      sampleSize: 0,
      sampleTarget: AGGREGATION_WINDOW,
      lowConfidence: true,
      badFormatTrueCount: 0,
      badFormatTruePct: 0,
      wrongInformationTrueCount: 0,
      wrongInformationTruePct: 0,
      wrongPhysicalDimensionsTrueCount: 0,
      wrongPhysicalDimensionsTruePct: 0,
      informationPresentFalseCount: 0,
      informationPresentFalsePct: 0,
      missingSpecTopKeys: [],
      bad_format_trigger: false,
      wrong_information_trigger: false,
      wrong_physical_dimensions_trigger: false,
      missing_spec_trigger: false,
      information_present_low_trigger: false
    };
  }
}

export function loadSubcategoryReviewAutomationSignals(
  artikelNummer: string,
  deps: ReviewAutomationSignalDependencies
): ReviewAutomationSignals {
  const logger = deps.logger ?? console;
  const normalizedArtikelNummer = typeof artikelNummer === 'string' ? artikelNummer.trim() : '';
  if (!normalizedArtikelNummer) {
    logger.warn?.('[agentic-review-automation] Skipping aggregation for empty Artikel_Nummer', {
      artikelNummer: artikelNummer ?? null
    });
    return aggregateReviewAutomationSignals([], logger);
  }

  try {
    const reference = deps.getItemReference.get(normalizedArtikelNummer);
    const subcategoryRaw = reference?.Unterkategorien_A;
    const subcategory = typeof subcategoryRaw === 'number'
      ? subcategoryRaw
      : Number.parseInt(String(subcategoryRaw ?? ''), 10);

    if (!Number.isInteger(subcategory) || subcategory <= 0) {
      logger.warn?.('[agentic-review-automation] Missing subcategory for review signal aggregation', {
        artikelNummer: normalizedArtikelNummer,
        subcategory: subcategoryRaw ?? null
      });
      return aggregateReviewAutomationSignals([], logger);
    }

    const history = deps.listRecentReviewHistoryBySubcategory(subcategory, AGGREGATION_WINDOW);
    logger.info?.('[agentic-review-automation] Loaded reviewed history window for subcategory aggregation', {
      artikelNummer: normalizedArtikelNummer,
      subcategory,
      sampleSize: history.length,
      sampleTarget: AGGREGATION_WINDOW
    });

    return aggregateReviewAutomationSignals(history, logger);
  } catch (err) {
    logger.error?.('[agentic-review-automation] Failed to load subcategory review history for aggregation', {
      artikelNummer: normalizedArtikelNummer,
      error: err instanceof Error ? err.message : err
    });
    return aggregateReviewAutomationSignals([], logger);
  }
}
