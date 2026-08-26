import { AGENTIC_REVIEW_SPEC_MAX_ENTRIES, AGENTIC_SNAPSHOT_SCHEMA_VERSION, type AgenticModelInvocationInput, type AgenticModelInvocationResult, type AgenticSnapshotFields, type LangtextPayload } from '../../models';
import {
  getItem,
  findByMaterial,
  getAgenticRun,
  getItemReference,
  updateAgenticRunStatus,
  upsertAgenticRun,
  insertAgenticRunReviewHistoryEntry,
  persistItemReference,
  logEvent,
  getAgenticRequestLog,
  persistAgenticRunError,
  persistAgenticSearchLinks,
  insertAgenticRunSnapshot,
  pruneAgenticRunSnapshots,
  saveAgenticRequestPayload,
  markAgenticRequestNotificationSuccess,
  markAgenticRequestNotificationFailure
} from '../db';
import { query as dbQuery } from '../db-client';
import { modelConfig, searchConfig } from './config';
import { runItemFlow } from './flow/item-flow';
import { selectExampleItemBlock, STATIC_EXAMPLE_ITEM_BLOCK } from './example-selector';
import type { ItemFlowLogger } from './flow/item-flow';
import type { ChatModel } from './flow/item-flow-extraction';
import type { AgenticTarget } from './flow/item-flow-schemas';
import { TavilySearchClient } from './tools/tavily-client';
import type { SearchResult } from './tools/tavily-client';
import { FlowError } from './flow/errors';
import { handleAgenticResult, type AgenticResultPayload } from './result-handler';
import { parseSequentialItemUUID } from '../lib/itemIds';
import type { SearchSource } from './utils/source-formatter';
import { ensureModelHttpTimeouts } from './utils/http-dispatcher';

// TODO(agent): Audit request payload merge rules whenever the AgenticTarget schema evolves.

export interface AgenticModelInvokerLogger extends ItemFlowLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
  debug?: Console['debug'];
}

export interface AgenticModelInvokerOptions {
  logger?: AgenticModelInvokerLogger;
}

// Keep the local model resident between calls so a cold VRAM load doesn't trip the request timeout on
// every invocation. Value is the Ollama keep-alive duration.
const OLLAMA_KEEP_ALIVE = '10m';
const LLM_RETRY_ATTEMPTS = 3;
const LLM_RETRY_BASE_DELAY_MS = 2000;

// Classify an LLM/HTTP transport failure as transient. With the header/body-timeout ceiling raised
// (ensureModelHttpTimeouts), a slow first token no longer trips UND_ERR_HEADERS_TIMEOUT — so retries
// here now cover only genuine transport drops (reset connection, network blip), where a re-send once the
// model is warm succeeds.
function isTransientLlmError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  const code = String((err as { code?: string }).code ?? cause?.code ?? '').toLowerCase();
  if (code && /headers_timeout|und_err|econnreset|etimedout|econnrefused|eai_again|enotfound|body_timeout/.test(code)) {
    return true;
  }
  const causeMessage = (cause?.message ?? '').toLowerCase();
  return /fetch failed|headers timeout|body timeout|timed out|timeout|socket hang up|econnreset|network|terminated/
    .test(`${message} ${causeMessage}`);
}

async function withLlmRetry<T>(
  op: () => Promise<T>,
  logger: AgenticModelInvokerLogger | undefined,
  label: string
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= LLM_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt >= LLM_RETRY_ATTEMPTS || !isTransientLlmError(err)) {
        throw err;
      }
      const backoffMs = LLM_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      logger?.warn?.({ err, msg: 'LLM transient failure; retrying', label, attempt, backoffMs });
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr ?? new Error('LLM invocation failed');
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

// Serialize retrieved search results to the LastSearchLinksJson shape that skipSearch reads back
// (a SearchSource[] with at least a description). Deduped by URL and capped, mirroring the terminal
// result-handler write so both writers store a uniform shape.
function serializeSearchSourcesForReuse(sources: SearchSource[]): string | null {
  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }
  const normalized: Array<{ url: string; title?: string; description?: string }> = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim() : undefined;
    const description =
      typeof source.description === 'string' && source.description.trim()
        ? source.description.trim()
        : typeof source.content === 'string' && source.content.trim()
          ? source.content.trim()
          : undefined;
    normalized.push({ url, title, description });
    if (normalized.length >= 25) break;
  }
  if (normalized.length === 0) {
    return null;
  }
  try {
    return JSON.stringify(normalized);
  } catch {
    return null;
  }
}

// The AI-written fields a run snapshot captures — the diff surface and what restore writes back.
const SNAPSHOT_FIELD_KEYS = [
  'Artikelbeschreibung',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge_mm',
  'Breite_mm',
  'Höhe_mm',
  'Gewicht_kg',
  'Verkaufspreis',
  'Hauptkategorien_A',
  'Unterkategorien_A',
  'Hauptkategorien_B',
  'Unterkategorien_B'
] as const;

