// TODO(agent): Monitor the impact of enriched item metadata on search heuristics and adjust weighting when planner feedback is available.
// TODO(agent): Revisit the hard cap on generated search plans once telemetry confirms the typical query volume per item.
// TODO(agent): Review aggregated search text sanitization thresholds once search quality metrics are available.
// TODO(agent): Monitor spec-line preservation rates and tune heuristics against false positives once telemetry matures.
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { SearchResult } from '../tools/tavily-client';
import { RateLimitError } from '../tools/tavily-client';
import type { SearchSource } from '../utils/source-formatter';
import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import { searchLimits } from '../config';
import { FlowError } from './errors';
import type { ChatModel } from './item-flow-extraction';
import type { AgenticTarget } from './item-flow-schemas';
import { appendTranscriptSection, type AgentTranscriptWriter } from './transcript';

export interface SearchInvokerMetadata {
  context?: string;
  attempt?: number;
  requestIndex?: number;
  [key: string]: unknown;
}

export type SearchInvoker = (
  query: string,
  limit: number,
  metadata?: SearchInvokerMetadata
) => Promise<SearchResult>;

type LoggerMethods = 'info' | 'warn' | 'error' | 'debug';

export interface CollectSearchContextOptions {
  searchTerm: string;
  searchInvoker: SearchInvoker;
  logger?: Partial<Pick<Console, LoggerMethods>>;
  itemId: string;
  target?: AgenticTarget | Record<string, unknown> | string | null;
  reviewNotes?: string | null;
  shouldSearch: boolean;
  plannerDecision?: PlannerDecision | null;
  missingSchemaFields?: string[];
  reviewerSkip?: boolean;
  transcriptWriter?: AgentTranscriptWriter | null;
}

export interface SearchContext {
  query: string;
  text: string;
  sources: SearchSource[];
}

export interface CollectSearchContextsResult {
  searchContexts: SearchContext[];
  aggregatedSources: SearchSource[];
  recordSources: (sources: SearchSource[]) => void;
  buildAggregatedSearchText: () => string;
}

export type SearchPlan = {
  query: string;
  metadata: SearchInvokerMetadata;
};

const TRACKED_SCHEMA_FIELDS = [
  'Artikelbeschreibung',
  'Verkaufspreis',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge_mm',
  'Breite_mm',
  'Höhe_mm',
  'Gewicht_kg',
  'Hauptkategorien_A',
  'Unterkategorien_A',
  'Hauptkategorien_B',
  'Unterkategorien_B'
] as const;

type TrackedSchemaField = (typeof TRACKED_SCHEMA_FIELDS)[number];

export interface PlannerDecision {
  shouldSearch: boolean;
  plans: SearchPlan[];
}

const MAX_SEARCH_TRANSCRIPT_SECTION_LENGTH = 250_000;
const MAX_SOURCES_PER_DOMAIN_PER_BATCH = 2;

interface SearchPlanFilterResult {
  plans: SearchPlan[];
  duplicateCount: number;
  taxonomyRejectedCount: number;
}

interface PlannerInvocationOptions {
  llm: ChatModel;
  plannerPrompt: string;
  itemId: string;
  searchTerm: string;
  reviewerNotes: string;
  target: AgenticTarget | Record<string, unknown> | null;
  missingFields: string[];
  logger?: Partial<Pick<Console, LoggerMethods>>;
}

const PlannerPlanSchema = z
  .object({
    query: z.string().min(1, 'Query required'),
    metadata: z.record(z.any()).optional()
  })
  .passthrough();

const PlannerResponseSchema = z
  .object({
    shouldSearch: z.boolean().optional().default(true),
    plans: z.array(PlannerPlanSchema).optional().default([])
  })
  .passthrough();

