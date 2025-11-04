import fs from 'fs/promises';
import { modelConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { searchWebRaw } from '../tools/searchWeb.js';
import { searchShopwareRaw, isShopwareConfigured } from '../tools/searchShopware.js';
import { sendToExternal } from '../utils/externalApi.js';
import { createRateLimiter, DEFAULT_DELAY_MS } from '../utils/rateLimiter.js';
import { FlowError } from './errors.js';
import { TargetSchema, AgentOutputSchema } from './itemFlowSchemas.js';
import { resolveShopwareMatch } from './itemFlowShopware.js';
import { collectSearchContexts } from './itemFlowSearch.js';
import { runExtractionAttempts } from './itemFlowExtraction.js';
import {
  saveRequestPayload,
  markNotificationSuccess,
  markNotificationFailure,
} from '../utils/db.js';
import { throwIfCancelled } from './cancellation.js';

const formatPath = new URL('../prompts/item-format.json', import.meta.url);
const extractPromptPath = new URL('../prompts/extract.md', import.meta.url);
const supervisorPromptPath = new URL('../prompts/supervisor.md', import.meta.url);
const shopwarePromptPath = new URL('../prompts/shopware-verify.md', import.meta.url);

const configuredDelay = Number.parseInt(process.env.SEARCH_RATE_LIMIT_DELAY_MS ?? '', 10);
const searchRateLimiter = createRateLimiter({
  delayMs: Number.isFinite(configuredDelay) ? configuredDelay : DEFAULT_DELAY_MS,
  logger,
});

const rateLimitedSearch = (query, maxResults, metadata = {}) =>
  searchRateLimiter(() => searchWebRaw(query, maxResults), { ...metadata, query, maxResults });

const DEFAULT_ACTOR = typeof process.env.AGENT_ACTOR_ID === 'string' && process.env.AGENT_ACTOR_ID.trim().length
  ? process.env.AGENT_ACTOR_ID.trim()
  : 'item-flow-service';

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
  actor,
}) {
  const resolvedStatus = status ?? (needsReview ? 'needs_review' : 'completed');
  const resolvedNeedsReview = typeof needsReview === 'boolean' ? needsReview : resolvedStatus !== 'completed';
  const resolvedSummary = summary ?? (resolvedNeedsReview ? 'Manual review required' : 'Item flow completed successfully');
  const resolvedReviewDecision = reviewDecision ?? (resolvedNeedsReview ? 'changes_requested' : 'approved');
  const resolvedReviewNotes = reviewNotes ?? null;
  const resolvedReviewedBy = reviewedBy ?? (resolvedReviewNotes ? 'supervisor-agent' : null);
  const resolvedActor = actor ?? DEFAULT_ACTOR;
  const resolvedError = resolvedNeedsReview ? (error ?? 'Manual review required') : error ?? null;

  const itemPayload = {
    ...(itemData ?? {}),
    itemUUid: itemId,
    searchQuery,
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
    item: itemPayload,
  };
}

