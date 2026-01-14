// TODO(agent): Monitor the impact of enriched item metadata on search heuristics and adjust weighting when planner feedback is available.
// TODO(agent): Revisit the hard cap on generated search plans once telemetry confirms the typical query volume per item.
import { z } from 'zod';
import type { SearchResult } from '../tools/tavily-client';
import { RateLimitError } from '../tools/tavily-client';
import type { SearchSource } from '../utils/source-formatter';
import { stringifyLangChainContent } from '../utils/langchain';
import { parseJsonWithSanitizer } from '../utils/json';
import { searchLimits } from '../config';
import { FlowError } from './errors';
import type { ChatModel } from './item-flow-extraction';
import type { AgenticTarget } from './item-flow-schemas';

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
  'Marktpreis',
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
  reviewerSkip
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
        const key = source.url || `${source.title ?? ''}-${description}`;
        if (key && seenSourceKeys.has(key)) {
          continue;
        }
        if (key) {
          seenSourceKeys.add(key);
        }
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

  const buildAggregatedSearchText = () =>
    searchContexts
      .map((ctx, index) => [`Search query ${index + 1}: ${ctx.query}`, ctx.text].join('\n'))
      .join('\n\n-----\n\n');

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

  searchPlans = dedupeSearchPlans(searchPlans);
  const limitedPlans = searchPlans.slice(0, resolvedMaxPlans);

  if (searchPlans.length > resolvedMaxPlans) {
    try {
      logger?.warn?.({
        msg: 'search plan limit applied',
        itemId,
        requestedPlans: searchPlans.length,
        limit: resolvedMaxPlans,
        truncatedPlans: searchPlans.slice(resolvedMaxPlans).map((plan) => plan.query)
      });
    } catch (err) {
      logger?.error?.({ err, msg: 'failed to log search plan truncation', itemId });
    }
  }

  for (const [index, plan] of limitedPlans.entries()) {
    const metadata = { ...plan.metadata, requestIndex: index };
    logger?.info?.({ msg: 'search start', searchQuery: plan.query, itemId, metadata });
    try {
      const result = await searchInvoker(plan.query, 10, metadata);
      const searchText = result?.text ?? '';
      const sources = Array.isArray(result?.sources) ? result.sources : [];
      searchContexts.push({ query: plan.query, text: searchText, sources });
      recordSources(sources);
      logger?.info?.({ msg: 'search complete', count: sources.length, itemId, requestIndex: index });
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

  return {
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText
  };
}
