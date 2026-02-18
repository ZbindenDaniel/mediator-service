import { RateLimitError } from '../tools/tavily-client';
import { stringifyLangChainContent } from '../utils/langchain';
import type { SearchSource } from '../utils/source-formatter';
import { parseJsonWithSanitizer } from '../utils/json';
import { searchLimits } from '../config';
import { FlowError } from './errors';
import type { AgenticOutput, AgenticTarget } from './item-flow-schemas';
import { AgentOutputSchema, TargetSchema, logSchemaKeyTelemetry, normalizeSpezifikationenBoundary } from './item-flow-schemas';
import { runCategorizerStage } from './item-flow-categorizer';
import { isUsablePrice, runPricingStage } from './item-flow-pricing';
import type { SearchInvoker } from './item-flow-search';
import {
  appendPlaceholderFragment,
  PROMPT_PLACEHOLDERS,
  resolvePromptPlaceholders,
  type PromptPlaceholderFragments
} from './prompts';
import { appendTranscriptSection, type AgentTranscriptWriter, type TranscriptSectionPayload } from './transcript';

export interface ChatModel {
  invoke(messages: Array<{ role: string; content: unknown }>): Promise<{ content: unknown }>;
}

export interface ExtractionLogger {
  debug?: Console['debug'];
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

// TODO(agent): Monitor extraction target snapshots as schema fields grow to avoid prompt overflow.
export interface RunExtractionOptions {
  llm: ChatModel;
  correctionModel?: ChatModel;
  logger?: ExtractionLogger;
  itemId: string;
  maxAttempts: number;
  maxAgentSearchesPerRequest?: number;
  searchContexts: { query: string; text: string; sources: SearchSource[] }[];
  aggregatedSources: SearchSource[];
  recordSources: (sources: SearchSource[]) => void;
  buildAggregatedSearchText: () => string;
  extractPrompt: string;
  correctionPrompt: string;
  targetFormat: string;
  supervisorPrompt: string;
  categorizerPrompt: string;
  pricingPrompt: string;
  searchInvoker: SearchInvoker;
  target: AgenticTarget;
  reviewNotes?: string | null;
  skipSearch?: boolean;
  exampleItemBlock?: string | null;
  transcriptWriter?: AgentTranscriptWriter | null;
}

export interface ExtractionResult {
  success: boolean;
  data: AgenticOutput;
  supervisor: string;
  sources: SearchSource[];
}

// Removed duplicate IterationOutcome definition; only the discriminated union below is used.

const MAX_LOG_STRING_LENGTH = 500;
const MAX_LOG_ARRAY_LENGTH = 7;
const MAX_LOG_OBJECT_KEYS = 10;
const MAX_LOG_DEPTH = 2;
const MAX_RETRY_SUMMARY_LENGTH = 260;
// TODO(migration): Remove legacy identifier logging/stripping once all agent outputs are Artikel_Nummer-only.
const LEGACY_IDENTIFIER_KEYS = ['itemUUid', 'itemId', 'id'] as const;
const TARGET_SNAPSHOT_MAX_LENGTH = 2000;
const ACCUMULATOR_TEXT_MAX_LENGTH = 280;
const ACCUMULATOR_SUMMARY_MAX_LENGTH = 2400;
const ACCUMULATOR_OUTLINE_VALUE_MAX_LENGTH = 90;
const INTERNAL_ACCUMULATOR_KEYS = new Set<string>(['__searchQueries', ...LEGACY_IDENTIFIER_KEYS]);
const NULL_TARGET_TEMPLATE = Object.freeze(
  Object.keys(TargetSchema.shape).reduce<Record<string, null>>((acc, key) => {
    acc[key] = null;
    return acc;
  }, {})
);

// TODO(agent): Replace heuristic tool-call detection once providers expose structured parse errors.
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return '';
}

function extractRawContentFromError(err: unknown): string | null {
  if (!err || typeof err !== 'object') {
    return null;
  }
  if (typeof (err as { raw?: unknown }).raw === 'string') {
    return (err as { raw?: unknown }).raw as string;
  }
  const response = (err as { response?: { data?: unknown; message?: unknown } }).response;
  if (response) {
    if (typeof response.data === 'string') {
      return response.data;
    }
    if (typeof response.message === 'string') {
      return response.message;
    }
  }
  if (typeof (err as { data?: unknown }).data === 'string') {
    return (err as { data?: unknown }).data as string;
  }
  return null;
}

function isOllamaToolCallParseError(err: unknown): { match: boolean; rawText?: string } {
  const message = extractErrorMessage(err).toLowerCase();
  const toolCallParseIssue = message.includes('tool call') || message.includes('toolcall') || message.includes("invalid character '#'");
  return { match: toolCallParseIssue, rawText: extractRawContentFromError(err) ?? (toolCallParseIssue ? extractErrorMessage(err) : undefined) };
}

function withNoToolCallInstruction(messages: Array<{ role: string; content: unknown }>): Array<{ role: string; content: unknown }> {
  const toolCallWarning = 'IMPORTANT: Do not trigger or reference tool calls. Respond with plain JSON text that matches the target format only.';
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: 'system', content: toolCallWarning }];
  }
  const cloned = messages.map((message) => ({ ...message }));
  const firstMessage = cloned[0];
  if (typeof firstMessage?.content === 'string') {
    cloned[0] = { ...firstMessage, content: `${firstMessage.content}\n\n${toolCallWarning}` };
  } else {
    cloned.unshift({ role: 'system', content: toolCallWarning });
  }
  return cloned;
}

function truncateForLog(value: string, maxLength = MAX_LOG_STRING_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function truncateForPrompt(value: string, maxLength = MAX_RETRY_SUMMARY_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

// TODO(agent): Simplify search query handling once prompt guidance is revisited.
function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateForLog(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_LOG_DEPTH) {
      return `[Array(${value.length})]`;
    }
    const sliced = value.slice(0, MAX_LOG_ARRAY_LENGTH).map((entry) => sanitizeForLog(entry, depth + 1));
    if (value.length > MAX_LOG_ARRAY_LENGTH) {
      sliced.push(`…(+${value.length - MAX_LOG_ARRAY_LENGTH} more)`);
    }
    return sliced;
  }
  if (typeof value === 'object') {
    if (depth >= MAX_LOG_DEPTH) {
      return '[Object]';
    }
    const keys = Object.keys(value);
    const result: Record<string, unknown> = {};
    for (const key of keys.slice(0, MAX_LOG_OBJECT_KEYS)) {
      result[key] = sanitizeForLog((value as Record<string, unknown>)[key], depth + 1);
    }
    if (keys.length > MAX_LOG_OBJECT_KEYS) {
      result.__truncatedKeys = keys.length - MAX_LOG_OBJECT_KEYS;
    }
    return result;
  }
  return truncateForLog(String(value));
}

function extractLegacyIdentifiers(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const legacyIdentifiers: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;
  for (const key of LEGACY_IDENTIFIER_KEYS) {
    if (key in record) {
      const candidate = record[key];
      if (candidate !== undefined && candidate !== null && candidate !== '') {
        legacyIdentifiers[key] = candidate;
      }
    }
  }
  return legacyIdentifiers;
}

function stripLegacyIdentifiers(value: unknown): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of LEGACY_IDENTIFIER_KEYS) {
    if (key in record) {
      delete record[key];
    }
  }
}

function serializeCompactPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return '{}';
  }
}

type IterationOutcome =
  | { type: 'complete'; decisionPath: string }
  | { type: 'needs_more_search'; decisionPath: string; queries: string[] }
  | { type: 'retry_same_context'; decisionPath: string; reason: string; details?: Record<string, unknown> }
  | { type: 'failed_terminal'; decisionPath: string; reason: string };