function buildSnapshotFields(source: Record<string, unknown>): AgenticSnapshotFields {
  const out: Record<string, unknown> = {};
  for (const key of SNAPSHOT_FIELD_KEYS) {
    if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out as AgenticSnapshotFields;
}

const REVIEW_SPEC_FIELD_LIMIT = AGENTIC_REVIEW_SPEC_MAX_ENTRIES;
const REVIEW_SPEC_PREVIEW_LIMIT = 5;

// TODO(agentic-review-normalization): Revisit review directive phrasing if prompt transport adds structured review metadata.
function normalizeReviewSpecFieldList(params: {
  value: unknown;
  itemId: string;
  fieldName: 'missing_spec' | 'unneeded_spec';
  logger: AgenticModelInvokerLogger;
}): string[] {
  const { value, itemId, fieldName, logger } = params;
  try {
    if (!Array.isArray(value)) {
      if (value !== null && value !== undefined) {
        logger.warn?.({
          msg: 'agentic invocation ignored non-array review directive field',
          itemId,
          fieldName,
          valueType: typeof value
        });
      }
      return [];
    }

    const normalized = Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.replace(/\s+/g, ' ').trim())
          .filter((entry) => entry.length > 0)
      )
    )
      .sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }))
      .slice(0, REVIEW_SPEC_FIELD_LIMIT);

    logger.debug?.({
      msg: 'agentic invocation normalized review directive field',
      itemId,
      fieldName,
      count: normalized.length,
      sample: normalized.slice(0, REVIEW_SPEC_PREVIEW_LIMIT)
    });

    return normalized;
  } catch (err) {
    logger.warn?.({ err, msg: 'failed to normalize review directive field', itemId, fieldName });
    return [];
  }
}

function composeReviewNotes(params: {
  reviewNotes: string | null;
  missingSpecFields: string[];
  unneededSpecFields: string[];
}): string | null {
  const { reviewNotes, missingSpecFields, unneededSpecFields } = params;
  const fragments: string[] = [];
  if (reviewNotes) {
    fragments.push(reviewNotes);
  }
  if (missingSpecFields.length > 0) {
    fragments.push(`Missing spec fields to prioritize: ${missingSpecFields.join(', ')}.`);
  }
  if (unneededSpecFields.length > 0) {
    fragments.push(`Spec fields to remove if present: ${unneededSpecFields.join(', ')}.`);
  }
  return fragments.length > 0 ? fragments.join('\n\n') : null;
}

// TODO(agentic-review-prune): Extend pruning to additional structured spec containers when new schemas are introduced.
function pruneUnneededSpecFieldsFromTarget(params: {
  target: AgenticTarget;
  unneededSpecFields: string[];
  itemId: string;
  logger: AgenticModelInvokerLogger;
}): AgenticTarget {
  const { target, unneededSpecFields, itemId, logger } = params;
  if (unneededSpecFields.length === 0) {
    return target;
  }

  try {
    const langtextSource = target.Langtext;
    if (!langtextSource || typeof langtextSource !== 'object' || Array.isArray(langtextSource)) {
      logger.debug?.({
        msg: 'agentic invocation skipped unneeded spec pruning; target Langtext is not an object',
        itemId,
        langtextType: typeof langtextSource
      });
      return target;
    }

    const keysToRemove = new Set(unneededSpecFields.map((entry) => entry.toLowerCase()));
    const nextLangtext: Record<string, unknown> = { ...(langtextSource as Record<string, unknown>) };
    const removedFields: string[] = [];

    for (const key of Object.keys(nextLangtext)) {
      if (!keysToRemove.has(key.trim().toLowerCase())) {
        continue;
      }
      removedFields.push(key);
      delete nextLangtext[key];
    }

    if (removedFields.length === 0) {
      logger.info?.({
        msg: 'agentic invocation found no matching Langtext fields to prune',
        itemId,
        unneededSpecCount: unneededSpecFields.length
      });
      return target;
    }

    logger.info?.({
      msg: 'agentic invocation pruned reviewer-marked unneeded spec fields from target',
      itemId,
      removedSpecCount: removedFields.length,
      removedSpecSample: removedFields.slice(0, REVIEW_SPEC_PREVIEW_LIMIT)
    });

    return {
      ...target,
      Langtext: nextLangtext as LangtextPayload
    };
  } catch (err) {
    logger.warn?.({
      err,
      msg: 'agentic invocation failed to prune reviewer-marked unneeded spec fields',
      itemId
    });
    return target;
  }
}