function truncateValue(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function dedupeSearchPlans(plans: SearchPlan[]): SearchPlan[] {
  const uniqueQueries = new Map<string, SearchPlan>();
  for (const plan of plans) {
    if (!uniqueQueries.has(plan.query)) {
      uniqueQueries.set(plan.query, plan);
    }
  }
  return Array.from(uniqueQueries.values());
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/[“”"'`´]/g, '')
    .trim();
}

function isTaxonomyTargetedQuery(query: string): boolean {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return false;
  }

  return /\b(taxonomy|kategoriecode|category\s*code|hauptkategorien?_[ab]|unterkategorien?_[ab]|interne\s*kategorie|kategorie\s*(?:id|code|nummer))\b/i.test(
    normalized
  );
}

function isVendorBiasedQuery(query: string): boolean {
  return /\b(buy|shop|vendor|haendler|händler|amazon|ebay|preisvergleich|angebote?)\b/i.test(query);
}

function isManufacturerOrSpecQuery(query: string): boolean {
  return /\b(hersteller|manufacturer|datenblatt|spec(?:ification)?s?|pdf|bedienungsanleitung|manual)\b/i.test(query);
}

function filterAndDiversifySearchPlans(plans: SearchPlan[]): SearchPlanFilterResult {
  const uniqueByNormalizedQuery = new Map<string, SearchPlan>();
  let duplicateCount = 0;
  let taxonomyRejectedCount = 0;

  for (const plan of plans) {
    if (isTaxonomyTargetedQuery(plan.query)) {
      taxonomyRejectedCount += 1;
      continue;
    }
    const key = normalizeQuery(plan.query);
    if (!key) {
      continue;
    }
    if (uniqueByNormalizedQuery.has(key)) {
      duplicateCount += 1;
      continue;
    }
    uniqueByNormalizedQuery.set(key, plan);
  }

  const diversifiedPlans: SearchPlan[] = [];
  const deferredVendorPlans: SearchPlan[] = [];
  let vendorHits = 0;

  for (const plan of uniqueByNormalizedQuery.values()) {
    const isVendorPlan = isVendorBiasedQuery(plan.query);
    const isSpecPlan = isManufacturerOrSpecQuery(plan.query);
    if (isVendorPlan && !isSpecPlan) {
      vendorHits += 1;
      if (vendorHits > 2) {
        deferredVendorPlans.push(plan);
        continue;
      }
    }
    diversifiedPlans.push(plan);
  }

  return {
    plans: [...diversifiedPlans, ...deferredVendorPlans],
    duplicateCount,
    taxonomyRejectedCount
  };
}

function hasNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function resolvePlanPriority(plan: SearchPlan): number {
  const context = typeof plan.metadata?.context === 'string' ? plan.metadata.context : '';
  if (hasNonEmptyStringArray(plan.metadata?.missingFields)) {
    return 0;
  }
  if (context === 'locked_fields_enriched') {
    return 1;
  }
  if (context === 'manufacturer_enriched' || context === 'short_description_enriched') {
    return 2;
  }
  return 3;
}

function summarizePlanMetadata(plan: SearchPlan): Record<string, unknown> {
  const context = typeof plan.metadata?.context === 'string' ? plan.metadata.context : 'unknown';
  return {
    query: truncateValue(plan.query, 160),
    context,
    missingFields: hasNonEmptyStringArray(plan.metadata?.missingFields)
      ? (plan.metadata?.missingFields as string[]).slice(0, 6)
      : [],
    lockedFields: hasNonEmptyStringArray(plan.metadata?.lockedFields)
      ? (plan.metadata?.lockedFields as string[]).slice(0, 6)
      : []
  };
}

function rankPlansForLimit(plans: SearchPlan[]): SearchPlan[] {
  return plans
    .map((plan, index) => ({ plan, index, priority: resolvePlanPriority(plan) }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.plan);
}

export function identifyMissingSchemaFields(target: AgenticTarget | Record<string, unknown> | null): string[] {
  if (!target) {
    return [...TRACKED_SCHEMA_FIELDS];
  }
  const missing: TrackedSchemaField[] = [];
  for (const field of TRACKED_SCHEMA_FIELDS) {
    const value = (target as Record<string, unknown>)[field];
    if (value == null) {
      missing.push(field);
      continue;
    }
    if (typeof value === 'string' && !value.trim()) {
      missing.push(field);
    }
  }
  return missing;
}

function sanitizePlannerMetadata(
  metadata: unknown,
  fallbackMissingFields: string[]
): SearchInvokerMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { context: 'planner' };
  }
  const normalized: SearchInvokerMetadata = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  if (typeof normalized.context !== 'string' || !normalized.context.trim()) {
    normalized.context = 'planner';
  }
  const missingFieldsCandidate = normalized.missingFields;
  if (Array.isArray(missingFieldsCandidate)) {
    normalized.missingFields = missingFieldsCandidate.filter(
      (field): field is string => typeof field === 'string' && field.trim().length > 0
    );
    if ((normalized.missingFields as unknown[]).length === 0) {
      normalized.missingFields = fallbackMissingFields;
    }
  } else if (fallbackMissingFields.length > 0) {
    normalized.missingFields = fallbackMissingFields;
  }
  return normalized;
}