export async function runItemFlow(target, id, options = {}) {
  const resolvedTarget = target && typeof target === 'object' ? target : {};
  const providedId = typeof id === 'string' ? id.trim() : '';
  const targetId = typeof resolvedTarget.itemUUid === 'string' ? resolvedTarget.itemUUid.trim() : '';
  const itemId = providedId || targetId;

  if (!itemId) {
    const err = new FlowError('INVALID_TARGET', 'Target requires a non-empty "itemUUid"', 400);
    logger.error({ err, msg: 'target missing itemUUid' });
    throw err;
  }

  const artikelbeschreibung = typeof resolvedTarget.Artikelbeschreibung === 'string'
    ? resolvedTarget.Artikelbeschreibung.trim()
    : '';

  if (!artikelbeschreibung) {
    const err = new FlowError('INVALID_TARGET', 'Target requires a non-empty "Artikelbeschreibung"', 400);
    logger.error({ err, msg: 'target missing Artikelbeschreibung', itemId });
    throw err;
  }

  const normalizedTarget = {
    ...resolvedTarget,
    itemUUid: itemId,
    Artikelbeschreibung: artikelbeschreibung,
  };

  const searchTerm = typeof options.search === 'string' && options.search.trim().length
    ? options.search.trim()
    : artikelbeschreibung;

  const cancellationSignal = options?.cancellationSignal;
  const checkCancellation = () => {
    try {
      throwIfCancelled(itemId, cancellationSignal);
    } catch (err) {
      logger.warn({ err, msg: 'run cancellation detected', itemId });
      throw err;
    }
  };

  if (cancellationSignal?.addEventListener) {
    try {
      cancellationSignal.addEventListener(
        'abort',
        (event) => {
          const reason = event?.target?.reason;
          const reasonMessage =
            typeof reason?.message === 'string' && reason.message.trim().length
              ? reason.message.trim()
              : 'Run cancellation requested';
          logger.info({ msg: 'cancellation signal received', itemId, reason: reasonMessage });
        },
        { once: true },
      );
    } catch (err) {
      logger.error({ err, msg: 'failed to register cancellation listener', itemId });
    }
  }

  checkCancellation();

  const maxAttempts = options.maxAttempts || 3;
  const searchInvoker = typeof options.searchInvoker === 'function'
    ? async (query, maxResults, metadata = {}) => {
        checkCancellation();
        const result = await options.searchInvoker(query, maxResults, metadata);
        checkCancellation();
        return result;
      }
    : async (query, maxResults, metadata = {}) => {
        checkCancellation();
        const result = await rateLimitedSearch(query, maxResults, { itemId, ...metadata });
        checkCancellation();
        return result;
      };

  let llm;
  if (modelConfig.provider === 'ollama') {
    try {
      const { ChatOllama } = await import('@langchain/ollama');
      llm = new ChatOllama({
        baseUrl: modelConfig.ollama?.baseUrl || modelConfig.baseUrl,
        model: modelConfig.ollama?.model || modelConfig.model,
      });
    } catch (err) {
      logger.error({ err, msg: 'ollama provider requested but dependency unavailable', itemId });
      throw new FlowError(
        'OLLAMA_UNAVAILABLE',
        'Ollama provider requires the optional "@langchain/ollama" package to be installed.',
        500,
        { cause: err },
      );
    }
  } else if (modelConfig.provider === 'openai') {
    const { ChatOpenAI } = await import('@langchain/openai');
    llm = new ChatOpenAI({
      openAIApiKey: modelConfig.openai?.apiKey || modelConfig.apiKey,
      model: modelConfig.openai?.model || modelConfig.model,
      baseUrl: modelConfig.openai?.baseUrl || modelConfig.baseUrl,
    });
  } else {
    throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
  }

  try {
    checkCancellation();
    const [targetFormat, extractPrompt, supervisorPrompt] = await Promise.all([
      fs.readFile(formatPath, 'utf8'),
      fs.readFile(extractPromptPath, 'utf8'),
      fs.readFile(supervisorPromptPath, 'utf8'),
    ]);

    checkCancellation();

    const shopwareAvailable = isShopwareConfigured();

    let shopwarePrompt = null;
    if (shopwareAvailable) {
      try {
        checkCancellation();
        shopwarePrompt = await fs.readFile(shopwarePromptPath, 'utf8');
        checkCancellation();
      } catch (err) {
        logger.error({ err, msg: 'failed to load shopware prompt', itemId });
      }
    }

    let shopwareResult = { text: '', products: [] };
    if (shopwareAvailable) {
      try {
        checkCancellation();
        shopwareResult = await searchShopwareRaw(searchTerm, 5);
        logger.info({ msg: 'shopware search attempted', productCount: shopwareResult.products.length, itemId });
        checkCancellation();
      } catch (err) {
        logger.error({ err, msg: 'shopware search invocation failed', itemId });
      }
    } else {
      logger.debug({ msg: 'shopware search skipped - configuration missing', itemId });
    }

    const shopwareShortcut = await resolveShopwareMatch({
      llm,
      logger,
      searchTerm,
      targetFormat,
      shopwarePrompt,
      shopwareResult,
      normalizedTarget,
      itemId,
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
        sources: shopwareShortcut.sources,
      });

      await saveRequestPayload(itemId, payload);
      try {
        await sendToExternal(payload);
        await markNotificationSuccess(itemId);
      } catch (err) {
        logger.error({ err, msg: 'external api failed', itemId });
        await markNotificationFailure(itemId, err?.message ?? 'external notification failed');
      }
      return payload;
    }

    checkCancellation();
    const { searchContexts, aggregatedSources, recordSources, buildAggregatedSearchText } = await collectSearchContexts({
      searchTerm,
      searchInvoker,
      logger,
      itemId,
      FlowError,
    });

    checkCancellation();

    const extractionResult = await runExtractionAttempts({
      llm,
      logger,
      itemId,
      maxAttempts,
      searchContexts,
      aggregatedSources,
      recordSources,
      buildAggregatedSearchText,
      extractPrompt,
      targetFormat,
      supervisorPrompt,
      AgentOutputSchema,
      searchInvoker,
      FlowError,
    });

    checkCancellation();

    const finalData = { ...normalizedTarget, ...extractionResult.data, itemUUid: itemId };

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
      sources: extractionResult.sources,
    });

    await saveRequestPayload(itemId, payload);
    try {
      checkCancellation();
      await sendToExternal(payload);
      checkCancellation();
      await markNotificationSuccess(itemId);
    } catch (err) {
      logger.error({ err, msg: 'external api failed', itemId });
      await markNotificationFailure(itemId, err?.message ?? 'external notification failed');
    }

    return payload;
  } catch (err) {
    if (err instanceof FlowError) {
      if (err.code === 'RUN_CANCELLED') {
        logger.warn({ err, code: err.code, itemId, msg: 'run aborted due to cancellation' });
      } else {
        logger.error({ err, code: err.code, itemId });
      }
      throw err;
    }
    logger.error({ err, itemId });
    throw new FlowError('INTERNAL_ERROR', 'Unexpected failure', 500, { cause: err });
  }
}

export { FlowError, TargetSchema, AgentOutputSchema };