// TODO(agent): Revisit Langtext serialization heuristics when upstream payloads evolve.
function buildTargetFromRow(
  row: Record<string, unknown>,
  logger: AgenticModelInvokerLogger | undefined
): Record<string, unknown> {
  const artikelNummer = normalizeString(row.Artikel_Nummer ?? row.artikelNummer ?? row.Artikelnummer);
  if (!artikelNummer) {
    logger?.warn?.({ msg: 'agentic target missing Artikel_Nummer in row payload' });
  }

  return {
    Artikel_Nummer: artikelNummer,
    Artikelbeschreibung: normalizeString(row.Artikelbeschreibung),
    Verkaufspreis: normalizeNullableNumber(row.Verkaufspreis),
    Kurzbeschreibung: normalizeString(row.Kurzbeschreibung),
    Langtext: row.Langtext ?? {},
    Hersteller: normalizeString(row.Hersteller),
    Länge_mm: normalizeNullableNumber(row.Länge_mm),
    Breite_mm: normalizeNullableNumber(row.Breite_mm),
    Höhe_mm: normalizeNullableNumber(row.Höhe_mm),
    Gewicht_kg: normalizeNullableNumber(row.Gewicht_kg)
  };
}

const TARGET_FIELD_KEYS: Array<keyof AgenticTarget> = [
  'Artikel_Nummer',
  'Artikelbeschreibung',
  'Verkaufspreis',
  'Kurzbeschreibung',
  'Langtext',
  'Hersteller',
  'Länge_mm',
  'Breite_mm',
  'Höhe_mm',
  'Gewicht_kg'
];

const TARGET_FIELD_SET = new Set<string>(TARGET_FIELD_KEYS);
const EXTRA_TARGET_KEYS = new Set(['__locked']);

const TARGET_KEY_ALIASES: Record<string, string> = {
  artikelbeschreibung: 'Artikelbeschreibung',
  artikel_beschreibung: 'Artikelbeschreibung',
  artikelbeschreibung_de: 'Artikelbeschreibung',
  artikelnummer: 'Artikel_Nummer',
  Artikelnummer: 'Artikel_Nummer',
  artikel_nummer: 'Artikel_Nummer'
};

function normalizeOverrideKey(rawKey: string): string | null {
  if (!rawKey) {
    return null;
  }

  if (TARGET_FIELD_SET.has(rawKey) || EXTRA_TARGET_KEYS.has(rawKey)) {
    return rawKey;
  }

  const directAlias = TARGET_KEY_ALIASES[rawKey];
  if (directAlias) {
    return directAlias;
  }

  const lowerKey = rawKey.toLowerCase();
  const lowerAlias = TARGET_KEY_ALIASES[lowerKey];
  if (lowerAlias) {
    return lowerAlias;
  }

  return null;
}

function extractOverrideSources(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const sources: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  const pushIfObject = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    if (seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    sources.push(candidate as Record<string, unknown>);
  };

  const payloadRecord = payload as Record<string, unknown>;
  pushIfObject(payloadRecord);
  pushIfObject(payloadRecord.target);
  pushIfObject(payloadRecord.requestBody);
  pushIfObject(payloadRecord.item);

  return sources;
}

function extractTargetOverrides(payload: unknown): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  for (const source of extractOverrideSources(payload)) {
    for (const [rawKey, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }

      const normalizedKey = normalizeOverrideKey(rawKey);
      if (!normalizedKey || normalizedKey === 'Artikel_Nummer') {
        continue;
      }

      if (normalizedKey === 'Artikelbeschreibung' && typeof value === 'string') {
        overrides[normalizedKey] = value.trim();
        continue;
      }

      overrides[normalizedKey] = value;
    }
  }

  return overrides;
}

export class AgenticModelInvoker {
  private readonly logger: AgenticModelInvokerLogger;
  private readonly searchClient: TavilySearchClient;
  private chatModel?: ChatModel;
  private visionChatModel?: ChatModel;
  private readonly applyAgenticResult: (payload: AgenticResultPayload) => void;
  private readonly persistAgenticRunError: (artikelNummer: string, errorMessage: string, attemptAt?: string) => void;
  // TODO(agentic-examples): Re-evaluate reviewed-example decision source if review lifecycle stores a dedicated final-decision field again.
  // Replaced sync SQLite statement with async Postgres query using canonical schema column names
  private async queryReviewedExamplesBySubcategory(artikelNummer: string): Promise<Array<Record<string, unknown>>> {
    return dbQuery(
      `SELECT
        r."Artikel_Nummer",
        r."Artikelbeschreibung",
        r."Kurzbeschreibung",
        r."Langtext",
        r."Hersteller",
        r."Länge_mm",
        r."Breite_mm",
        r."Höhe_mm",
        r."Gewicht_kg",
        r."Verkaufspreis",
        ar."ReviewState" AS "LastReviewDecision",
        ar."LastModified" AS "ReviewedAt"
      FROM item_refs r
      JOIN agentic_runs ar ON ar."Artikel_Nummer" = r."Artikel_Nummer"
      WHERE ROUND(NULLIF(r."Unterkategorien_A", '')::NUMERIC)::INTEGER = (
        SELECT ROUND(NULLIF(base."Unterkategorien_A", '')::NUMERIC)::INTEGER
        FROM item_refs base
        WHERE base."Artikel_Nummer" = $1
      )
        AND r."Artikel_Nummer" <> $1
        AND LOWER(COALESCE(ar."ReviewState", '')) = 'approved'
      ORDER BY ar."LastModified" DESC, ar."Id" DESC
      LIMIT 5`,
      [artikelNummer]
    );
  }

