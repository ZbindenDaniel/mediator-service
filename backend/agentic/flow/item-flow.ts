// TODO(agent): Revisit item flow orchestration once planner surfaces richer item metadata requirements.
import { agentActorId } from '../config';
import type { AgenticResultPayload } from '../result-handler';
import { createRateLimiter, DEFAULT_DELAY_MS, type RateLimiterLogger } from '../utils/rate-limiter';
import { FlowError } from './errors';
import { type AgenticTarget } from './item-flow-schemas';
import { resolveShopwareMatch } from './item-flow-shopware';
import { collectSearchContexts, type SearchInvoker, type SearchInvokerMetadata } from './item-flow-search';
import { runExtractionAttempts, type ChatModel, type ExtractionLogger } from './item-flow-extraction';
import { searchShopwareRaw, isShopwareConfigured, type ShopwareSearchResult } from '../tools/shopware';
import { prepareItemContext } from './context';
import { loadPrompts } from './prompts';
import { dispatchAgenticResult } from './result-dispatch';

export interface ItemFlowLogger extends ExtractionLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
  debug?: Console['debug'];
}

export interface ItemFlowDependencies {
  llm: ChatModel;
  logger?: ItemFlowLogger;
  searchInvoker: SearchInvoker;
  rateLimiterLogger?: RateLimiterLogger;
  searchRateLimitDelayMs?: number;
  applyAgenticResult?: (payload: AgenticResultPayload) => Promise<void> | void;
  saveRequestPayload: (itemId: string, payload: unknown) => Promise<void> | void;
  markNotificationSuccess: (itemId: string) => Promise<void> | void;
  markNotificationFailure: (itemId: string, errorMessage: string) => Promise<void> | void;
  shopwareSearch?: (query: string, limit: number, logger?: ItemFlowLogger) => Promise<ShopwareSearchResult>;
}

export interface RunItemFlowInput {
  target: unknown;
  id?: string | null;
  search?: string | null;
  reviewNotes?: string | null;
  skipSearch?: boolean;
  maxAttempts?: number;
  cancellationSignal?: AbortSignal | null;
}

function buildCallbackPayload({
  itemId,
  itemData,
  searchQuery,
  status,
  needsReview,
  summary,
  reviewDecision,
  reviewNotes,
  reviewedBy,
  error,
  sources,
  actor
}: {
  itemId: string;
  itemData: AgenticTarget;
  searchQuery: string;
  status?: string;
  needsReview?: boolean;
  summary?: string;
  reviewDecision?: string | null;
  reviewNotes?: string | null;
  reviewedBy?: string | null;
  error?: string | null;
  sources?: unknown;
  actor?: string | null;
}): AgenticResultPayload {
  const resolvedStatus = status ?? (needsReview ? 'needs_review' : 'completed');
  const resolvedNeedsReview = typeof needsReview === 'boolean' ? needsReview : resolvedStatus !== 'completed';
  const resolvedSummary = summary ?? (resolvedNeedsReview ? 'Manual review required' : 'Item flow completed successfully');
  const resolvedReviewDecision = reviewDecision ?? (resolvedNeedsReview ? 'changes_requested' : 'approved');
  const resolvedReviewNotes = reviewNotes ?? null;
  const resolvedReviewedBy = reviewedBy ?? (resolvedReviewNotes ? 'supervisor-agent' : null);
  const resolvedActor = actor ?? agentActorId;
  const resolvedError = resolvedNeedsReview ? (error ?? 'Manual review required') : error ?? null;

  const itemPayload: Record<string, unknown> & { itemUUid: string } = {
    ...(itemData ?? {}),
    itemUUid: itemId,
    searchQuery
  };

  if (Array.isArray(sources) && sources.length > 0) {
    itemPayload.sources = sources;
  }

  return {
    itemId,
    status: resolvedStatus,
    error: resolvedError,
    needsReview: resolvedNeedsReview,
    summary: resolvedSummary,
    reviewDecision: resolvedReviewDecision,
    reviewNotes: resolvedReviewNotes,
    reviewedBy: resolvedReviewedBy,
    actor: resolvedActor,
    item: itemPayload
  };
}

