import fs from 'fs/promises';
import path from 'path';
import { agentActorId } from '../config';
import type { AgenticResultPayload } from '../result-handler';
import { createRateLimiter, DEFAULT_DELAY_MS, type RateLimiterLogger } from '../utils/rate-limiter';
import { FlowError } from './errors';
import { TargetSchema, type AgenticTarget } from './item-flow-schemas';
import { resolveShopwareMatch } from './item-flow-shopware';
import { collectSearchContexts, type SearchInvoker, type SearchInvokerMetadata } from './item-flow-search';
import { runExtractionAttempts, type ChatModel, type ExtractionLogger } from './item-flow-extraction';
import { searchShopwareRaw, isShopwareConfigured, type ShopwareSearchResult } from '../tools/shopware';
import { throwIfCancelled } from './cancellation';

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
  maxAttempts?: number;
  cancellationSignal?: AbortSignal | null;
}

const PROMPTS_DIR = path.resolve(__dirname, '../prompts');
const FORMAT_PATH = path.join(PROMPTS_DIR, 'item-format.json');
const EXTRACT_PROMPT_PATH = path.join(PROMPTS_DIR, 'extract.md');
const SUPERVISOR_PROMPT_PATH = path.join(PROMPTS_DIR, 'supervisor.md');
const SHOPWARE_PROMPT_PATH = path.join(PROMPTS_DIR, 'shopware-verify.md');

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

function normalizeTarget(target: unknown, itemId: string): AgenticTarget {
  const candidate = (target && typeof target === 'object' ? target : {}) as Partial<AgenticTarget>;
  const artikelbeschreibung = typeof candidate.Artikelbeschreibung === 'string' ? candidate.Artikelbeschreibung.trim() : '';

  return {
    ...candidate,
    itemUUid: itemId,
    Artikelbeschreibung: artikelbeschreibung
  } as AgenticTarget;
}

function resolveItemId(target: unknown, providedId: string | undefined | null): { itemId: string; targetId: string } {
  const targetId =
    target && typeof target === 'object' && typeof (target as { itemUUid?: string }).itemUUid === 'string'
      ? (target as { itemUUid: string }).itemUUid.trim()
      : '';
  const itemId = typeof providedId === 'string' && providedId.trim().length ? providedId.trim() : targetId;
  return { itemId, targetId };
}

async function readPromptFile(promptPath: string, logger?: ItemFlowLogger, context?: Record<string, unknown>): Promise<string | null> {
  try {
    return await fs.readFile(promptPath, 'utf8');
  } catch (err) {
    logger?.error?.({ err, msg: 'failed to load prompt file', ...context });
    return null;
  }
}