  constructor(options: AgenticModelInvokerOptions = {}) {
    this.logger = options.logger ?? console;
    this.searchClient = new TavilySearchClient({
      apiKey: searchConfig.tavilyApiKey,
      logger: this.logger
    });
    // TODO(agentic-error-handling): Align DB error persistence with future retry scheduling metadata once available.
    this.persistAgenticRunError = (artikelNummer: string, errorMessage: string, attemptAt?: string) => {
      try {
        persistAgenticRunError({ artikelNummer, error: errorMessage, attemptAt });
      } catch (err) {
        this.logger.warn?.({ err, msg: 'failed to persist agentic run error state', artikelNummer });
      }
    };
    this.applyAgenticResult = async (payload: AgenticResultPayload) => {
      try {
        await handleAgenticResult(
          { artikelNummer: payload.artikelNummer ?? '', payload },
          {
            ctx: {
              getItemReference,
              getAgenticRun,
              persistItemReference,
              updateAgenticRunStatus,
              upsertAgenticRun,
              insertAgenticRunReviewHistoryEntry,
              logEvent,
              getAgenticRequestLog
            },
            logger: this.logger
          }
        );
      } catch (err) {
        this.logger.error?.({
          err,
          msg: 'agentic result handler failed during in-process dispatch',
          artikelNummer: payload.artikelNummer ?? null
        });
        throw err;
      }
    };
  }

  /** Load a model for the configured provider using the shared API settings and the given model name. */
  private async loadModel(modelName: string | undefined): Promise<ChatModel> {
    // Move undici's fetch header/body-timeout wall BEFORE building any model client, so a slow first
    // token from a cold model isn't misclassified as a transport failure (root fix for the recurring
    // UND_ERR_HEADERS_TIMEOUT). Idempotent + best-effort; retry below stays as the fallback for genuine
    // transport drops.
    await ensureModelHttpTimeouts(this.logger);
    if (modelConfig.provider === 'ollama') {
      try {
        const module = await import('@langchain/ollama');
        const ChatOllama = module.ChatOllama;
        if (typeof ChatOllama !== 'function') {
          throw new Error('ChatOllama constructor unavailable');
        }
        // keepAlive keeps the model resident so subsequent calls skip the cold VRAM load that trips the
        // request timeout. Cast the options: keepAlive is a valid ChatOllama field but not always in the
        // published constructor typings.
        // numCtx: Ollama defaults to 2048 tokens, well below the extraction prompt (~6–7k tokens); the
        // prompt was silently left-truncated and the model returned an empty completion (the root cause of
        // the "json match missing"/EXTRACTION_FAILED loop). format: 'json' is an opt-in hard guard against
        // empty/prose output (off by default so a reasoning model's <think> phase isn't suppressed).
        const client = new ChatOllama({
          baseUrl: modelConfig.baseUrl,
          model: modelName,
          keepAlive: OLLAMA_KEEP_ALIVE,
          ...(typeof modelConfig.numCtx === 'number' ? { numCtx: modelConfig.numCtx } : {}),
          ...(modelConfig.formatJson ? { format: 'json' } : {})
        } as ConstructorParameters<typeof ChatOllama>[0]);
        this.logger.info?.({
          msg: 'loaded ollama chat model',
          model: modelName,
          numCtx: modelConfig.numCtx ?? null,
          formatJson: modelConfig.formatJson
        });
        const rawInvoke = (client as {
          invoke?: (messages: Array<{ role: string; content: unknown }>) => Promise<{ content?: unknown }>;
        }).invoke;
        if (typeof rawInvoke !== 'function') {
          const err = new Error('ChatOllama instance missing invoke method');
          this.logger.error?.({ err, msg: 'ollama client missing invoke method' });
          throw err;
        }
        const logger = this.logger;
        return {
          async invoke(messages) {
            // Retry transient transport failures (e.g. undici headers-timeout on a cold model load) so a
            // slow first token doesn't permanently fail the run now that failed runs are terminal.
            const response = await withLlmRetry(() => rawInvoke.call(client, messages), logger, 'ollama.invoke');
            return { content: response?.content };
          }
        } satisfies ChatModel;
      } catch (err) {
        this.logger.error?.({ err, msg: 'ollama provider requested but dependency unavailable' });
        throw new FlowError(
          'OLLAMA_UNAVAILABLE',
          'Ollama provider requires the optional "@langchain/ollama" package to be installed.',
          500,
          { cause: err }
        );
      }
    }

    if (modelConfig.provider === 'openai') {
      try {
        const module = await import('@langchain/openai');
        const ChatOpenAI = module.ChatOpenAI;
        if (typeof ChatOpenAI !== 'function') {
          throw new Error('ChatOpenAI constructor unavailable');
        }
        const configuration = modelConfig.baseUrl ? { baseURL: modelConfig.baseUrl } : undefined;
        const client = new ChatOpenAI({
          apiKey: modelConfig.apiKey,
          model: modelName,
          ...(configuration ? { configuration } : {})
        });
        const rawInvoke = (client as {
          invoke?: (messages: Array<{ role: string; content: unknown }>) => Promise<{ content?: unknown }>;
        }).invoke;
        if (typeof rawInvoke !== 'function') {
          const err = new Error('ChatOpenAI instance missing invoke method');
          this.logger.error?.({ err, msg: 'openai client missing invoke method' });
          throw err;
        }
        return {
          async invoke(messages) {
            const response = await rawInvoke.call(client, messages);
            return { content: response?.content };
          }
        } satisfies ChatModel;
      } catch (err) {
        this.logger.error?.({ err, msg: 'openai provider requested but dependency unavailable' });
        throw new FlowError(
          'OPENAI_UNAVAILABLE',
          'OpenAI provider requires the optional "@langchain/openai" package to be installed.',
          500,
          { cause: err }
        );
      }
    }

    throw new FlowError('MODEL_PROVIDER_UNSUPPORTED', `Unsupported model provider: ${modelConfig.provider}`, 500);
  }