export async function runItemFlow(input: RunItemFlowInput, deps: ItemFlowDependencies): Promise<AgenticResultPayload> {
  const logger = deps.logger ?? console;
  let resolvedItemId: string | null = null;
  const reviewerNotes = typeof input.reviewNotes === 'string' && input.reviewNotes.trim().length
    ? input.reviewNotes.trim()
    : null;
  const skipSearch = Boolean(input.skipSearch);

  try {
    const context = prepareItemContext(input, logger);
    const { itemId, target, searchTerm, checkCancellation } = context;
    resolvedItemId = itemId;

    const rateLimiter = createRateLimiter({
      delayMs: deps.searchRateLimitDelayMs ?? DEFAULT_DELAY_MS,
      logger: deps.rateLimiterLogger ?? logger
    });

    const baseSearchInvoker = deps.searchInvoker;
    const searchInvoker: SearchInvoker = async (query: string, limit: number, metadata?: SearchInvokerMetadata) => {
      checkCancellation();
      const result = await rateLimiter(() => baseSearchInvoker(query, limit, metadata), {
        ...metadata,
        query,
        maxResults: limit
      });
      checkCancellation();
      return result as Awaited<ReturnType<SearchInvoker>>;
    };

    const shopwareAvailable = isShopwareConfigured();
    const { format, extract, supervisor, categorizer, shopware } = await loadPrompts({
      itemId,
      logger,
      includeShopware: shopwareAvailable
    });

    checkCancellation();

    let shopwareResult: ShopwareSearchResult = { text: '', products: [] };
    if (shopwareAvailable) {
      try {
        checkCancellation();
        const searchFn = deps.shopwareSearch ?? searchShopwareRaw;
        shopwareResult = await searchFn(searchTerm, 5, logger);
        logger.info?.({ msg: 'shopware search attempted', productCount: shopwareResult.products.length, itemId });
        checkCancellation();
      } catch (err) {
        logger.error?.({ err, msg: 'shopware search invocation failed', itemId });
      }
    } else {
      logger.debug?.({ msg: 'shopware search skipped - configuration missing', itemId });
    }

    const shopwareShortcut = await resolveShopwareMatch({
      llm: deps.llm,
      logger,
      searchTerm,
      targetFormat: format,
      shopwarePrompt: shopware ?? null,
      shopwareResult,
      normalizedTarget: target,
      itemId
    });

    checkCancellation();

    if (shopwareShortcut) {
      const payload = buildCallbackPayload({
        itemId,
        itemData: shopwareShortcut.finalData,
        searchQuery: searchTerm,
        status: 'completed',
        needsReview: false,
        summary: shopwareShortcut.summary,
        reviewDecision: 'approved',
        reviewNotes: shopwareShortcut.reviewNotes ?? reviewerNotes,
        reviewedBy: shopwareShortcut.reviewedBy,
        error: null,
        sources: shopwareShortcut.sources
      });

      await dispatchAgenticResult({
        itemId,
        payload,
        logger,
        saveRequestPayload: deps.saveRequestPayload,
        applyAgenticResult: deps.applyAgenticResult,
        markNotificationSuccess: deps.markNotificationSuccess,
        markNotificationFailure: deps.markNotificationFailure,
        checkCancellation
      });

      return payload;
    }

    checkCancellation();

    const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
      searchTerm,
      searchInvoker,
      logger,
      itemId,
      target,
      reviewNotes: reviewerNotes,
      skipSearch
    });

    checkCancellation();

    const extractionResult = await runExtractionAttempts({
      llm: deps.llm,
      logger,
      itemId,
      maxAttempts: input.maxAttempts && input.maxAttempts > 0 ? Math.min(input.maxAttempts, 3) : 3,
      searchContexts,
      aggregatedSources,
      recordSources,
      buildAggregatedSearchText,
      extractPrompt: extract,
      targetFormat: format,
      supervisorPrompt: supervisor,
      categorizerPrompt: categorizer,
      searchInvoker,
      target,
      reviewNotes: reviewerNotes,
      skipSearch
    });

    checkCancellation();

    const finalData: AgenticTarget = { ...target, ...extractionResult.data, itemUUid: itemId };

    const payload = buildCallbackPayload({
      itemId,
      itemData: finalData,
      searchQuery: searchTerm,
      status: extractionResult.success ? 'completed' : 'needs_review',
      needsReview: !extractionResult.success,
      summary: extractionResult.success
        ? 'Item flow extraction completed successfully'
        : 'Supervisor requested manual review',
      reviewDecision: extractionResult.success ? 'approved' : 'changes_requested',
      reviewNotes: extractionResult.supervisor || reviewerNotes,
      reviewedBy: 'supervisor-agent',
      error: extractionResult.success ? null : 'Supervisor flagged issues',
      sources: extractionResult.sources
    });

    await dispatchAgenticResult({
      itemId,
      payload,
      logger,
      saveRequestPayload: deps.saveRequestPayload,
      applyAgenticResult: deps.applyAgenticResult,
      markNotificationSuccess: deps.markNotificationSuccess,
      markNotificationFailure: deps.markNotificationFailure,
      checkCancellation
    });

    return payload;
  } catch (err) {
    const log = deps.logger ?? console;
    if (err instanceof FlowError) {
      if (err.code === 'RUN_CANCELLED') {
        log.warn?.({ err, code: err.code, msg: 'run aborted due to cancellation', itemId: resolvedItemId ?? input.id ?? null });
      } else {
        log.error?.({ err, code: err.code, itemId: resolvedItemId ?? input.id ?? null });
      }
      throw err;
    }
    log.error?.({ err, itemId: resolvedItemId ?? input.id ?? null });
    throw new FlowError('INTERNAL_ERROR', 'Unexpected failure', 500, { cause: err });
  }
}