export async function runItemFlow(input: RunItemFlowInput, deps: ItemFlowDependencies): Promise<AgenticResultPayload> {
  const logger = deps.logger ?? console;
  let resolvedItemId: string | null = null;

  try {
    const rateLimiter = createRateLimiter({
      delayMs: deps.searchRateLimitDelayMs ?? DEFAULT_DELAY_MS,
      logger: deps.rateLimiterLogger ?? logger
    });

    const { itemId, targetId } = resolveItemId(input.target, input.id);
    resolvedItemId = itemId;
    if (!itemId) {
      const err = new FlowError('INVALID_TARGET', 'Target requires a non-empty "itemUUid"', 400);
      logger.error?.({ err, msg: 'target missing itemUUid' });
      throw err;
    }

    let target: AgenticTarget;
    try {
      target = normalizeTarget(input.target, itemId);
      const parsed = TargetSchema.pick({ Artikelbeschreibung: true }).safeParse(target);
      if (!parsed.success || !parsed.data.Artikelbeschreibung.trim()) {
        const err = new FlowError('INVALID_TARGET', 'Target requires a non-empty "Artikelbeschreibung"', 400);
        logger.error?.({ err, msg: 'target missing Artikelbeschreibung', itemId });
        throw err;
      }
    } catch (err) {
      if (err instanceof FlowError) {
        throw err;
      }
      logger.error?.({ err, msg: 'target normalization failed', itemId, targetId });
      throw new FlowError('INVALID_TARGET', 'Failed to normalize target', 400, { cause: err });
    }

    const searchTerm = typeof input.search === 'string' && input.search.trim().length
      ? input.search.trim()
      : target.Artikelbeschreibung;

    const cancellationSignal = input.cancellationSignal ?? null;
    const checkCancellation = () => {
      try {
        throwIfCancelled(itemId, cancellationSignal);
      } catch (err) {
        logger.warn?.({ err, msg: 'run cancellation detected', itemId });
        throw err;
      }
    };

    if (cancellationSignal?.addEventListener) {
      try {
        cancellationSignal.addEventListener(
          'abort',
          (event) => {
            const reason = (event?.target as AbortSignal | undefined)?.reason;
            const reasonMessage =
              typeof (reason as { message?: string } | undefined)?.message === 'string' && reason?.message.trim().length
                ? reason.message.trim()
                : 'Run cancellation requested';
            logger.info?.({ msg: 'cancellation signal received', itemId, reason: reasonMessage });
          },
          { once: true }
        );
      } catch (err) {
        logger.error?.({ err, msg: 'failed to register cancellation listener', itemId });
      }
    }

    checkCancellation();

    const maxAttempts = input.maxAttempts && input.maxAttempts > 0 ? Math.min(input.maxAttempts, 5) : 3;
    const baseSearchInvoker = deps.searchInvoker;
    const searchInvoker: SearchInvoker = async (query, limit, metadata) => {
      checkCancellation();
      const result = await rateLimiter(() => baseSearchInvoker(query, limit, metadata), {
        ...metadata,
        query,
        maxResults: limit
      });
      checkCancellation();
      return result as Awaited<ReturnType<SearchInvoker>>;
    };

    let shopwarePrompt: string | null = null;
    let formatContent: string | null = null;
    let extractPrompt: string | null = null;
    let supervisorPrompt: string | null = null;

    try {
      [formatContent, extractPrompt, supervisorPrompt] = await Promise.all([
        readPromptFile(FORMAT_PATH, logger, { itemId, prompt: 'format' }),
        readPromptFile(EXTRACT_PROMPT_PATH, logger, { itemId, prompt: 'extract' }),
        readPromptFile(SUPERVISOR_PROMPT_PATH, logger, { itemId, prompt: 'supervisor' })
      ]);
      if (!formatContent || !extractPrompt || !supervisorPrompt) {
        throw new FlowError('PROMPT_LOAD_FAILED', 'Required prompts could not be loaded', 500);
      }
    } catch (err) {
      if (err instanceof FlowError) {
        throw err;
      }
      logger.error?.({ err, msg: 'failed to load prompts', itemId });
      throw new FlowError('PROMPT_LOAD_FAILED', 'Failed to load prompts', 500, { cause: err });
    }

    const shopwareAvailable = isShopwareConfigured();
    if (shopwareAvailable) {
      shopwarePrompt = await readPromptFile(SHOPWARE_PROMPT_PATH, logger, { itemId, prompt: 'shopware' });
    }

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
      targetFormat: formatContent,
      shopwarePrompt,
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
        reviewNotes: shopwareShortcut.reviewNotes,
        reviewedBy: shopwareShortcut.reviewedBy,
        error: null,
        sources: shopwareShortcut.sources
      });

      await deps.saveRequestPayload(itemId, payload);
      try {
        if (!deps.applyAgenticResult) {
          const error = new FlowError('RESULT_HANDLER_MISSING', 'Agentic result handler unavailable', 500);
          logger.error?.({ err: error, msg: 'result handler missing for internal dispatch', itemId });
          throw error;
        }
        await deps.applyAgenticResult(payload);
        await deps.markNotificationSuccess(itemId);
      } catch (err) {
        logger.error?.({ err, msg: 'agentic result dispatch failed', itemId });
        await deps.markNotificationFailure(
          itemId,
          err instanceof Error ? err.message : 'agentic result dispatch failed'
        );
        throw err;
      }
      return payload;
    }

    checkCancellation();
    const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
      searchTerm,
      searchInvoker,
      logger,
      itemId
    });

    checkCancellation();

    const extractionResult = await runExtractionAttempts({
      llm: deps.llm,
      logger,
      itemId,
      maxAttempts,
      searchContexts,
      aggregatedSources,
      recordSources,
      buildAggregatedSearchText,
      extractPrompt,
      targetFormat: formatContent,
      supervisorPrompt,
      searchInvoker
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
      reviewNotes: extractionResult.supervisor,
      reviewedBy: 'supervisor-agent',
      error: extractionResult.success ? null : 'Supervisor flagged issues',
      sources: extractionResult.sources
    });

    await deps.saveRequestPayload(itemId, payload);
    try {
      checkCancellation();
      if (!deps.applyAgenticResult) {
        const error = new FlowError('RESULT_HANDLER_MISSING', 'Agentic result handler unavailable', 500);
        logger.error?.({ err: error, msg: 'result handler missing for internal dispatch', itemId });
        throw error;
      }
      await deps.applyAgenticResult(payload);
      checkCancellation();
      await deps.markNotificationSuccess(itemId);
    } catch (err) {
      logger.error?.({ err, msg: 'agentic result dispatch failed', itemId });
      await deps.markNotificationFailure(
        itemId,
        err instanceof Error ? err.message : 'agentic result dispatch failed'
      );
      throw err;
    }

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