  private async ensureChatModel(): Promise<ChatModel> {
    if (this.chatModel) {
      return this.chatModel;
    }
    this.chatModel = await this.loadModel(modelConfig.textModel);
    return this.chatModel;
  }

  private async ensureVisionChatModel(): Promise<ChatModel> {
    if (this.visionChatModel) {
      return this.visionChatModel;
    }
    // Use the dedicated vision model when configured; fall back to the text model.
    const modelName = modelConfig.visionModel ?? modelConfig.textModel;
    this.visionChatModel = await this.loadModel(modelName);
    return this.visionChatModel;
  }

  private async loadItemTarget(itemId: string): Promise<{ target: Record<string, unknown>; instanceSpecs: Record<string, unknown> | null }> {
    let row: Record<string, unknown> | undefined;
    const parsed = parseSequentialItemUUID(itemId);
    const artikelNummer = parsed?.kind === 'artikelnummer' ? parsed.artikelNummer : itemId;
    let source: 'items' | 'item_refs' | 'findByMaterial fallback' | null = null;

    if (parsed?.kind === 'artikelnummer') {
      try {
        row = await getItem(itemId) as Record<string, unknown> | undefined;
        if (row) {
          source = 'items';
          this.logger.debug?.({
            msg: 'loaded agentic target from item instance',
            itemId,
            artikelNummer,
            source
          });
        }
      } catch (err) {
        this.logger.error?.({ err, msg: 'failed to load item instance for agentic invocation', itemId, artikelNummer, source: 'items' });
        throw new FlowError('ITEM_LOOKUP_FAILED', 'Failed to load item details (source: items)', 500, { cause: err });
      }
    }

    if (!row) {
      try {
        row = await getItemReference(artikelNummer) as Record<string, unknown> | undefined;
        if (row) {
          source = 'item_refs';
          this.logger.debug?.({
            msg: 'loaded agentic target from item reference',
            itemId,
            artikelNummer,
            source
          });
        }
      } catch (err) {
        this.logger.error?.({ err, msg: 'failed to load item reference for agentic invocation', itemId, artikelNummer, source: 'item_refs' });
        throw new FlowError('ITEM_LOOKUP_FAILED', 'Failed to load item details (source: item_refs)', 500, { cause: err });
      }
    }

    if (!row) {
      try {
        const results = await findByMaterial(artikelNummer) as Record<string, unknown>[];
        row = Array.isArray(results) && results.length > 0 ? results[0] : undefined;
        if (row) {
          source = 'findByMaterial fallback';
          this.logger.info?.({
            msg: 'loaded agentic target from fallback item lookup',
            itemId,
            artikelNummer,
            source,
            fallbackUsed: true
          });
        }
      } catch (err) {
        this.logger.error?.({ err, msg: 'failed to load fallback item rows for agentic invocation', itemId, artikelNummer, source: 'findByMaterial fallback' });
        throw new FlowError('ITEM_LOOKUP_FAILED', 'Failed to load item details (source: findByMaterial fallback)', 500, {
          cause: err
        });
      }
    }

    if (!row) {
      this.logger.warn?.({ msg: 'agentic target lookup returned no rows', itemId, artikelNummer, source: source ?? 'none' });
      throw new FlowError('ITEM_NOT_FOUND', `Item ${itemId} not found (sources: items,item_refs,findByMaterial fallback)`, 404);
    }

    // Extract InstanceSpecs before buildTargetFromRow discards it — only present on items rows
    const rawInstanceSpecs = row.InstanceSpecs;
    const instanceSpecs = rawInstanceSpecs && typeof rawInstanceSpecs === 'object' && !Array.isArray(rawInstanceSpecs)
      ? rawInstanceSpecs as Record<string, unknown>
      : null;

    const target = buildTargetFromRow(row, this.logger);
    if (!target.Artikel_Nummer && artikelNummer) {
      target.Artikel_Nummer = artikelNummer;
    }
    return { target, instanceSpecs };
  }

