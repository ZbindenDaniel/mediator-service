import { RateLimitError } from '../tools/tavily-client';
import { stringifyLangChainContent } from '../utils/langchain';
import { formatSourcesForRetry, type SearchSource } from '../utils/source-formatter';
import { parseJsonWithSanitizer } from '../utils/json';
import { FlowError } from './errors';
import type { AgenticOutput, AgenticTarget } from './item-flow-schemas';
import { AgentOutputSchema } from './item-flow-schemas';
import { runCategorizerStage } from './item-flow-categorizer';
import type { SearchInvoker } from './item-flow-search';

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
  logger?: ExtractionLogger;
  itemId: string;
  maxAttempts: number;
  maxAgentSearchesPerRequest?: number;
  searchContexts: { query: string; text: string; sources: SearchSource[] }[];
  aggregatedSources: SearchSource[];
  recordSources: (sources: SearchSource[]) => void;
  buildAggregatedSearchText: () => string;
  extractPrompt: string;
  targetFormat: string;
  supervisorPrompt: string;
  categorizerPrompt: string;
  searchInvoker: SearchInvoker;
  target: AgenticTarget;
  reviewNotes?: string | null;
  skipSearch?: boolean;
}

export interface ExtractionResult {
  success: boolean;
  data: AgenticOutput;
  supervisor: string;
  sources: SearchSource[];
}

const MAX_LOG_STRING_LENGTH = 500;
const MAX_LOG_ARRAY_LENGTH = 7;
const MAX_LOG_OBJECT_KEYS = 10;
const MAX_LOG_DEPTH = 2;
const TARGET_SNAPSHOT_MAX_LENGTH = 2000;