// TODO(agent): Observe planner outputs to refine payload structure and metadata sanitization.
// TODO(agent): Capture planner latency telemetry once search orchestration stabilizes.
export async function evaluateSearchPlanner({
  llm,
  plannerPrompt,
  itemId,
  searchTerm,
  reviewerNotes,
  target,
  missingFields,
  logger
}: PlannerInvocationOptions): Promise<PlannerDecision | null> {
  if (!plannerPrompt || !plannerPrompt.trim()) {
    return null;
  }

  const payload: Record<string, unknown> = {
    searchTerm,
    missingFields,
    reviewerNotes: reviewerNotes || null
  };

  if (target) {
    payload.target = target;
    const locked = Array.isArray((target as Record<string, unknown>)?.['__locked'])
      ? ((target as Record<string, unknown>)['__locked'] as unknown[]).filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
        )
      : [];
    if (locked.length > 0) {
      payload.lockedFields = locked;
    }
  }

  let serializedPayload = '';
  try {
    serializedPayload = JSON.stringify(payload, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize planner payload', itemId });
    try {
      serializedPayload = JSON.stringify(
        {
          searchTerm,
          missingFields,
          reviewerNotes: reviewerNotes || null
        },
        null,
        2
      );
    } catch (fallbackErr) {
      logger?.error?.({ err: fallbackErr, msg: 'planner payload fallback serialization failed', itemId });
      return null;
    }
  }

  let plannerResponse;
  try {
    plannerResponse = await llm.invoke([
      { role: 'system', content: plannerPrompt },
      { role: 'user', content: serializedPayload }
    ]);
  } catch (err) {
    logger?.error?.({ err, msg: 'search planner invocation failed', itemId });
    return null;
  }

  const raw = stringifyLangChainContent(plannerResponse?.content, {
    context: 'itemFlow.searchPlanner',
    logger
  });

  let parsed: unknown;
  try {
    parsed = parseJsonWithSanitizer(raw, {
      loggerInstance: logger,
      context: { itemId, stage: 'search-planner' }
    });
  } catch (err) {
    logger?.warn?.({ err, msg: 'search planner produced invalid JSON', itemId });
    return null;
  }

  const validated = PlannerResponseSchema.safeParse(parsed);
  if (!validated.success) {
    logger?.warn?.({ msg: 'search planner schema mismatch', itemId, issues: validated.error.issues });
    return null;
  }

  const normalizedPlans = validated.data.plans
    .map((plan) => {
      const trimmedQuery = typeof plan.query === 'string' ? plan.query.trim() : '';
      if (!trimmedQuery) {
        return null;
      }
      const metadata = sanitizePlannerMetadata(plan.metadata, missingFields);
      metadata.plannerSource = 'llm';
      return {
        query: trimmedQuery,
        metadata
      } satisfies SearchPlan;
    })
    .filter((entry): entry is SearchPlan => Boolean(entry));

  logger?.info?.({
    msg: 'search planner evaluated',
    itemId,
    shouldSearch: validated.data.shouldSearch,
    planCount: normalizedPlans.length,
    missingFields: missingFields.slice(0, 10)
  });

  return {
    shouldSearch: validated.data.shouldSearch,
    plans: normalizedPlans
  };
}