  private async mergeTargetWithRequestPayload(
    target: Record<string, unknown>,
    requestId: string | null | undefined
  ): Promise<Record<string, unknown>> {
    const sanitizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
    if (!sanitizedRequestId) {
      return target;
    }

    let requestLog: { PayloadJson: string | null } | null;
    try {
      requestLog = await getAgenticRequestLog(sanitizedRequestId);
    } catch (err) {
      this.logger.error?.({ err, msg: 'failed to load request log for agentic invocation', requestId: sanitizedRequestId });
      return target;
    }

    if (!requestLog?.PayloadJson) {
      return target;
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(requestLog.PayloadJson);
    } catch (err) {
      this.logger.warn?.({ err, msg: 'failed to parse saved request payload json', requestId: sanitizedRequestId });
      return target;
    }

    const overrides = extractTargetOverrides(parsedPayload);
    if (Object.keys(overrides).length === 0) {
      return target;
    }

    // TODO(agent): Monitor Langtext override sanitation to ensure upstream payloads converge on strings.
    const sanitizedOverrides: Record<string, unknown> = { ...overrides };
    if (Object.prototype.hasOwnProperty.call(overrides, 'Langtext')) {
      const artikelNummerOverride =
        typeof overrides.Artikel_Nummer === 'string' ? overrides.Artikel_Nummer : null;
      const normalizedLangtext = overrides.Langtext ?? {};

      if (normalizedLangtext !== null) {
        sanitizedOverrides.Langtext = normalizedLangtext;
      } else {
        this.logger.warn?.({
          msg: 'discarded langtext override due to failed serialization',
          requestId: sanitizedRequestId,
          artikelNummer: artikelNummerOverride ?? undefined,
          artikelNummerTarget: typeof target.Artikel_Nummer === 'string' ? target.Artikel_Nummer : undefined
        });
        delete sanitizedOverrides.Langtext;
      }
    }

    const merged: Record<string, unknown> = { ...target, ...sanitizedOverrides };
    merged.Artikel_Nummer = target.Artikel_Nummer;

    if (typeof merged.Artikelbeschreibung === 'string') {
      const trimmed = merged.Artikelbeschreibung.trim();
      merged.Artikelbeschreibung = trimmed || (target.Artikelbeschreibung as string);
    } else if (typeof target.Artikelbeschreibung === 'string') {
      merged.Artikelbeschreibung = target.Artikelbeschreibung;
    }

    this.logger.info?.({
      msg: 'merged request payload into agentic target',
      requestId: sanitizedRequestId,
      mergedKeys: Object.keys(sanitizedOverrides)
    });

    return merged;
  }

  private ensureSearchInvoker(): (query: string, limit: number) => Promise<SearchResult> {
    return async (query: string, limit: number) => {
      this.logger.debug?.({ msg: 'dispatching Tavily search', query, limit });
      return this.searchClient.search(query, limit);
    };
  }