function logIterationDecision(
  logger: ExtractionLogger | undefined,
  payload: { attempt: number; itemId: string; outcome: IterationOutcome; contextIndex: number }
): void {
  try {
    const serializedDecision = JSON.stringify({
      outcome: payload.outcome.type,
      reason: 'reason' in payload.outcome ? payload.outcome.reason : undefined,
      decisionPath: payload.outcome.decisionPath,
      details: 'details' in payload.outcome ? payload.outcome.details : undefined,
      queriesCount: 'queries' in payload.outcome ? payload.outcome.queries.length : undefined
    });
    logger?.info?.({
      msg: 'extraction iteration decision',
      attempt: payload.attempt,
      itemId: payload.itemId,
      contextIndex: payload.contextIndex,
      decisionPath: payload.outcome.decisionPath,
      outcome: payload.outcome.type,
      serializedDecision
    });
  } catch (err) {
    logger?.warn?.({
      err,
      msg: 'failed to serialize extraction iteration decision',
      attempt: payload.attempt,
      itemId: payload.itemId,
      contextIndex: payload.contextIndex,
      decisionPath: payload.outcome.decisionPath,
      outcome: payload.outcome.type
    });
  }
}

function truncateAccumulatorText(value: string, maxLength = ACCUMULATOR_TEXT_MAX_LENGTH): { value: string; truncated: boolean } {
  if (value.length <= maxLength) {
    return { value, truncated: false };
  }
  return {
    value: `<<TRUNCATED:${value.length}>>${value.slice(0, maxLength)}<<END_TRUNCATED>>`,
    truncated: true
  };
}

function summarizeOutlineValue(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return truncateAccumulatorText(value, ACCUMULATOR_OUTLINE_VALUE_MAX_LENGTH).value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  if (typeof value === 'object') {
    return `[object:${Object.keys(value as Record<string, unknown>).length}]`;
  }
  return truncateAccumulatorText(String(value), ACCUMULATOR_OUTLINE_VALUE_MAX_LENGTH).value;
}

function serializeExtractionAccumulator(accumulator: AgenticOutput | null): {
  summary: string;
  rawKeyCount: number;
  droppedFieldsCount: number;
  truncatedFieldsCount: number;
  usedFallbackOutline: boolean;
  serializedLength: number;
} {
  // TODO(agent): Tune accumulator summary thresholds based on prompt telemetry once usage stabilizes.
  try {
    if (!accumulator || typeof accumulator !== 'object') {
      return {
        summary: '{}',
        rawKeyCount: 0,
        droppedFieldsCount: 0,
        truncatedFieldsCount: 0,
        usedFallbackOutline: false,
        serializedLength: 2
      };
    }
    const inputRecord = accumulator as Record<string, unknown>;
    const rawEntries = Object.entries(inputRecord);
    const cleaned: Record<string, unknown> = {};
    let droppedFieldsCount = 0;
    let truncatedFieldsCount = 0;

    for (const [key, value] of rawEntries) {
      if (INTERNAL_ACCUMULATOR_KEYS.has(key)) {
        droppedFieldsCount += 1;
        continue;
      }
      if (value == null) {
        droppedFieldsCount += 1;
        continue;
      }
      if (typeof value === 'string') {
        const compact = value.trim();
        if (!compact) {
          droppedFieldsCount += 1;
          continue;
        }
        const truncated = truncateAccumulatorText(compact);
        if (truncated.truncated) {
          truncatedFieldsCount += 1;
        }
        cleaned[key] = truncated.value;
        continue;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          droppedFieldsCount += 1;
          continue;
        }
        cleaned[key] = value;
        continue;
      }
      if (typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>);
        if (keys.length === 0) {
          droppedFieldsCount += 1;
          continue;
        }
        cleaned[key] = value;
        continue;
      }
      cleaned[key] = value;
    }

    let summary = serializeCompactPayload(cleaned);
    let usedFallbackOutline = false;
    if (summary.length > ACCUMULATOR_SUMMARY_MAX_LENGTH) {
      usedFallbackOutline = true;
      const outlineLines = Object.entries(cleaned).map(([key, value]) => `${key}=${summarizeOutlineValue(value)}`);
      summary = outlineLines.length ? outlineLines.join('; ') : '{}';
    }

    return {
      summary,
      rawKeyCount: rawEntries.length,
      droppedFieldsCount,
      truncatedFieldsCount,
      usedFallbackOutline,
      serializedLength: summary.length
    };
  } catch {
    return {
      summary: '{}',
      rawKeyCount: 0,
      droppedFieldsCount: 0,
      truncatedFieldsCount: 0,
      usedFallbackOutline: false,
      serializedLength: 2
    };
  }
}

function mergeAccumulatedCandidate(
  accumulator: AgenticOutput | null,
  nextCandidate: AgenticOutput,
  context: { logger?: ExtractionLogger; itemId: string; attempt: number; passIndex: number }
): { success: true; data: AgenticOutput } | { success: false; issues: unknown } {
  try {
    const merged = { ...(accumulator ?? {}), ...nextCandidate };
    const mergedParse = AgentOutputSchema.safeParse(merged);
    if (!mergedParse.success) {
      context.logger?.warn?.({
        msg: 'failed to merge extraction accumulator',
        itemId: context.itemId,
        attempt: context.attempt,
        passIndex: context.passIndex,
        issues: mergedParse.error.issues
      });
      return { success: false, issues: mergedParse.error.issues };
    }
    return { success: true, data: mergedParse.data };
  } catch (err) {
    context.logger?.warn?.({
      err,
      msg: 'unexpected extraction accumulator merge failure',
      itemId: context.itemId,
      attempt: context.attempt,
      passIndex: context.passIndex
    });
    return { success: false, issues: err };
  }
}

interface CategoryValidationDecision {
  requiresSecondCategory: boolean;
  isValid: boolean;
  reason: string;
}

function resolveRequiresSecondCategory(payload: AgenticOutput): boolean {
  const record = payload as AgenticOutput & {
    requiresSecondCategory?: unknown;
    categoryRules?: { requiresSecondCategory?: unknown };
  };
  if (typeof record.requiresSecondCategory === 'boolean') {
    return record.requiresSecondCategory;
  }
  if (typeof record.categoryRules?.requiresSecondCategory === 'boolean') {
    return record.categoryRules.requiresSecondCategory;
  }
  return record.Hauptkategorien_B != null || record.Unterkategorien_B != null;
}

function validateSecondCategoryRequirement(payload: AgenticOutput): CategoryValidationDecision {
  const requiresSecondCategory = resolveRequiresSecondCategory(payload);
  if (!requiresSecondCategory) {
    return {
      requiresSecondCategory,
      isValid: true,
      reason: 'second category not required'
    };
  }

  if (payload.Hauptkategorien_B == null || payload.Unterkategorien_B == null) {
    return {
      requiresSecondCategory,
      isValid: false,
      reason: 'second category required but Hauptkategorien_B/Unterkategorien_B are incomplete'
    };
  }

  if (payload.Hauptkategorien_A != null && payload.Hauptkategorien_A === payload.Hauptkategorien_B) {
    return {
      requiresSecondCategory,
      isValid: false,
      reason: 'second main category must differ from Hauptkategorien_A when required'
    };
  }

  if (payload.Unterkategorien_A != null && payload.Unterkategorien_A === payload.Unterkategorien_B) {
    return {
      requiresSecondCategory,
      isValid: false,
      reason: 'second subcategory must differ from Unterkategorien_A when required'
    };
  }

  return {
    requiresSecondCategory,
    isValid: true,
    reason: 'second category requirement satisfied'
  };
}

// TODO(agent): Consolidate LLM-facing field alias helpers across extraction/categorizer/pricing stages.
function mapLangtextToSpezifikationenForLlm(
  payload: unknown,
  { itemId, logger, context }: { itemId: string; logger?: ExtractionLogger; context: string }
): unknown {
  try {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }
    const record = payload as Record<string, unknown>;
    if (!('Langtext' in record)) {
      return payload;
    }
    const remapped = { ...record, Spezifikationen: record.Langtext };
    delete (remapped as Record<string, unknown>).Langtext;
    logger?.debug?.({ msg: 'mapped Langtext to Spezifikationen for llm payload', itemId, context });
    return remapped;
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to map Langtext to Spezifikationen for llm payload', itemId, context });
    return payload;
  }
}

// TODO(agentic-spezifikationen): Keep boundary normalization in item-flow-schemas.ts as the single Spezifikationen ingestion path.