function extractSearchPlans(
  searchTerm: string,
  target: AgenticTarget | Record<string, unknown> | null | undefined,
  logger: Partial<Pick<Console, LoggerMethods>> | undefined,
  itemId: string
): SearchPlan[] {
  const plans: SearchPlan[] = [];
  const normalizedTarget: Record<string, unknown> | null = target && typeof target === 'object' ? (target as Record<string, unknown>) : null;
  const baseQuery = `Gerätedaten ${searchTerm}`;

  const resolvedManufacturer = normalizedTarget && typeof normalizedTarget['Hersteller'] === 'string'
    ? (normalizedTarget['Hersteller'] as string).trim()
    : normalizedTarget && typeof normalizedTarget['manufacturer'] === 'string'
      ? (normalizedTarget['manufacturer'] as string).trim()
      : '';

  const resolvedShortDescription = normalizedTarget && typeof normalizedTarget['Kurzbeschreibung'] === 'string'
    ? (normalizedTarget['Kurzbeschreibung'] as string).trim()
    : normalizedTarget && typeof normalizedTarget['shortDescription'] === 'string'
      ? (normalizedTarget['shortDescription'] as string).trim()
      : '';

  const resolvedArticleDescription = normalizedTarget && typeof normalizedTarget['Artikelbeschreibung'] === 'string'
    ? (normalizedTarget['Artikelbeschreibung'] as string).trim()
    : '';

  const lockedFields = Array.isArray(normalizedTarget?.['__locked'])
    ? (normalizedTarget?.['__locked'] as unknown[]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  const lockedFieldSnippets = lockedFields
    .map((fieldName) => {
      if (!normalizedTarget) return null;
      const value = normalizedTarget[fieldName];
      if (typeof value === 'string' && value.trim()) {
        return `${fieldName}:${value.trim()}`;
      }
      if (typeof value === 'number') {
        return `${fieldName}:${value}`;
      }
      return null;
    })
    .filter((snippet): snippet is string => typeof snippet === 'string' && snippet.trim().length > 0)
    .slice(0, 3);

  const fieldSummary = {
    manufacturer: resolvedManufacturer ? truncateValue(resolvedManufacturer, 120) : null,
    shortDescription: resolvedShortDescription ? truncateValue(resolvedShortDescription, 120) : null,
    artikelbeschreibung: resolvedArticleDescription ? truncateValue(resolvedArticleDescription, 120) : null,
    lockedFields,
    lockedValues: lockedFieldSnippets.map((snippet) => truncateValue(snippet, 120))
  };

  logger?.info?.({ msg: 'search field summary', itemId, fieldsUsed: fieldSummary });

  plans.push({ query: baseQuery, metadata: { context: 'primary' } });

  if (resolvedManufacturer) {
    const manufacturerQuery = `Gerätedaten ${resolvedManufacturer} ${searchTerm}`.trim();
    plans.push({
      query: manufacturerQuery,
      metadata: { context: 'manufacturer_enriched', manufacturer: resolvedManufacturer }
    });
  }

  if (resolvedShortDescription && resolvedShortDescription !== resolvedArticleDescription) {
    const shortDescriptionQuery = `Gerätedaten ${resolvedShortDescription} ${resolvedManufacturer || ''}`.trim();
    plans.push({
      query: shortDescriptionQuery,
      metadata: {
        context: 'short_description_enriched',
        shortDescription: resolvedShortDescription,
        manufacturer: resolvedManufacturer || undefined
      }
    });
  }

  if (lockedFieldSnippets.length > 0) {
    const lockedQuery = `Gerätedaten ${searchTerm} ${lockedFieldSnippets.join(' ')}`.trim();
    plans.push({
      query: lockedQuery,
      metadata: { context: 'locked_fields_enriched', lockedFields: lockedFields.slice(0, lockedFieldSnippets.length) }
    });
  }

  return dedupeSearchPlans(plans);
}

function resolveTarget(
  input: AgenticTarget | Record<string, unknown> | string | null | undefined,
  logger: Partial<Pick<Console, LoggerMethods>> | undefined,
  itemId: string
): AgenticTarget | Record<string, unknown> | null {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as AgenticTarget | Record<string, unknown>;
      return parsed;
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to parse target json', itemId });
      return null;
    }
  }
  if (input && typeof input === 'object') {
    return input;
  }
  return null;
}