function truncateForLog(value: string, maxLength = MAX_LOG_STRING_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

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

export async function runExtractionAttempts({
  llm,
  logger,
  itemId,
  maxAttempts,
  maxAgentSearchesPerRequest = 1,
  searchContexts,
  aggregatedSources,
  recordSources,
  buildAggregatedSearchText,
  extractPrompt,
  targetFormat,
  supervisorPrompt,
  categorizerPrompt,
  searchInvoker,
  target,
  reviewNotes,
  skipSearch
}: RunExtractionOptions): Promise<ExtractionResult> {
  let lastRaw = '';
  let lastValidated: { success: true; data: AgenticOutput } | null = null;
  let lastSupervision = '';
  let lastValidationIssues: unknown = null;
  let success = false;
  let itemContent = '';

  let attempt = 1;
  const sanitizedTargetPreview = sanitizeForLog(target);
  let serializedTargetSnapshot = '';
  try {
    serializedTargetSnapshot = JSON.stringify(target, null, 2);
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
  let searchRequestCycles = 0;
  const MAX_SEARCH_REQUEST_CYCLES = Math.max(3 * searchesPerRequestLimit, maxAttempts * searchesPerRequestLimit);
  const sanitizedReviewerNotes = typeof reviewNotes === 'string' ? reviewNotes.trim() : '';
  const searchSkipped = Boolean(skipSearch);
  const advanceAttempt = () => {
    attempt += 1;
    searchRequestCycles = 0;
  };

  while (attempt <= maxAttempts) {
    logger?.debug?.({ msg: 'extraction attempt', attempt, itemId });

    let aggregatedSearchText = '';
    try {
      aggregatedSearchText = buildAggregatedSearchText();
    } catch (err) {
      logger?.warn?.({ err, msg: 'failed to build aggregated search text', attempt, itemId });
      aggregatedSearchText = '';
    }
    if (!aggregatedSearchText.trim() && searchSkipped) {
      aggregatedSearchText = 'No automated search results were generated because the reviewer requested manual focus.';
      logger?.info?.({ msg: 'extraction prompt noting skipped search', attempt, itemId });
    }

    let searchRequestHint = searchesPerRequestLimit === 1
      ? 'If you still require specific information, request up to one additional search by including a "__searchQueries" array in your JSON output.'
      : `If you still require specific information, request up to ${searchesPerRequestLimit} additional searches by including a "__searchQueries" array in your JSON output.`;
    if (searchSkipped) {
      searchRequestHint = `${searchRequestHint} Only trigger a new search if the reviewer notes demand it.`;
    }

    let reviewerInstructionBlock = '';
    try {
      const instructionLines: string[] = [];
      if (sanitizedReviewerNotes) {
        instructionLines.push(sanitizedReviewerNotes);
      }
      if (searchSkipped) {
        instructionLines.push('Search was skipped per reviewer request. Minimize new search requests.');
      }
      if (instructionLines.length > 0) {
        reviewerInstructionBlock = ['Reviewer instructions:', ...instructionLines].join('\n');
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

    const initialSections = ['Aggregated search context:', aggregatedSearchText, searchRequestHint];
    if (reviewerInstructionBlock) {
      initialSections.unshift(reviewerInstructionBlock);
    }

    let userContent = initialSections.join('\n\n');

    if (attempt > 1) {
      const formattedSources = formatSourcesForRetry(aggregatedSources, logger);
      const retrySections = [
        'Previous attempt failed or supervisor indicated issues.',
        `Supervisor feedback:\n${lastSupervision || 'None'}`,
        'Previous extraction raw output:',
        lastRaw ? lastRaw : 'None',
        'Sources:',
        formattedSources.join('\n'),
        'Aggregated search context:',
        aggregatedSearchText,
        searchesPerRequestLimit === 1
          ? 'Reminder: request at most one additional search by including a "__searchQueries" array when vital information is missing.'
          : `Reminder: request up to ${searchesPerRequestLimit} additional searches by including a "__searchQueries" array when vital information is missing.`
      ];
      if (reviewerInstructionBlock) {
        retrySections.splice(1, 0, reviewerInstructionBlock);
      }
      userContent = retrySections.join('\n\n');
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

    let extractRes;
    try {
      extractRes = await llm.invoke([
        { role: 'system', content: `${extractPrompt}\nTargetformat:\n${targetFormat}` },
        { role: 'user', content: userContent }
      ]);
    } catch (err) {
      logger?.error?.({ err, msg: 'extraction llm invocation failed', attempt, itemId });
      throw err;
    }

    const raw = stringifyLangChainContent(extractRes?.content, {
      context: 'itemFlow.extract',
      logger
    });
    lastRaw = raw;

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

    let parsed: unknown = null;
    try {
      parsed = parseJsonWithSanitizer(itemContent, {
        loggerInstance: logger,
        context: { itemId, attempt, stage: 'extraction-agent', thinkContent }
      });
    } catch (err) {
      logger?.warn?.({
        err,
        msg: 'attempt produced invalid JSON after sanitization',
        attempt,
        itemId,
        sanitizedSnippet: typeof (err as { sanitized?: string }).sanitized === 'string' ? (err as { sanitized?: string }).sanitized?.slice(0, 500) : undefined,
        rawSnippet: itemContent.slice(0, 500)
      });
      lastSupervision = 'INVALID_JSON';
      lastValidationIssues = 'INVALID_JSON';
      const nextAttempt = attempt + 1;
      logger?.info?.({
        msg: 'retrying extraction attempt',
        attempt,
        nextAttempt,
        itemId,
        reason: 'INVALID_JSON'
      });
      advanceAttempt();
      continue;
    }

    const agentParsed = AgentOutputSchema.safeParse(parsed);
    if (!agentParsed.success) {
      logger?.warn?.({ msg: 'schema validation failed', attempt, issues: agentParsed.error.issues, itemId });
      lastValidated = null;
      lastSupervision = `Schema validation failed: ${JSON.stringify(agentParsed.error.issues)}`;
      lastValidationIssues = agentParsed.error.issues;
      const nextAttempt = attempt + 1;
      logger?.info?.({
        msg: 'retrying extraction attempt',
        attempt,
        nextAttempt,
        itemId,
        reason: 'SCHEMA_VALIDATION_FAILED',
        validationIssuesPreview: sanitizeForLog(agentParsed.error.issues)
      });
      advanceAttempt();
      continue;
    }

    const { __searchQueries, ...candidateData } = agentParsed.data;
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
        lastSupervision = 'TOO_MANY_SEARCH_REQUESTS';
        lastValidated = { success: true, data: candidateData };
        lastValidationIssues = null;
        logger?.info?.({
          msg: 'using best-effort extraction data after search limit reached',
          attempt,
          itemId,
          payloadPreview: sanitizeForLog(candidateData)
        });
        break;
      }
      const queriesToProcess = __searchQueries.slice(0, searchesPerRequestLimit);
      if (queriesToProcess.length < __searchQueries.length) {
        logger?.warn?.({
          msg: 'truncating agent search requests to configured limit',
          attempt,
          itemId,
          requestedCount: __searchQueries.length,
          allowedCount: searchesPerRequestLimit
        });
      }
      for (const [index, query] of queriesToProcess.entries()) {
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
      lastSupervision = `ADDITIONAL_SEARCH_REQUESTED: ${queriesToProcess.join(' | ')}`;
      lastValidated = null;
      lastValidationIssues = '__SEARCH_REQUESTED__';
      logger?.info?.({
        msg: 'retrying extraction attempt',
        attempt,
        itemId,
        reason: 'ADDITIONAL_SEARCH_REQUEST',
        requestedQueriesPreview: sanitizeForLog(queriesToProcess)
      });
      continue;
    }

    const validated = { success: true as const, data: candidateData };
    lastValidationIssues = null;

    let enrichedValidated = validated;
    try {
      const categoryPatch = await runCategorizerStage({
        llm,
        logger,
        itemId,
        categorizerPrompt,
        candidate: validated.data,
        reviewNotes: sanitizedReviewerNotes,
        skipSearch: searchSkipped
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

    logger?.debug?.({ msg: 'invoking supervisor agent', attempt, itemId });
    let supRes;
    try {
      supRes = await llm.invoke([
        { role: 'system', content: supervisorPrompt },
        { role: 'user', content: JSON.stringify(enrichedValidated.data) }
      ]);
    } catch (err) {
      logger?.error?.({ err, msg: 'supervisor llm invocation failed', attempt, itemId });
      throw err;
    }
    const supervision = stringifyLangChainContent(supRes?.content, {
      context: 'itemFlow.supervisor',
      logger
    }).trim();
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
    logger?.debug?.({
      msg: 'supervisor response received',
      attempt,
      itemId,
      supervisionPreview: sanitizeForLog(supervision)
    });
    const pass = normalizedSupervision.toLowerCase().includes('pass');
    
    lastValidated = enrichedValidated;
    if (pass) {
      success = true;
      break;
    } else {
      const nextAttempt = attempt + 1;
      logger?.info?.({
        msg: 'supervisor flagged issues, will retry if attempts remain',
        attempt,
        nextAttempt,
        itemId,
        reason: 'SUPERVISOR_FEEDBACK',
        supervisionPreview: sanitizeForLog(supervision)
      });
      advanceAttempt();
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
      lastValidationIssues: sanitizedIssues
    };

    if (lastValidationIssues === 'INVALID_JSON') {
      logger?.error?.({ ...logBase, reason: 'INVALID_JSON' });
      throw new FlowError('INVALID_JSON', 'Agent failed to return valid JSON after retries', 500);
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