// TODO(agent): Refactor extraction attempt orchestration into explicit iteration pipeline.
export async function runExtractionAttempts({
  llm,
  correctionModel,
  logger,
  itemId,
  maxAttempts,
  maxAgentSearchesPerRequest = searchLimits.maxAgentQueriesPerRequest,
  searchContexts,
  aggregatedSources,
  recordSources,
  buildAggregatedSearchText,
  extractPrompt,
  correctionPrompt,
  targetFormat,
  supervisorPrompt,
  categorizerPrompt,
  pricingPrompt,
  searchInvoker,
  target,
  reviewNotes,
  skipSearch,
  exampleItemBlock,
  transcriptWriter
}: RunExtractionOptions): Promise<ExtractionResult> {
  let lastRaw = '';
  let lastValidated: { success: true; data: AgenticOutput } | null = null;
  let lastSupervision = '';
  let lastValidationIssues: unknown = null;
  let success = false;
  let itemContent = '';
  // TODO(agent): Capture invalid payload snippets for downstream observability and retention.
  let lastInvalidJsonPayload: { sanitizedPayload: string; thinkContent?: string } | null = null;
  let lastInvalidJsonErrorHint = '';
  // TODO(agent-placeholder): Persist placeholder detection telemetry for correction prompts.
  let lastInvalidJsonPlaceholderIssues: string[] = [];

  let attempt = 1;
  // TODO(agent): Revisit pass-level retry ceilings once extraction telemetry shows stable pass success rates.
  let contextCursor = 0;
  let passFailureSupervision = '';
  let passFailureValidationIssues: unknown = null;
  let passInvalidJsonErrorHint = '';
  let passInvalidJsonPlaceholderIssues: string[] = [];
  let extractionAccumulator: AgenticOutput | null = null;
  const { Artikel_Nummer: _promptHiddenItemId, ...promptFacingTargetRaw } = target;
  const promptFacingTarget = mapLangtextToSpezifikationenForLlm(promptFacingTargetRaw, { itemId, logger, context: 'extraction-target-snapshot' }) as Record<string, unknown>;
  // TODO(agent): Keep prompt-facing target redactions aligned with fields hidden from agents.
  const sanitizedTargetPreview = sanitizeForLog(promptFacingTarget);
  let serializedTargetSnapshot = '';
  try {
    serializedTargetSnapshot = JSON.stringify(promptFacingTarget, null, 2);
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to serialize target for extraction context', itemId });
  }
  const trimmedTargetSnapshot = serializedTargetSnapshot
    ? truncateForLog(serializedTargetSnapshot, TARGET_SNAPSHOT_MAX_LENGTH).trim()
    : '';
  const numericSearchLimit = Number(maxAgentSearchesPerRequest);
  const searchesPerRequestLimit = Number.isFinite(numericSearchLimit) && numericSearchLimit > 0
    ? Math.floor(numericSearchLimit)
    : 1;
  // TODO(agent): Cache pricing stage output per attempt to avoid redundant LLM calls during retries.
  // TODO(agent): Review search request limit telemetry after env overrides roll out.
  // TODO(agent): Add alerting thresholds for prompt segment sizes as prompts evolve.
  try {
    logger?.info?.({
      msg: 'resolved agent search request limit',
      itemId,
      maxAgentSearchesPerRequest: searchesPerRequestLimit,
      configuredMaxAgentSearchesPerRequest: maxAgentSearchesPerRequest
    });
  } catch (err) {
    logger?.warn?.({ err, msg: 'failed to log resolved agent search limit', itemId });
  }
  let searchRequestCycles = 0;
  const MAX_SEARCH_REQUEST_CYCLES = Math.max(3 * searchesPerRequestLimit, maxAttempts * searchesPerRequestLimit);
  const sanitizedReviewerNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
  const searchSkipped = Boolean(skipSearch);
  const advanceAttempt = () => {
    attempt += 1;
    searchRequestCycles = 0;
  };

  const dispatchIterationOutcome = async (outcome: IterationOutcome): Promise<'break' | 'continue'> => {
    logIterationDecision(logger, { attempt, itemId, outcome, contextIndex: contextCursor + 1 });

    if (outcome.type === 'complete') {
      success = true;
      return 'break';
    }

    if (outcome.type === 'failed_terminal') {
      lastSupervision = outcome.reason;
      passFailureSupervision = outcome.reason;
      lastValidationIssues = 'TOO_MANY_SEARCH_REQUESTS';
      passFailureValidationIssues = 'TOO_MANY_SEARCH_REQUESTS';
      return 'break';
    }

    if (outcome.type === 'needs_more_search') {
      const previousContextCount = searchContexts.length;
      for (const [index, query] of outcome.queries.entries()) {
        try {
          const { text: extraText, sources: extraSources } = await searchInvoker(query, 5, {
            context: 'agent',
            attempt,
            requestIndex: index + 1
          });
          searchContexts.push({ query, text: extraText, sources: extraSources });
          recordSources(extraSources);
          logger?.info?.({ msg: 'additional search complete', query, sourceCount: Array.isArray(extraSources) ? extraSources.length : 0, itemId });
        } catch (searchErr) {
          logger?.error?.({ err: searchErr, msg: 'additional search failed', query, itemId });
          if (searchErr instanceof RateLimitError) {
            throw new FlowError('RATE_LIMITED', 'Search provider rate limited requests', searchErr.statusCode ?? 503);
          }
          throw new FlowError('SEARCH_FAILED', 'Failed to retrieve search results', 502, { cause: searchErr });
        }
      }
      lastSupervision = `ADDITIONAL_SEARCH_REQUESTED: ${outcome.queries.join(' | ')}`;
      passFailureSupervision = lastSupervision;
      lastValidated = null;
      lastValidationIssues = '__SEARCH_REQUESTED__';
      passFailureValidationIssues = '__SEARCH_REQUESTED__';
      try {
        contextCursor = Math.max(contextCursor + 1, previousContextCount);
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to advance extraction cursor after additional search', itemId, attempt, contextIndex: contextCursor + 1 });
      }
      return 'continue';
    }

    if (outcome.reason === 'CONTEXT_ADVANCE') {
      const nextPassIndex = contextCursor + 1;
      if (nextPassIndex < Math.max(1, searchContexts.length)) {
        try {
          contextCursor = nextPassIndex;
          passFailureSupervision = '';
          passFailureValidationIssues = null;
          passInvalidJsonErrorHint = '';
          passInvalidJsonPlaceholderIssues = [];
          logger?.info?.({
            msg: 'advancing extraction context pass',
            attempt,
            itemId,
            contextIndex: contextCursor + 1,
            completedPassIndex: contextCursor,
            totalPasses: Math.max(1, searchContexts.length)
          });
        } catch (err) {
          logger?.warn?.({ err, msg: 'failed to advance extraction context cursor', itemId, attempt, contextIndex: contextCursor + 1 });
        }
      }
      return 'continue';
    }

    const nextAttempt = attempt + 1;
    logger?.info?.({
      msg: 'retrying extraction attempt',
      attempt,
      nextAttempt,
      itemId,
      reason: outcome.reason,
      contextIndex: contextCursor + 1,
      validationIssuesPreview: sanitizeForLog(outcome.details)
    });
    advanceAttempt();
    return 'continue';
  };

  // TODO(agentic-review-prompts): Route review automation signals into placeholder fragments as triggers expand.
  const basePromptFragments: PromptPlaceholderFragments = new Map();
  // TODO(agentic-schema-injection): Revisit whether categorizer/supervisor require reduced schema slices once prompt sizes are measured.
  appendPlaceholderFragment(basePromptFragments, PROMPT_PLACEHOLDERS.extractionReview, sanitizedReviewerNotes);
  appendPlaceholderFragment(basePromptFragments, PROMPT_PLACEHOLDERS.categorizerReview, sanitizedReviewerNotes);
  appendPlaceholderFragment(basePromptFragments, PROMPT_PLACEHOLDERS.supervisorReview, sanitizedReviewerNotes);
  appendPlaceholderFragment(basePromptFragments, PROMPT_PLACEHOLDERS.targetSchemaFormat, targetFormat);
  const resolvedExampleItemBlock = typeof exampleItemBlock === 'string' ? exampleItemBlock.trim() : '';
  if (resolvedExampleItemBlock) {
    basePromptFragments.set(PROMPT_PLACEHOLDERS.exampleItem, [resolvedExampleItemBlock]);
  }

  if (searchSkipped) {
    appendPlaceholderFragment(
      basePromptFragments,
      PROMPT_PLACEHOLDERS.extractionReview,
      'Search skipped per reviewer guidance. Prioritize existing evidence.'
    );
    appendPlaceholderFragment(
      basePromptFragments,
      PROMPT_PLACEHOLDERS.categorizerReview,
      'Search skipped per reviewer guidance. Reuse existing extracted evidence only.'
    );
  }

  // TODO(agent): Keep retry metadata summaries compact as prompt guidance evolves.
  while (attempt <= maxAttempts) {
    logger?.debug?.({ msg: 'extraction attempt', attempt, itemId });

    // TODO(agent): Re-check prompt context assembly for further reductions after reviewer feedback.
    const totalPasses = Math.max(1, searchContexts.length);
    const fallbackContextText = (() => {
      try {
        return buildAggregatedSearchText();
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to build aggregated search text fallback', attempt, itemId, contextIndex: contextCursor + 1 });
        return '';
      }
    })();
    const activeContext = searchContexts[contextCursor] ?? { query: 'aggregated-fallback', text: fallbackContextText, sources: [] };
    const singleContextText = typeof activeContext?.text === 'string' ? activeContext.text : '';
    const accumulatorSummary = serializeExtractionAccumulator(extractionAccumulator);
    const compactAccumulator = accumulatorSummary.summary;

    let searchRequestHint = searchesPerRequestLimit === 1
      ? 'Need more info? Add one "__searchQueries" entry.'
      : `Need more info? Add up to ${searchesPerRequestLimit} "__searchQueries" entries.`;
    if (searchSkipped) {
      searchRequestHint = `${searchRequestHint} Only request searches if reviewer notes require it.`;
    }

    let reviewerInstructionBlock = '';
    try {
      const instructionLines: string[] = [];
      if (sanitizedReviewerNotes) {
        instructionLines.push(sanitizedReviewerNotes);
      }
      if (searchSkipped) {
        instructionLines.push('Search skipped per reviewer request. Minimize new searches.');
      }
      if (instructionLines.length > 0) {
        reviewerInstructionBlock = ['Reviewer:', ...instructionLines].join('\n');
        logger?.info?.({
          msg: 'appended reviewer instructions to extraction prompt',
          attempt,
          itemId,
          hasReviewerNotes: Boolean(sanitizedReviewerNotes),
          searchSkipped
        });
      }
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to assemble reviewer instructions', attempt, itemId });
      reviewerInstructionBlock = '';
    }

    try {
      logger?.info?.({
        msg: 'extraction context pass',
        attempt,
        itemId,
        contextIndex: contextCursor + 1,
        totalPasses,
        singleContextLength: singleContextText.length,
        accumulatorSizeEstimate: compactAccumulator.length,
        accumulatorRawKeyCount: accumulatorSummary.rawKeyCount,
        accumulatorSerializedLength: accumulatorSummary.serializedLength,
        accumulatorDroppedFieldsCount: accumulatorSummary.droppedFieldsCount,
        accumulatorTruncatedFieldsCount: accumulatorSummary.truncatedFieldsCount
      });
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to log extraction context pass metrics', attempt, itemId, contextIndex: contextCursor + 1 });
    }

    if (accumulatorSummary.usedFallbackOutline) {
      try {
        logger?.warn?.({
          msg: 'accumulator summary exceeded threshold; using compact key-value outline',
          attempt,
          itemId,
          contextIndex: contextCursor + 1,
          threshold: ACCUMULATOR_SUMMARY_MAX_LENGTH,
          accumulatorSerializedLength: accumulatorSummary.serializedLength,
          accumulatorRawKeyCount: accumulatorSummary.rawKeyCount,
          accumulatorDroppedFieldsCount: accumulatorSummary.droppedFieldsCount,
          accumulatorTruncatedFieldsCount: accumulatorSummary.truncatedFieldsCount
        });
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to log accumulator summary fallback warning', attempt, itemId, contextIndex: contextCursor + 1 });
      }
    }

    const contextSections: string[] = [];
    const reviewerNotesLineCount = sanitizedReviewerNotes ? sanitizedReviewerNotes.split('\n').length : 0;
    const targetSnapshotLineCount = trimmedTargetSnapshot ? trimmedTargetSnapshot.split('\n').length : 0;
    try {
      logger?.debug?.({
        msg: 'prompt segment size metrics',
        attempt,
        itemId,
        contextIndex: contextCursor + 1,
        totalPasses,
        reviewerNotesLength: sanitizedReviewerNotes.length,
        reviewerNotesLineCount,
        singleContextLength: singleContextText.length,
        targetSnapshotLength: trimmedTargetSnapshot.length,
        targetSnapshotLineCount,
        accumulatorSizeEstimate: compactAccumulator.length,
        accumulatorRawKeyCount: accumulatorSummary.rawKeyCount,
        accumulatorSerializedLength: accumulatorSummary.serializedLength,
        accumulatorDroppedFieldsCount: accumulatorSummary.droppedFieldsCount,
        accumulatorTruncatedFieldsCount: accumulatorSummary.truncatedFieldsCount,
        accumulatorFallbackOutline: accumulatorSummary.usedFallbackOutline
      });
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to log prompt segment size metrics', attempt, itemId, contextIndex: contextCursor + 1 });
    }

    if (reviewerInstructionBlock) {
      contextSections.push(reviewerInstructionBlock);
    }
    contextSections.push('Current search context:', singleContextText || 'None.');
    contextSections.push('Accumulated candidate (compact JSON):', compactAccumulator);
    contextSections.push(searchRequestHint);
    const baseUserContent = contextSections.join('\n\n');
    let userContent = baseUserContent;

    if (attempt > 1) {
      const retrySummaryLines: string[] = ['Retry summary (compact):'];
      const supervisionSummary = truncateForPrompt(passFailureSupervision?.trim?.() ?? 'None');
      retrySummaryLines.push(`Supervisor: ${supervisionSummary || 'None'}`);
      const validationSummaryParts: string[] = [];
      if (passFailureValidationIssues === 'INVALID_JSON') {
        const parseErrorHint = truncateForPrompt(passInvalidJsonErrorHint.trim() || 'Invalid JSON output.');
        validationSummaryParts.push(`Invalid JSON (${parseErrorHint}).`);
        if (passInvalidJsonPlaceholderIssues.length) {
          const placeholderSummary = truncateForPrompt(passInvalidJsonPlaceholderIssues.join(', '));
          validationSummaryParts.push(`Placeholders: ${placeholderSummary}.`);
        }
      } else if (Array.isArray(passFailureValidationIssues)) {
        const issueSummary = truncateForPrompt(JSON.stringify(passFailureValidationIssues));
        validationSummaryParts.push(`Schema issues: ${issueSummary}.`);
      } else if (passFailureValidationIssues) {
        validationSummaryParts.push(`Validation: ${truncateForPrompt(String(passFailureValidationIssues))}.`);
      }
      if (validationSummaryParts.length) {
        retrySummaryLines.push(`Error hint: ${validationSummaryParts.join(' ')}`);
      }
      const retrySections = [retrySummaryLines.join('\n')];
      const retrySectionLengths = retrySections.map((section) => section.length);
      try {
        logger?.debug?.({
          msg: 'retry prompt section size metrics',
          attempt,
          itemId,
          retrySectionsCount: retrySections.length,
          retrySectionLengths,
          retrySectionsLength: retrySectionLengths.reduce((total, length) => total + length, 0)
        });
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to log retry prompt size metrics', attempt, itemId });
      }
      userContent = [retrySections.join('\n\n'), baseUserContent].join('\n\n');
    }

    if (trimmedTargetSnapshot) {
      userContent = [
        userContent,
        'Normalized target snapshot (truncated for context):',
        trimmedTargetSnapshot
      ].join('\n\n');
      logger?.debug?.({
        msg: 'appended target snapshot to extraction prompt',
        attempt,
        itemId,
        targetPreview: sanitizedTargetPreview
      });
    } else {
      logger?.debug?.({
        msg: 'target snapshot unavailable for extraction prompt',
        attempt,
        itemId,
        targetPreview: sanitizedTargetPreview
      });
    }

    const extractionPromptFragments: PromptPlaceholderFragments = new Map(basePromptFragments);
    if (attempt > 1 && passFailureValidationIssues === 'INVALID_JSON') {
      appendPlaceholderFragment(
        extractionPromptFragments,
        PROMPT_PLACEHOLDERS.extractionReview,
        `Retry guidance: previous response failed JSON validation (${passInvalidJsonErrorHint || 'invalid-json'}).`
      );
    }
    const assembledExtractPrompt = resolvePromptPlaceholders({
      template: extractPrompt,
      fragments: extractionPromptFragments,
      logger,
      itemId,
      stage: 'extraction'
    });
    const systemPrompt = `${assembledExtractPrompt}\nTarget format:\n${targetFormat}`;
    try {
      logger?.debug?.({
        msg: 'extraction prompt length',
        attempt,
        itemId,
        systemLength: systemPrompt.length,
        userLength: userContent.length,
        promptLength: systemPrompt.length + userContent.length
      });
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to log extraction prompt length', attempt, itemId });
    }

    const extractionMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];
    let extractRes;
    let fallbackRaw = '';
    try {
      extractRes = await llm.invoke(extractionMessages);
    } catch (err) {
      const { match: ollamaToolCallError, rawText } = isOllamaToolCallParseError(err);
      fallbackRaw = rawText?.trim?.() ?? '';
      if (ollamaToolCallError) {
        const fallbackMessages = withNoToolCallInstruction(extractionMessages);
        const toolCallInstructionAdded = fallbackMessages[0]?.content !== extractionMessages[0]?.content;
        logger?.warn?.({
          err,
          msg: 'extraction llm invocation failed - possible tool call parse issue',
          attempt,
          itemId,
          fallbackRawPreview: truncateForLog(fallbackRaw),
          toolCallInstructionAdded
        });
        try {
          extractRes = await llm.invoke(fallbackMessages);
          logger?.info?.({
            msg: 'retried extraction without tool calls after parse failure',
            attempt,
            itemId,
            toolCallInstructionAdded
          });
        } catch (fallbackErr) {
          const recoveredRaw = extractRawContentFromError(fallbackErr) ?? fallbackRaw ?? extractErrorMessage(fallbackErr);
          const flowErr = new FlowError('MODEL_INVOCATION_PARSE_ERROR', 'Model invocation failed due to tool-call parsing', 502, {
            cause: fallbackErr,
            context: { provider: 'ollama', stage: 'extraction' }
          });
          logger?.warn?.({
            err: fallbackErr,
            msg: 'fallback extraction invocation failed after disabling tool calls',
            attempt,
            itemId,
            recoveredRawPreview: truncateForLog(recoveredRaw)
          });
          if (recoveredRaw) {
            extractRes = { content: recoveredRaw };
            logger?.info?.({
              msg: 'continuing with recovered raw content after tool call parse failure',
              attempt,
              itemId,
              hasRecoveredRaw: true
            });
          } else {
            const nextAttempt = attempt + 1;
            lastValidationIssues = flowErr.code;
            lastSupervision = flowErr.message;
            passFailureValidationIssues = flowErr.code;
            passFailureSupervision = flowErr.message;
            logger?.info?.({
              msg: 'retrying extraction attempt',
              attempt,
              nextAttempt,
              itemId,
              reason: flowErr.code,
              hadRecoveredRaw: Boolean(recoveredRaw)
            });
            advanceAttempt();
            continue;
          }
        }
      } else {
        logger?.error?.({ err, msg: 'extraction llm invocation failed', attempt, itemId });
        throw err;
      }
    }

    const raw = stringifyLangChainContent(extractRes?.content, {
      context: 'itemFlow.extract',
      logger
    });
    lastRaw = raw;

    const extractionTranscriptPayload: TranscriptSectionPayload = {
      request: { targetPreview: sanitizedTargetPreview, attempt },
      messages: extractionMessages,
      response: raw
    };

    try {
      await appendTranscriptSection(
        transcriptWriter,
        `${attempt}. extraction attempt`,
        extractionTranscriptPayload,
        raw,
        logger,
        itemId
      );
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to append extraction transcript section', itemId, attempt, contextIndex: contextCursor + 1 });
    }

    let thinkContent = '';
    itemContent = raw;
    const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      thinkContent = thinkMatch[1]?.trim?.() ?? '';
      if (typeof thinkMatch.index === 'number') {
        const afterThink = raw.slice(thinkMatch.index + thinkMatch[0].length).trim();
        itemContent = afterThink;
      } else {
        logger?.debug?.({
          msg: 'think match missing index metadata, using raw content for parsing',
          attempt,
          itemId
        });
      }
    }

    const jsonMatch = itemContent.match(/\{[\s\S]*\}/);
     if (jsonMatch) {
      const jsonContent = jsonMatch[0]?.trim?.() ?? '';
      if (typeof jsonMatch.index === 'number') {
        itemContent = jsonContent;
      }
    } else {
      logger?.debug?.({
        msg: 'json match missing. Trying again',
        attempt,
        itemId
      });

      advanceAttempt();
      continue;
    }

    let parsed: unknown = null;
    try {
      parsed = parseJsonWithSanitizer(itemContent, {
        loggerInstance: logger,
        context: { itemId, attempt, stage: 'extraction-agent', thinkContent }
      });
      lastInvalidJsonPayload = null;
      lastInvalidJsonErrorHint = '';
      lastInvalidJsonPlaceholderIssues = [];
      passInvalidJsonErrorHint = '';
      passInvalidJsonPlaceholderIssues = [];
    } catch (err) {
      const sanitizedPayload = typeof (err as { sanitized?: string }).sanitized === 'string'
        ? (err as { sanitized?: string }).sanitized?.trim() ?? ''
        : itemContent.trim();
      const thinkPreview = thinkContent.trim();
      const placeholderIssuesFromError = Array.isArray((err as { placeholderIssues?: Array<{ keyPath: string }> }).placeholderIssues)
        ? (err as { placeholderIssues: Array<{ keyPath: string }> }).placeholderIssues.map((issue) => issue.keyPath)
        : [];
      lastInvalidJsonPayload = {
        sanitizedPayload,
        thinkContent: thinkPreview || undefined
      };
      lastInvalidJsonErrorHint = err instanceof Error ? err.message : String(err);
      lastInvalidJsonPlaceholderIssues = placeholderIssuesFromError;
      logger?.warn?.({
        err,
        msg: 'attempt produced invalid JSON after sanitization',
        attempt,
        itemId,
        sanitizedSnippet: truncateForLog(sanitizedPayload),
        parseErrorHint: truncateForLog(lastInvalidJsonErrorHint),
        placeholderKeys: placeholderIssuesFromError,
        thinkPreview: truncateForLog(thinkPreview),
        rawSnippet: itemContent.slice(0, 500)
      });

      const correctionAgent = correctionModel ?? llm;
      const correctionSections = [
        'The assistant response could not be parsed as JSON. Fix only formatting issues without changing any values.',
        'Raw output:',
        itemContent.trim() || sanitizedPayload
      ];
      if (sanitizedPayload && sanitizedPayload !== itemContent.trim()) {
        correctionSections.push('Sanitized attempt:', sanitizedPayload);
      }
      if (thinkPreview) {
        correctionSections.push('Think content (do not include in JSON):', thinkPreview);
      }
      if (lastInvalidJsonPlaceholderIssues.length) {
        const placeholderMessage = `Placeholder tokens detected at: ${lastInvalidJsonPlaceholderIssues.join(', ')}. Replace them with null or a concrete string.`;
        const templatePreview = JSON.stringify(NULL_TARGET_TEMPLATE, null, 2);
        correctionSections.push('Parsing hint:', placeholderMessage);
        correctionSections.push('Template to replace placeholders:', templatePreview);
        logger?.debug?.({
          msg: 'added placeholder guidance for correction agent',
          attempt,
          itemId,
          placeholderKeys: lastInvalidJsonPlaceholderIssues,
          templatePreview: truncateForLog(templatePreview)
        });
      }

      let correctedContent: string | null = null;
      try {
        // TODO(agent): Capture correction agent telemetry once downstream metrics ingestion is available.
        logger?.info?.({
          msg: 'invoking json correction agent',
          attempt,
          itemId,
          hasThinkPreview: Boolean(thinkPreview)
        });
        const correctionMessages = [
          { role: 'system', content: correctionPrompt },
          { role: 'user', content: correctionSections.join('\n\n') }
        ];
        const correctionRes = await correctionAgent.invoke(correctionMessages);
        correctedContent = stringifyLangChainContent(correctionRes?.content, {
          context: 'itemFlow.jsonCorrection',
          logger
        }).trim();
      } catch (correctionErr) {
        logger?.error?.({
          err: correctionErr,
          msg: 'json correction agent invocation failed',
          attempt,
          itemId
        });
      }

      if (correctedContent) {
        try {
          parsed = parseJsonWithSanitizer(correctedContent, {
            loggerInstance: logger,
            context: { itemId, attempt, stage: 'extraction-json-correction', thinkContent }
          });
          lastInvalidJsonPayload = null;
          lastInvalidJsonErrorHint = '';
          lastInvalidJsonPlaceholderIssues = [];
          itemContent = correctedContent;
          logger?.info?.({
            msg: 'json correction agent repaired payload',
            attempt,
            itemId,
            correctedSnippet: truncateForLog(correctedContent)
          });
        } catch (parseAfterCorrectionErr) {
          const placeholderIssuesFromCorrection = Array.isArray((parseAfterCorrectionErr as { placeholderIssues?: Array<{ keyPath: string }> }).placeholderIssues)
            ? (parseAfterCorrectionErr as { placeholderIssues: Array<{ keyPath: string }> }).placeholderIssues.map((issue) => issue.keyPath)
            : [];
          lastInvalidJsonPlaceholderIssues = placeholderIssuesFromCorrection;
          logger?.warn?.({
            err: parseAfterCorrectionErr,
            msg: 'json correction agent output still invalid',
            attempt,
            itemId,
            correctionSnippet: truncateForLog(correctedContent),
            placeholderKeys: placeholderIssuesFromCorrection
          });
        }
      }

      if (!parsed) {
        lastSupervision = 'INVALID_JSON';
        lastValidationIssues = 'INVALID_JSON';
        passFailureSupervision = lastSupervision;
        passFailureValidationIssues = 'INVALID_JSON';
        passInvalidJsonErrorHint = lastInvalidJsonErrorHint;
        passInvalidJsonPlaceholderIssues = [...lastInvalidJsonPlaceholderIssues];
        const nextAttempt = attempt + 1;
        logger?.info?.({
          msg: 'retrying extraction attempt',
          attempt,
          nextAttempt,
          itemId,
          reason: 'INVALID_JSON',
          hasCorrectionAttempt: Boolean(correctedContent),
          parseErrorHint: truncateForLog(lastInvalidJsonErrorHint)
        });
        advanceAttempt();
        continue;
      }
    }

    const legacyIdentifiers = extractLegacyIdentifiers(parsed);
    if (Object.keys(legacyIdentifiers).length > 0) {
      logger?.warn?.({
        msg: 'legacy identifiers found in extraction payload',
        attempt,
        itemId,
        legacyIdentifiers: sanitizeForLog(legacyIdentifiers)
      });
    }

    const normalizedBoundary = normalizeSpezifikationenBoundary(parsed as unknown, {
      logger,
      itemId,
      attempt,
      stage: 'extraction-pre-validation'
    });
    const parsedRecord = normalizedBoundary.normalizedPayload && typeof normalizedBoundary.normalizedPayload === 'object'
      ? (normalizedBoundary.normalizedPayload as Record<string, unknown>)
      : null;

    let candidatePayload: unknown = normalizedBoundary.normalizedPayload;
    if (normalizedBoundary.issue) {
      lastValidated = null;
      lastSupervision = `Spezifikationen boundary normalization failed: ${normalizedBoundary.issue.message}`;
      lastValidationIssues = [normalizedBoundary.issue];
      passFailureSupervision = lastSupervision;
      passFailureValidationIssues = [normalizedBoundary.issue];
      const nextAttempt = attempt + 1;
      logger?.info?.({
        msg: 'retrying extraction attempt',
        attempt,
        nextAttempt,
        itemId,
        reason: 'SPEZIFIKATIONEN_NORMALIZATION_FAILED',
        validationIssuesPreview: sanitizeForLog([normalizedBoundary.issue])
      });
      advanceAttempt();
      continue;
    }
    logSchemaKeyTelemetry(logger, { stage: 'extraction', itemId, payload: candidatePayload });
    const rawQueries = parsedRecord?.__searchQueries;
    if (Array.isArray(rawQueries) && rawQueries.length > searchesPerRequestLimit) {
      const resolvedLimit = Number.isFinite(searchesPerRequestLimit) && searchesPerRequestLimit > 0
        ? Math.floor(searchesPerRequestLimit)
        : 1;
      const truncatedQueries = rawQueries.slice(0, resolvedLimit);
      candidatePayload = { ...(parsedRecord ?? {}), __searchQueries: truncatedQueries };
      try {
        logger?.warn?.({
          msg: 'truncating agent search queries before schema validation',
          itemId,
          attempt,
          configuredLimit: maxAgentSearchesPerRequest,
          effectiveLimit: resolvedLimit,
          requestedCount: rawQueries.length,
          allowedCount: resolvedLimit,
          truncatedQueriesPreview: sanitizeForLog(truncatedQueries)
        });
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to log search query truncation', itemId, attempt });
      }
    }
    // TODO(agent): Confirm extraction telemetry keeps Langtext/Spezifikationen key counts aligned after schema shifts.
    try {
      const langtextCandidate = parsedRecord?.Langtext;
      const spezifikationenCandidate = parsedRecord?.Spezifikationen;
      const isSpecObject = (candidate: unknown): candidate is Record<string, unknown> => (
        Boolean(candidate) && typeof candidate === 'object' && !Array.isArray(candidate)
      );
      const hasLangtextObject = isSpecObject(langtextCandidate);
      const hasSpezifikationenObject = isSpecObject(spezifikationenCandidate);
      const effectiveSpecs = hasLangtextObject ? langtextCandidate : (hasSpezifikationenObject ? spezifikationenCandidate : null);
      const specKeyCount = effectiveSpecs ? Object.keys(effectiveSpecs).length : 0;
      logger?.info?.({
        msg: 'extraction spec telemetry',
        itemId,
        attempt,
        specKeyCount,
        hasLangtextObject,
        hasSpezifikationenObject
      });
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to compute extraction spec telemetry', itemId, attempt });
    }
    const agentParsed = AgentOutputSchema.safeParse(candidatePayload);
    if (!agentParsed.success) {
      const issuePaths = agentParsed.error.issues.map((issue) => issue.path.join('.') || '(root)');
      logger?.warn?.({
        msg: 'schema validation failed',
        attempt,
        issues: agentParsed.error.issues,
        issuePaths,
        itemId,
        legacyIdentifiers: sanitizeForLog(legacyIdentifiers)
      });
      lastValidated = null;
      lastSupervision = `Schema validation failed: ${JSON.stringify(agentParsed.error.issues)}`;
      lastValidationIssues = agentParsed.error.issues;
      passFailureSupervision = lastSupervision;
      passFailureValidationIssues = agentParsed.error.issues;
      const schemaValidationOutcome: IterationOutcome = {
        type: 'retry_same_context',
        reason: 'SCHEMA_VALIDATION_FAILED',
        decisionPath: 'parse -> schema-validation-failed',
        details: { issues: agentParsed.error.issues }
      };
      if (await dispatchIterationOutcome(schemaValidationOutcome) === 'break') {
        break;
      }
      continue;
    }

    const parsedData = agentParsed.data as AgenticOutput & Record<string, unknown>;
    stripLegacyIdentifiers(parsedData);
    const { __searchQueries, ...candidateData } = parsedData;
    logger?.debug?.({
      msg: 'candidate data parsed',
      attempt,
      itemId,
      candidateDataPreview: sanitizeForLog(candidateData)
    });

    if (__searchQueries?.length) {
      logger?.info?.({ msg: 'extraction agent requested additional search', attempt, queries: __searchQueries, itemId });
      searchRequestCycles += 1;
      if (searchRequestCycles > MAX_SEARCH_REQUEST_CYCLES) {
        logger?.warn?.({
          msg: 'extraction agent exceeded search request limit',
          attempt,
          itemId,
          searchRequestCycles,
          maxSearchRequestCycles: MAX_SEARCH_REQUEST_CYCLES
        });
        const bestEffortMerge = mergeAccumulatedCandidate(extractionAccumulator, candidateData, {
          logger,
          itemId,
          attempt,
          passIndex: contextCursor + 1
        });
        if (bestEffortMerge.success) {
          extractionAccumulator = bestEffortMerge.data;
          lastValidated = { success: true, data: bestEffortMerge.data };
          lastValidationIssues = null;
          passFailureValidationIssues = null;
          logger?.info?.({
            msg: 'using best-effort extraction data after search limit reached',
            attempt,
            itemId,
            payloadPreview: sanitizeForLog(bestEffortMerge.data)
          });
        } else {
          const mergeIssues = (bestEffortMerge as { issues: unknown }).issues;
          lastValidated = { success: true, data: candidateData };
          lastValidationIssues = mergeIssues;
          passFailureValidationIssues = mergeIssues;
          logger?.warn?.({
            msg: 'best-effort merge failed after search limit reached',
            attempt,
            itemId,
            mergeIssues: sanitizeForLog(mergeIssues)
          });
        }
        const terminalOutcome: IterationOutcome = {
          type: 'failed_terminal',
          reason: 'TOO_MANY_SEARCH_REQUESTS',
          decisionPath: 'parse -> search-requested -> terminal-search-limit'
        };
        if (await dispatchIterationOutcome(terminalOutcome) === 'break') {
          break;
        }
        continue;
      }
      const queriesToProcess = __searchQueries.slice(0, 1);
      if (queriesToProcess.length < __searchQueries.length) {
        logger?.warn?.({
          msg: 'truncating agent search requests to configured limit',
          attempt,
          itemId,
          requestedCount: __searchQueries.length,
          allowedCount: 1
        });
      }
      const searchOutcome: IterationOutcome = {
        type: 'needs_more_search',
        decisionPath: 'parse -> search-requested',
        queries: queriesToProcess
      };
      if (await dispatchIterationOutcome(searchOutcome) === 'break') {
        break;
      }
      continue;
    }

    const mergedAccumulator = mergeAccumulatedCandidate(extractionAccumulator, candidateData, {
      logger,
      itemId,
      attempt,
      passIndex: contextCursor + 1
    });
    if (!mergedAccumulator.success) {
      const mergeIssues = (mergedAccumulator as { issues: unknown }).issues;
      lastValidated = null;
      lastSupervision = 'ACCUMULATOR_MERGE_FAILED';
      lastValidationIssues = mergeIssues;
      passFailureSupervision = lastSupervision;
      passFailureValidationIssues = mergeIssues;
      const mergeOutcome: IterationOutcome = {
        type: 'retry_same_context',
        reason: 'ACCUMULATOR_MERGE_FAILED',
        decisionPath: 'parse -> merge-accumulator-failed',
        details: { mergeIssues }
      };
      if (await dispatchIterationOutcome(mergeOutcome) === 'break') {
        break;
      }
      continue;
    }

    extractionAccumulator = mergedAccumulator.data;
    lastValidationIssues = null;
    passFailureValidationIssues = null;
    const incrementalParse = AgentOutputSchema.safeParse(extractionAccumulator);
    if (!incrementalParse.success) {
      lastValidated = null;
      lastSupervision = `INCREMENTAL_MERGE_SCHEMA_INVALID: ${JSON.stringify(incrementalParse.error.issues)}`;
      lastValidationIssues = incrementalParse.error.issues;
      passFailureSupervision = lastSupervision;
      passFailureValidationIssues = incrementalParse.error.issues;
      logger?.warn?.({
        msg: 'incremental accumulator validation failed',
        itemId,
        attempt,
        contextIndex: contextCursor + 1,
        issues: incrementalParse.error.issues
      });
      const incrementalValidationOutcome: {
        type: 'retry_same_context';
        reason: string;
        decisionPath: string;
        details: { issues: unknown };
      } = {
        type: 'retry_same_context',
        reason: 'INCREMENTAL_MERGE_SCHEMA_INVALID',
        decisionPath: 'parse -> merge-accumulator -> incremental-schema-invalid',
        details: { issues: incrementalParse.error.issues }
      };
      if (await dispatchIterationOutcome(incrementalValidationOutcome) === 'break') {
        break;
      }
      continue;
    }
    extractionAccumulator = incrementalParse.data;
    const nextPassIndex = contextCursor + 1;
    if (nextPassIndex < Math.max(1, searchContexts.length)) {
      const contextAdvanceOutcome: IterationOutcome = {
        type: 'retry_same_context',
        reason: 'CONTEXT_ADVANCE',
        decisionPath: 'parse -> merge-accumulator -> context-advance'
      };
      if (await dispatchIterationOutcome(contextAdvanceOutcome) === 'break') {
        break;
      }
      continue;
    }

    const validated = { success: true as const, data: extractionAccumulator };

    let enrichedValidated = validated;
    try {
      const assembledCategorizerPrompt = resolvePromptPlaceholders({
        template: categorizerPrompt,
        fragments: basePromptFragments,
        logger,
        itemId,
        stage: 'categorizer'
      });
      const categoryPatch = await runCategorizerStage({
        llm,
        logger,
        itemId,
        categorizerPrompt: assembledCategorizerPrompt,
        candidate: validated.data,
        reviewNotes: sanitizedReviewerNotes,
        skipSearch: searchSkipped,
        transcriptWriter
      });

      if (categoryPatch && Object.keys(categoryPatch).length > 0) {
        const mergedCandidate = { ...validated.data, ...categoryPatch };
        const mergedParse = AgentOutputSchema.safeParse(mergedCandidate);
        if (!mergedParse.success) {
          logger?.error?.({
            msg: 'categorizer merge failed schema validation',
            attempt,
            itemId,
            issues: mergedParse.error.issues
          });
          throw new FlowError('CATEGORIZER_MERGE_FAILED', 'Categorizer produced invalid category data', 422, {
            cause: mergedParse.error
          });
        }
        enrichedValidated = { success: true as const, data: mergedParse.data };
      }
    } catch (err) {
      logger?.error?.({ err, msg: 'categorizer stage failed', attempt, itemId });
      if (err instanceof FlowError) {
        throw err;
      }
      throw new FlowError('CATEGORIZER_FAILED', 'Categorizer stage failed', 500, { cause: err });
    }

    let pricedValidated = enrichedValidated;
    const hasPrice = isUsablePrice(enrichedValidated.data.Verkaufspreis);
    if (hasPrice) {
      logger?.info?.({ msg: 'pricing stage skipped - price already present', attempt, itemId });
    } else {
      let searchSummary: string | null = null;
      try {
        const aggregated = buildAggregatedSearchText();
        if (aggregated.trim()) {
          searchSummary = aggregated;
        }
      } catch (err) {
        logger?.warn?.({ err, msg: 'failed to prepare pricing search summary', attempt, itemId });
      }

      try {
        const pricingResult = await runPricingStage({
          llm,
          logger,
          itemId,
          pricingPrompt,
          candidate: enrichedValidated.data,
          searchSummary,
          reviewNotes: sanitizedReviewerNotes,
          transcriptWriter
        });

        if (pricingResult?.Verkaufspreis != null) {
          const mergedCandidate = { ...enrichedValidated.data, Verkaufspreis: pricingResult.Verkaufspreis };
          const mergedParse = AgentOutputSchema.safeParse(mergedCandidate);
          if (!mergedParse.success) {
            logger?.error?.({
              msg: 'pricing merge failed schema validation',
              attempt,
              itemId,
              issues: mergedParse.error.issues
            });
          } else {
            pricedValidated = { success: true as const, data: mergedParse.data };
          }
        } else {
          logger?.info?.({ msg: 'pricing stage yielded no price update', attempt, itemId });
        }
      } catch (err) {
        logger?.error?.({ err, msg: 'pricing stage failed', attempt, itemId });
      }
    }

    // TODO(agentic-supervisor-payload-contract): Move supervisor payload contract checks into a shared preflight helper if more stages consume it.
    const supervisorPayloadValidation = AgentOutputSchema.safeParse(pricedValidated.data);
    if (!supervisorPayloadValidation.success) {
      logger?.warn?.({
        msg: 'supervisor payload failed data-structure validation',
        attempt,
        itemId,
        issues: supervisorPayloadValidation.error.issues
      });
      lastValidated = null;
      lastValidationIssues = `SUPERVISOR_PAYLOAD_INVALID: ${JSON.stringify(supervisorPayloadValidation.error.issues)}`;
      passFailureValidationIssues = lastValidationIssues;
      const supervisorPayloadOutcome: IterationOutcome = {
        type: 'retry_same_context',
        reason: 'SUPERVISOR_PAYLOAD_INVALID',
        decisionPath: 'parse -> validation -> supervisor-payload-invalid',
        details: { issues: supervisorPayloadValidation.error.issues }
      };
      if (await dispatchIterationOutcome(supervisorPayloadOutcome) === 'break') {
        break;
      }
      continue;
    }

    logger?.debug?.({ msg: 'invoking supervisor agent', attempt, itemId });
    let supervisorUserContent = '';
    try {
      const supervisorItemPayload = mapLangtextToSpezifikationenForLlm(pricedValidated.data, {
        itemId,
        logger,
        context: 'supervisor'
      });
      supervisorUserContent = JSON.stringify(supervisorItemPayload);
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to serialize supervisor payload', attempt, itemId });
      supervisorUserContent = String(pricedValidated.data);
    }
    const assembledSupervisorPrompt = resolvePromptPlaceholders({
      template: supervisorPrompt,
      fragments: basePromptFragments,
      logger,
      itemId,
      stage: 'supervisor'
    });
    const supervisorMessages = [
      { role: 'system', content: assembledSupervisorPrompt },
      { role: 'user', content: supervisorUserContent }
    ];
    let supRes;
    try {
      supRes = await llm.invoke(supervisorMessages);
    } catch (err) {
      logger?.error?.({ err, msg: 'supervisor llm invocation failed', attempt, itemId });
      throw err;
    }
    const supervision = stringifyLangChainContent(supRes?.content, {
      context: 'itemFlow.supervisor',
      logger
    }).trim();

    const supervisorTranscriptPayload: TranscriptSectionPayload = {
      request: pricedValidated.data,
      messages: supervisorMessages,
      response: supervision
    };

    try {
      await appendTranscriptSection(transcriptWriter, 'supervisor', supervisorTranscriptPayload, supervision, logger, itemId);
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to append supervisor transcript section', itemId, attempt, contextIndex: contextCursor + 1 });
    }
    // TODO(agent): Broaden supervisor status parsing once additional workflow states are introduced.
    let normalizedSupervision = supervision;
    if ((normalizedSupervision.startsWith('"') && normalizedSupervision.endsWith('"'))
      || (normalizedSupervision.startsWith('\'') && normalizedSupervision.endsWith('\''))) {
      try {
        const parsedSupervisor = JSON.parse(normalizedSupervision);
        if (typeof parsedSupervisor === 'string') {
          normalizedSupervision = parsedSupervisor.trim();
          logger?.debug?.({
            msg: 'normalized quoted supervisor response',
            attempt,
            itemId,
            supervisionPreview: sanitizeForLog(normalizedSupervision)
          });
        }
      } catch (parseErr) {
        logger?.warn?.({
          err: parseErr,
          msg: 'failed to parse quoted supervisor response',
          attempt,
          itemId,
          supervisionPreview: sanitizeForLog(normalizedSupervision)
        });
        if (normalizedSupervision.length >= 2) {
          normalizedSupervision = normalizedSupervision.slice(1, -1).trim();
          logger?.debug?.({
            msg: 'stripped quotes from supervisor response after parse failure',
            attempt,
            itemId,
            supervisionPreview: sanitizeForLog(normalizedSupervision)
          });
        }
      }
    }
    normalizedSupervision = normalizedSupervision.trim();
    lastSupervision = normalizedSupervision;
    passFailureSupervision = normalizedSupervision;
    logger?.debug?.({
      msg: 'supervisor response received',
      attempt,
      itemId,
      supervisionPreview: sanitizeForLog(supervision)
    });
    const supervisorPass = normalizedSupervision.toLowerCase().includes('pass');
    let categoryValidationPass = true;
    if (supervisorPass) {
      // TODO(agent): Consider moving category validation into a shared policy helper when additional supervisor gates are introduced.
      try {
        const categoryDecision = validateSecondCategoryRequirement(pricedValidated.data);
        categoryValidationPass = categoryDecision.isValid;
        logger?.info?.({
          msg: 'supervisor category validation evaluated',
          attempt,
          itemId,
          supervisorPass,
          categoryValidationPass,
          requiresSecondCategory: categoryDecision.requiresSecondCategory,
          decisionReason: categoryDecision.reason,
          categorySnapshot: {
            Hauptkategorien_A: pricedValidated.data.Hauptkategorien_A ?? null,
            Unterkategorien_A: pricedValidated.data.Unterkategorien_A ?? null,
            Hauptkategorien_B: pricedValidated.data.Hauptkategorien_B ?? null,
            Unterkategorien_B: pricedValidated.data.Unterkategorien_B ?? null
          }
        });
      } catch (err) {
        categoryValidationPass = false;
        logger?.error?.({
          err,
          msg: 'supervisor category validation failed unexpectedly',
          attempt,
          itemId,
          supervisorPass,
          classificationPayload: sanitizeForLog(pricedValidated.data),
          decisionPath: 'supervisor-pass -> category-validation-exception'
        });
      }
    }
    const pass = supervisorPass && categoryValidationPass;

    lastValidated = pricedValidated;
    const evaluationOutcome: IterationOutcome = pass
      ? {
        type: 'complete',
        decisionPath: 'parse -> correction -> validation -> evaluation:pass'
      }
      : {
        type: 'retry_same_context',
        reason: 'SUPERVISOR_FEEDBACK',
        decisionPath: 'parse -> correction -> validation -> evaluation:retry',
        details: {
          supervisorPass,
          categoryValidationPass,
          supervisionPreview: sanitizeForLog(supervision)
        }
      };
    if (await dispatchIterationOutcome(evaluationOutcome) === 'break') {
      break;
    }
  }

  if (attempt > maxAttempts && !success && lastValidationIssues !== 'TOO_MANY_SEARCH_REQUESTS') {
    logger?.debug?.({ msg: 'extraction attempts exhausted', itemId, attempt, maxAttempts });
  }

  if (!lastValidated?.data) {
    const sanitizedIssues = sanitizeForLog(lastValidationIssues);
    const logBase = {
      msg: 'agent failed to produce valid data',
      itemId,
      itemContentPreview: sanitizeForLog(itemContent),
      lastValidationIssues: sanitizedIssues,
      sanitizedInvalidPayload: sanitizeForLog(lastInvalidJsonPayload?.sanitizedPayload ?? itemContent),
      thinkInvalidPreview: sanitizeForLog(lastInvalidJsonPayload?.thinkContent)
    };

    if (passFailureValidationIssues === 'INVALID_JSON') {
      logger?.error?.({ ...logBase, reason: 'INVALID_JSON' });
      throw new FlowError('INVALID_JSON', 'Agent failed to return valid JSON after retries', 500, {
        context: {
          invalidJsonPayload: lastInvalidJsonPayload?.sanitizedPayload?.trim?.() ?? itemContent.trim(),
          invalidThinkContent: lastInvalidJsonPayload?.thinkContent
        }
      });
    }

    if (Array.isArray(lastValidationIssues)) {
      logger?.error?.({
        ...logBase,
        reason: 'SCHEMA_VALIDATION_FAILED',
        validationIssuesPreview: sanitizeForLog(lastValidationIssues)
      });
      throw new FlowError('SCHEMA_VALIDATION_FAILED', 'Agent output failed schema validation after retries', 422);
    }

    if (lastValidationIssues === 'TOO_MANY_SEARCH_REQUESTS') {
      logger?.error?.({ ...logBase, reason: 'TOO_MANY_SEARCH_REQUESTS' });
      throw new FlowError('TOO_MANY_SEARCH_REQUESTS', 'Agent exceeded allowed additional search requests', 429);
    }

    logger?.error?.({ ...logBase, reason: 'EXTRACTION_FAILED' });
    throw new FlowError('EXTRACTION_FAILED', 'Agent failed to produce valid data after retries', 500);
  }

  if (success) {
    logger?.info?.({
      msg: 'extraction succeeded',
      itemId,
      payloadPreview: sanitizeForLog(lastValidated.data),
      supervisor: sanitizeForLog(lastSupervision)
    });
  }

  return {
    success,
    data: lastValidated.data,
    supervisor: lastSupervision,
    sources: aggregatedSources
  };
}