type SearchTranscriptSource = {
  title?: string;
  url?: string;
  description?: string;
  content?: string;
};

function buildSearchTranscriptSection(
  plan: SearchPlan,
  metadata: SearchInvokerMetadata,
  sources: SearchSource[],
  searchText: string,
  logger: Partial<Pick<Console, LoggerMethods>> | undefined,
  itemId: string,
  requestIndex: number
): {
  requestPayload: Record<string, unknown>;
  responseBody: string;
} {
  const normalizedSources: SearchTranscriptSource[] = sources.map((source = {}) => ({
    title: typeof source.title === 'string' ? source.title : undefined,
    url: typeof source.url === 'string' ? source.url : undefined,
    description: typeof source.description === 'string' ? source.description : undefined,
    content: typeof source.content === 'string' ? source.content : undefined
  }));

  const requestPayload: Record<string, unknown> = {
    query: plan.query,
    metadata,
    sourceCount: normalizedSources.length,
    sources: normalizedSources,
    truncated: false
  };
  let responseBody = searchText;

  const measureLength = () => JSON.stringify({ requestPayload, responseBody }).length;
  const beforeLength = measureLength();

  if (beforeLength > MAX_SEARCH_TRANSCRIPT_SECTION_LENGTH) {
    requestPayload.truncated = true;

    const compactSources: SearchTranscriptSource[] = normalizedSources.map((source) => ({
      title: source.title ? source.title.slice(0, 500) : undefined,
      url: source.url ? source.url.slice(0, 1_000) : undefined,
      description: source.description ? source.description.slice(0, 2_000) : undefined,
      content: source.content ? source.content.slice(0, 4_000) : undefined
    }));

    requestPayload.sources = compactSources;
    const remainingBudget = Math.max(8_000, MAX_SEARCH_TRANSCRIPT_SECTION_LENGTH - JSON.stringify(requestPayload).length);
    responseBody = responseBody.slice(0, remainingBudget);

    const afterLength = measureLength();
    try {
      logger?.warn?.({
        msg: 'search transcript section truncated',
        itemId,
        requestIndex,
        beforeLength,
        afterLength,
        limit: MAX_SEARCH_TRANSCRIPT_SECTION_LENGTH
      });
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to log search transcript truncation', itemId, requestIndex });
    }
  }

  return {
    requestPayload,
    responseBody
  };
}

