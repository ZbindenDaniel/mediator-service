// TODO(agent): Monitor the impact of enriched item metadata on search heuristics and adjust weighting when planner feedback is available.
import type { SearchResult } from '../tools/tavily-client';
import { RateLimitError } from '../tools/tavily-client';
import type { SearchSource } from '../utils/source-formatter';
import { FlowError } from './errors';
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

type SearchPlan = {
  query: string;
  metadata: SearchInvokerMetadata;
};

function truncateValue(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
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

  const uniqueQueries = new Map<string, SearchPlan>();
  for (const plan of plans) {
    if (!uniqueQueries.has(plan.query)) {
      uniqueQueries.set(plan.query, plan);
    }
  }

  return Array.from(uniqueQueries.values());
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
  target
}: CollectSearchContextOptions): Promise<CollectSearchContextsResult> {
  const resolvedTarget = resolveTarget(target ?? null, logger, itemId);
  const searchPlans = extractSearchPlans(searchTerm, resolvedTarget, logger, itemId);

  const searchContexts: SearchContext[] = [];
  const seenSourceKeys = new Set<string>();
  const aggregatedSources: SearchSource[] = [];

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

  for (const [index, plan] of searchPlans.entries()) {
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

  const buildAggregatedSearchText = () =>
    searchContexts
      .map((ctx, index) => [`Search query ${index + 1}: ${ctx.query}`, ctx.text].join('\n'))
      .join('\n\n-----\n\n');

  return {
    searchContexts,
    aggregatedSources,
    recordSources,
    buildAggregatedSearchText
  };
}