  public async invoke(input: AgenticModelInvocationInput): Promise<AgenticModelInvocationResult> {
    const trimmedItemId = input.itemId.trim();
    if (!trimmedItemId) {
      return { ok: false, message: 'missing-item-id' };
    }

    try {
      if (!searchConfig.tavilyApiKey) {
        this.logger.error?.({ msg: 'Tavily API key missing; cannot execute search' });
        return { ok: false, message: 'search-unconfigured' };
      }

      let normalizedReviewNotes: string | null = null;
      let normalizedMissingSpecFields: string[] = [];
      let normalizedUnneededSpecFields: string[] = [];
      try {
        const rawNotes = input.review?.notes ?? null;
        if (typeof rawNotes === 'string') {
          const condensed = rawNotes.replace(/\s+/g, ' ').trim();
          normalizedReviewNotes = condensed ? condensed : null;
        }

        normalizedMissingSpecFields = normalizeReviewSpecFieldList({
          value: input.review?.missing_spec,
          itemId: trimmedItemId,
          fieldName: 'missing_spec',
          logger: this.logger
        });
        normalizedUnneededSpecFields = normalizeReviewSpecFieldList({
          value: input.review?.unneeded_spec,
          itemId: trimmedItemId,
          fieldName: 'unneeded_spec',
          logger: this.logger
        });

        normalizedReviewNotes = composeReviewNotes({
          reviewNotes: normalizedReviewNotes,
          missingSpecFields: normalizedMissingSpecFields,
          unneededSpecFields: normalizedUnneededSpecFields
        });

        this.logger.info?.({
          msg: 'agentic invocation normalized review metadata',
          itemId: trimmedItemId,
          hasReviewNotes: Boolean(normalizedReviewNotes),
          missingSpecCount: normalizedMissingSpecFields.length,
          unneededSpecCount: normalizedUnneededSpecFields.length,
          missingSpecSample: normalizedMissingSpecFields.slice(0, REVIEW_SPEC_PREVIEW_LIMIT),
          unneededSpecSample: normalizedUnneededSpecFields.slice(0, REVIEW_SPEC_PREVIEW_LIMIT)
        });
      } catch (err) {
        this.logger.warn?.({ err, msg: 'failed to normalize review metadata for agentic invocation', itemId: trimmedItemId });
      }

      const requestedSkipSearch = Boolean(input.skipSearch);

      // Targeted rework: keys to regenerate + operator instruction. When present the flow runs in
      // rework mode (partial update — only these keys change; categorizer/pricing skipped).
      const reworkSpecFields = Array.isArray(input.reworkSpecFields)
        ? input.reworkSpecFields.map((k) => String(k).trim()).filter((k) => k.length > 0)
        : [];
      const reworkInstructions =
        typeof input.reworkInstructions === 'string' && input.reworkInstructions.trim()
          ? input.reworkInstructions.trim()
          : null;

      const { target: loadedTarget, instanceSpecs } = await this.loadItemTarget(trimmedItemId);
      let target = loadedTarget;
      // TODO(agent): Confirm target Artikel_Nummer normalization rules once identifier formatting is centralized.
      try {
        const parsedItemId = parseSequentialItemUUID(trimmedItemId);
        const normalizedArtikelNummer =
          parsedItemId?.kind === 'artikelnummer' ? parsedItemId.artikelNummer : trimmedItemId;
        const existingArtikelNummer =
          typeof target.Artikel_Nummer === 'string' ? target.Artikel_Nummer.trim() : null;
        if (existingArtikelNummer && existingArtikelNummer !== normalizedArtikelNummer) {
          this.logger.warn?.({
            msg: 'agentic invocation target Artikel_Nummer mismatch; overwriting with normalized artikel nummer',
            itemId: trimmedItemId,
            existingArtikelNummer,
            normalizedArtikelNummer
          });
        }
        target.Artikel_Nummer = normalizedArtikelNummer;
      } catch (err) {
        this.logger.warn?.({
          err,
          msg: 'failed to normalize target Artikel_Nummer for agentic invocation',
          itemId: trimmedItemId
        });
        target.Artikel_Nummer = trimmedItemId;
      }

      // Snapshot the pre-run enriched state (versioned history → KI-tab diff + restore) from the pure DB
      // fields, before the request-payload merge or Artikelbeschreibung fill-in mutates them. The run's
      // current ReviewState is captured so retention can always keep the last approved state. Best-effort:
      // a snapshot failure must never block the run.
      try {
        const snapshotArtikelNummer =
          typeof target.Artikel_Nummer === 'string' ? target.Artikel_Nummer.trim() : trimmedItemId;
        const existingForSnapshot = await getAgenticRun(snapshotArtikelNummer);
        await insertAgenticRunSnapshot({
          Artikel_Nummer: snapshotArtikelNummer,
          RunId: existingForSnapshot?.Id ?? null,
          Reason: reworkSpecFields.length > 0 ? 'pre-rework' : 'pre-run',
          CapturedReviewState: existingForSnapshot?.ReviewState ?? null,
          // Actor isn't on the invocation input; the reviewer (if any) is the closest available attribution.
          Actor: typeof input.review?.reviewedBy === 'string' && input.review.reviewedBy.trim() ? input.review.reviewedBy.trim() : null,
          TriggerReason: typeof input.context === 'string' && input.context.trim() ? input.context.trim() : null,
          SchemaVersion: AGENTIC_SNAPSHOT_SCHEMA_VERSION,
          Fields: buildSnapshotFields(loadedTarget as Record<string, unknown>)
        });
        await pruneAgenticRunSnapshots(snapshotArtikelNummer);
      } catch (err) {
        this.logger.warn?.({ err, msg: 'failed to capture pre-run snapshot', itemId: trimmedItemId });
      }

      if (!target.Artikelbeschreibung && input.searchQuery) {
        target.Artikelbeschreibung = input.searchQuery;
      }
      target = await this.mergeTargetWithRequestPayload({ ...target }, input.requestId ?? null);
      target = pruneUnneededSpecFieldsFromTarget({
        target: target as AgenticTarget,
        unneededSpecFields: normalizedUnneededSpecFields,
        itemId: trimmedItemId,
        logger: this.logger
      });
      // Ensure target is typed as AgenticTarget for downstream usage
      const typedTarget: AgenticTarget = target as AgenticTarget;
      const llm = await this.ensureChatModel();
      const visionLlm = await this.ensureVisionChatModel();
      const searchInvoker = this.ensureSearchInvoker();

      let exampleItemBlock: string | null = STATIC_EXAMPLE_ITEM_BLOCK;
      try {
        const candidates = await this.queryReviewedExamplesBySubcategory(trimmedItemId);
        const exampleSelection = selectExampleItemBlock({
          candidates,
          currentItemId: trimmedItemId,
          logger: this.logger
        });
        exampleItemBlock = exampleSelection.exampleBlock;
      } catch (err) {
        this.logger.warn?.({ err, msg: 'failed to select reviewed example block for prompt', itemId: trimmedItemId });
        exampleItemBlock = STATIC_EXAMPLE_ITEM_BLOCK;
      }

      // Reuse stored search results whenever we have them and no targeted re-search is warranted, so
      // the search provider is hit only when actually needed — no stored results yet, or a reviewer
      // asked us to find specific missing fields. This is the single decision point for search-vs-reuse
      // and so covers every path uniformly (first run, in-cycle retry after a failure, and the keep-busy
      // retry of a failed/cancelled run): a given item searches at most once until it is reset. A live
      // search persists its results immediately (deps.persistSearchLinks), so even a run that later
      // fails leaves them stored for the next, search-free attempt.
      const wantsFreshTargetedSearch = normalizedMissingSpecFields.length > 0;
      let storedSources: SearchSource[] | undefined;
      if (!wantsFreshTargetedSearch) {
        try {
          const existingRun = await getAgenticRun(trimmedItemId);
          if (existingRun?.LastSearchLinksJson) {
            const parsed = JSON.parse(existingRun.LastSearchLinksJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              storedSources = parsed as SearchSource[];
            }
          }
        } catch (err) {
          this.logger.warn?.({ err, msg: 'failed to load stored search sources', itemId: trimmedItemId });
        }
      }

      // Skip the live search only when there is actually a stored search to reuse; otherwise fall back
      // to a live search (a skip with zero evidence would extract nothing).
      const skipSearch = Array.isArray(storedSources) && storedSources.length > 0;
      if ((requestedSkipSearch || storedSources !== undefined) && !skipSearch) {
        this.logger.info?.({
          msg: 'no stored search to reuse; performing a live search',
          itemId: trimmedItemId,
          requestedSkipSearch
        });
      } else if (skipSearch && !requestedSkipSearch) {
        this.logger.info?.({ msg: 'reusing stored search results (no live search needed)', itemId: trimmedItemId });
      }

      const payload = await runItemFlow(
        {
          target: typedTarget,
          instanceSpecs,
          search: input.searchQuery ?? null,
          reviewNotes: normalizedReviewNotes,
          missingSpecFields: normalizedMissingSpecFields,
          unneededSpecFields: normalizedUnneededSpecFields,
          reworkSpecFields,
          reworkInstructions,
          skipSearch,
          storedSources,
          exampleItemBlock,
          imageData: input.imageData ?? null
        },
        {
          llm,
          visionLlm,
          logger: this.logger,
          searchInvoker: async (query, limit, metadata) => {
            const result = await searchInvoker(query, limit);
            return result;
          },
          searchRateLimitDelayMs: searchConfig.rateLimitDelayMs,
          applyAgenticResult: this.applyAgenticResult,
          saveRequestPayload: saveAgenticRequestPayload,
          markNotificationSuccess: markAgenticRequestNotificationSuccess,
          markNotificationFailure: markAgenticRequestNotificationFailure,
          persistLastError: this.persistAgenticRunError,
          persistSearchLinks: async (id: string, sources: SearchSource[]) => {
            try {
              await persistAgenticSearchLinks(id, serializeSearchSourcesForReuse(sources));
            } catch (err) {
              this.logger.warn?.({ err, msg: 'failed to persist search links for reuse', itemId: id });
            }
          }
        }
      );

      if (!payload.reviewNotes && normalizedReviewNotes) {
        this.logger.debug?.({
          msg: 'agentic payload missing reviewer notes; appending original instructions',
          itemId: trimmedItemId
        });
        payload.reviewNotes = normalizedReviewNotes;
      }

      this.logger.info?.({ msg: 'agentic model invocation completed', itemId: trimmedItemId, status: payload.status });
      return { ok: true, message: payload.summary };
    } catch (err) {
      if (err instanceof FlowError) {
        this.logger.error?.({ err, code: err.code, itemId: trimmedItemId });
        return { ok: false, message: err.message };
      }
      this.logger.error?.({ err, itemId: trimmedItemId });
      return { ok: false, message: err instanceof Error ? err.message : 'agentic-model-invocation-failed' };
    }
  }
}