function resolveDomain(inputUrl: string | null | undefined): string {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return 'unknown';
  }
  try {
    return new URL(inputUrl).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

function buildSourceDedupKey(source: SearchSource): string {
  const domain = resolveDomain(typeof source.url === 'string' ? source.url : null);
  const title = typeof source.title === 'string' ? source.title.trim().toLowerCase() : '';
  const normalizedUrl = typeof source.url === 'string' ? source.url.trim().toLowerCase() : '';
  const urlHash = createHash('sha1').update(normalizedUrl).digest('hex');
  return `${domain}|${title}|${urlHash}`;
}

export async function collectSearchContexts({
  searchTerm,
  searchInvoker,
  logger,
  itemId,
  target,
  reviewNotes,
  shouldSearch,
  plannerDecision,
  missingSchemaFields: providedMissingFields,
  reviewerSkip,
  transcriptWriter
}: CollectSearchContextOptions): Promise<CollectSearchContextsResult> {
  const resolvedMaxPlans = Number.isFinite(searchLimits.maxPlans) && searchLimits.maxPlans > 0
    ? Math.floor(searchLimits.maxPlans)
    : 1;
  try {
    logger?.info?.({
      msg: 'resolved search plan limit',
      itemId,
      maxPlans: resolvedMaxPlans,
      configuredMaxPlans: searchLimits.maxPlans
    });
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to log resolved search plan limit', itemId });
  }
  const resolvedTarget = resolveTarget(target ?? null, logger, itemId);
  const searchContexts: SearchContext[] = [];
  const seenSourceKeys = new Set<string>();
  const sourceDomainCounts = new Map<string, number>();
  const retrievalMetrics = {
    uniqueQueries: new Set<string>(),
    uniqueDomains: new Set<string>(),
    duplicateSuppressionCount: 0
  };
  const aggregatedSources: SearchSource[] = [];
  const missingSchemaFields = Array.isArray(providedMissingFields) && providedMissingFields.length
    ? providedMissingFields
    : identifyMissingSchemaFields(resolvedTarget);

  if (missingSchemaFields.length > 0) {
    logger?.debug?.({
      msg: 'search planner missing field snapshot',
      itemId,
      missingFields: missingSchemaFields.slice(0, 10)
    });
  }

  const recordSources = (newSources: SearchSource[] = []): void => {
    try {
      if (!Array.isArray(newSources)) {
        return;
      }
      for (const source of newSources) {
        if (!source) continue;
        const description =
          typeof source.description === 'string' && source.description.trim()
            ? source.description.trim()
            : typeof source.content === 'string' && source.content.trim()
              ? source.content.trim()
              : '';
        const key = buildSourceDedupKey(source);
        const domain = resolveDomain(typeof source.url === 'string' ? source.url : null);
        if (key && seenSourceKeys.has(key)) {
          retrievalMetrics.duplicateSuppressionCount += 1;
          continue;
        }
        const domainCount = sourceDomainCounts.get(domain) ?? 0;
        if (domainCount >= MAX_SOURCES_PER_DOMAIN_PER_BATCH) {
          retrievalMetrics.duplicateSuppressionCount += 1;
          continue;
        }
        if (key) {
          seenSourceKeys.add(key);
        }
        sourceDomainCounts.set(domain, domainCount + 1);
        retrievalMetrics.uniqueDomains.add(domain);
        if (description && description !== source.description) {
          aggregatedSources.push({ ...source, description });
        } else {
          aggregatedSources.push(source);
        }
      }
    } catch (err) {
      logger?.error?.({ err, msg: 'failed to record sources', itemId });
    }
  };

  const buildAggregatedSearchText = () => {
    const maxParagraphsPerSource = 3;
    const urlRegex = /https?:\/\/\S+/gi;
    const separatorRegex = /^([-=*_])\1{2,}$/;
    const specLikeLineRegex =
      /\b(artikel|preis|price|modell?|model|\d+(?:[.,]\d+)?\s?(?:mm|cm|kg|g|w|kw|v)|[a-z]{1,4}[\-_/]?\d{2,}[a-z0-9\-_/]*)\b/i;

    const sanitizeSourceText = (rawText: string, query: string, sourceIndex: number): string => {
      try {
        if (!rawText || !rawText.trim()) {
          return rawText;
        }
        const paragraphs = rawText.split(/\n\s*\n/);
        const sanitizedParagraphs: string[] = [];
        let preservedSpecLineCount = 0;

        const isSpecLikeLine = (line: string): boolean => specLikeLineRegex.test(line);

        for (const paragraph of paragraphs) {
          if (sanitizedParagraphs.length >= maxParagraphsPerSource) {
            break;
          }
          const cleanedLines = paragraph
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .filter((line) => !separatorRegex.test(line))
            .filter((line) => {
              const urlMatches = line.match(urlRegex);
              if (!urlMatches) {
                return true;
              }
              const isSpecLike = isSpecLikeLine(line);
              if (urlMatches.length >= 2) {
                if (isSpecLike) {
                  preservedSpecLineCount += 1;
                }
                return isSpecLike;
              }
              const shouldDropSingleUrlLine = urlMatches.length === 1 && line.length > 80;
              if (shouldDropSingleUrlLine && isSpecLike) {
                preservedSpecLineCount += 1;
              }
              return !(shouldDropSingleUrlLine && !isSpecLike);
            });

          const collapsed = cleanedLines.join(' ').replace(/\s+/g, ' ').trim();
          if (collapsed) {
            sanitizedParagraphs.push(collapsed);
          }
        }

        const sanitizedText = sanitizedParagraphs.join('\n\n');
        const originalLength = rawText.length;
        const sanitizedLength = sanitizedText.length;
        if (originalLength > 0 && sanitizedLength > 0) {
          const removalRatio = (originalLength - sanitizedLength) / originalLength;
          if (removalRatio > 0.3) {
            logger?.warn?.({
              msg: 'aggregated search text sanitized heavily',
              itemId,
              sourceIndex,
              searchQuery: query,
              originalLength,
              sanitizedLength,
              removalRatio: Number(removalRatio.toFixed(3)),
              preservedSpecLineCount
            });
          }
        }

        return sanitizedText || rawText;
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to sanitize aggregated search text', itemId, sourceIndex, searchQuery: query });
        return rawText;
      }
    };

    return searchContexts
      .map((ctx, index) => {
        const sanitizedText = sanitizeSourceText(ctx.text, ctx.query, index);
        return [`Search query ${index + 1}: ${ctx.query}`, sanitizedText].join('\n');
      })
      .join('\n\n-----\n\n');
  };

  const sanitizedReviewerNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';

  if (!shouldSearch) {
    try {
      logger?.info?.({
        msg: 'search execution skipped',
        itemId,
        reviewerSkip: Boolean(reviewerSkip),
        hasReviewerNotes: Boolean(sanitizedReviewerNotes),
        missingFields: missingSchemaFields.slice(0, 10),
        plannerShouldSearch: plannerDecision?.shouldSearch ?? null
      });
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to log search skip resolution', itemId });
    }

    return {
      searchContexts,
      aggregatedSources,
      recordSources,
      buildAggregatedSearchText
    };
  }

  const fallbackPlans = extractSearchPlans(searchTerm, resolvedTarget, logger, itemId);
  const baseQuery = `Gerätedaten ${searchTerm}`.trim();
  const basePlan = fallbackPlans.find((plan) => plan.query === baseQuery) ?? {
    query: baseQuery,
    metadata: { context: 'primary' }
  };

  const plannerPlans = Array.isArray(plannerDecision?.plans) ? (plannerDecision?.plans as SearchPlan[]) : [];
  if (plannerPlans.length > 0) {
    logger?.info?.({
      msg: 'search planner supplied plans',
      itemId,
      planCount: plannerPlans.length
    });
  }

  const fallbackWithoutPrimary = fallbackPlans.filter((plan) => plan.query !== baseQuery);
  let searchPlans: SearchPlan[] = [];
  if (plannerPlans.length > 0) {
    searchPlans = [basePlan, ...plannerPlans, ...fallbackWithoutPrimary];
  } else {
    searchPlans = fallbackPlans;
  }

  const filteredPlanResult = filterAndDiversifySearchPlans(searchPlans);
  searchPlans = filteredPlanResult.plans;
  retrievalMetrics.duplicateSuppressionCount +=
    filteredPlanResult.duplicateCount + filteredPlanResult.taxonomyRejectedCount;
  if (filteredPlanResult.taxonomyRejectedCount > 0) {
    logger?.warn?.({
      msg: 'taxonomy-targeted search plans rejected',
      itemId,
      taxonomyRejectedCount: filteredPlanResult.taxonomyRejectedCount
    });
  }
  const rankedPlans = searchPlans.length > resolvedMaxPlans ? rankPlansForLimit(searchPlans) : searchPlans;
  const limitedPlans = rankedPlans.slice(0, resolvedMaxPlans);

  if (rankedPlans.length > resolvedMaxPlans) {
    try {
      const droppedPlans = rankedPlans.slice(resolvedMaxPlans);
      logger?.warn?.({
        msg: 'search plan limit applied',
        itemId,
        requestedPlans: rankedPlans.length,
        limit: resolvedMaxPlans,
        truncatedPlans: droppedPlans.map((plan) => plan.query),
        truncatedPlanMetadata: droppedPlans.map((plan) => summarizePlanMetadata(plan))
      });
    } catch (err) {
      logger?.error?.({ err, msg: 'failed to log search plan truncation', itemId });
    }
  }

  for (const [index, plan] of limitedPlans.entries()) {
    retrievalMetrics.uniqueQueries.add(normalizeQuery(plan.query));
    const metadata = { ...plan.metadata, requestIndex: index };
    logger?.info?.({ msg: 'search start', searchQuery: plan.query, itemId, metadata });
    try {
      const result = await searchInvoker(plan.query, 10, metadata);
      const searchText = result?.text ?? '';
      const sources = Array.isArray(result?.sources) ? result.sources : [];
      searchContexts.push({ query: plan.query, text: searchText, sources });
      recordSources(sources);
      logger?.info?.({ msg: 'search complete', count: sources.length, itemId, requestIndex: index });

      try {
        const { requestPayload, responseBody } = buildSearchTranscriptSection(
          plan,
          metadata,
          sources,
          searchText,
          logger,
          itemId,
          index
        );

        await appendTranscriptSection(
          transcriptWriter,
          `search-context-${index + 1}`,
          requestPayload,
          responseBody,
          logger,
          itemId
        );
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to append search transcript section', itemId, requestIndex: index });
      }

      if (index === 0) {
        const truncatedText = typeof searchText === 'string'
          ? `${searchText.slice(0, 500)}${searchText.length > 500 ? '…' : ''}`
          : '';
        const topSourcesForLog = sources.slice(0, 3).map((source = {}) => ({
          url: typeof source.url === 'string' ? source.url : undefined,
          title:
            typeof source.title === 'string'
              ? `${source.title.slice(0, 200)}${source.title.length > 200 ? '…' : ''}`
              : undefined
        }));
        logger?.debug?.({
          msg: 'primary search context summary',
          itemId,
          textPreview: truncatedText,
          topSources: topSourcesForLog
        });
      }
    } catch (searchErr) {
      logger?.error?.({ err: searchErr, msg: 'search failed', searchQuery: plan.query, itemId, requestIndex: index });
      if (searchErr instanceof RateLimitError) {
        throw new FlowError('RATE_LIMITED', 'Search provider rate limited requests', searchErr.statusCode ?? 503);
      }
      throw new FlowError('SEARCH_FAILED', 'Failed to retrieve search results', 502, { cause: searchErr });
    }
  }

  logger?.info?.({
    msg: 'search retrieval metrics',
    itemId,
    uniqueQueries: retrievalMetrics.uniqueQueries.size,
    uniqueDomains: retrievalMetrics.uniqueDomains.size,
    duplicateSuppressionCount: retrievalMetrics.duplicateSuppressionCount
  });

  return {
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText
  };
}
