import type { AgenticModelInvocationInput, AgenticModelInvocationResult } from '../../models';
import {
  db,
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
  saveAgenticRequestPayload,
  markAgenticRequestNotificationSuccess,
  markAgenticRequestNotificationFailure
} from '../db';
import { modelConfig, searchConfig } from './config';
import { runItemFlow } from './flow/item-flow';
import type { ItemFlowLogger } from './flow/item-flow';
import type { ChatModel } from './flow/item-flow-extraction';
import type { AgenticTarget } from './flow/item-flow-schemas';
import { TavilySearchClient } from './tools/tavily-client';
import type { SearchResult } from './tools/tavily-client';
import { FlowError } from './flow/errors';
import { handleAgenticResult, type AgenticResultPayload } from './result-handler';
import { parseSequentialItemUUID } from '../lib/itemIds';

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

interface ChatModelFactory {
  (): Promise<ChatModel>;
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
  private chatModelFactory?: ChatModelFactory;
  private readonly applyAgenticResult: (payload: AgenticResultPayload) => void;
  private readonly persistAgenticRunError: (artikelNummer: string, errorMessage: string, attemptAt?: string) => void;

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
    this.applyAgenticResult = (payload: AgenticResultPayload) => {
      try {
        handleAgenticResult(
          { artikelNummer: payload.artikelNummer ?? '', payload },
          {
            ctx: {
              db,
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

  private async loadOllamaModel(): Promise<ChatModel> {
    try {
      const module = await import('@langchain/ollama');
      const ChatOllama = module.ChatOllama;
      if (typeof ChatOllama !== 'function') {
        throw new Error('ChatOllama constructor unavailable');
      }
      const client = new ChatOllama({
        baseUrl: modelConfig.ollama.baseUrl,
        model: modelConfig.ollama.model
      });
      const rawInvoke = (client as {
        invoke?: (messages: Array<{ role: string; content: unknown }>) => Promise<{ content?: unknown }>;
      }).invoke;
      if (typeof rawInvoke !== 'function') {
        const err = new Error('ChatOllama instance missing invoke method');
        this.logger.error?.({ err, msg: 'ollama client missing invoke method' });
        throw err;
      }
      const adapter = {
        async invoke(messages: Array<{ role: string; content: unknown }>) {
          const response = await rawInvoke.call(client, messages);
          return { content: response?.content };
        }
      } satisfies ChatModel;
      return adapter;
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

  private async loadOpenAIModel(): Promise<ChatModel> {
    try {
      const module = await import('@langchain/openai');
      const ChatOpenAI = module.ChatOpenAI;
      if (typeof ChatOpenAI !== 'function') {
        throw new Error('ChatOpenAI constructor unavailable');
      }
      const configuration = modelConfig.openai.baseUrl
        ? { baseURL: modelConfig.openai.baseUrl }
        : undefined;
      const client = new ChatOpenAI({
        apiKey: modelConfig.openai.apiKey,
        model: modelConfig.openai.model,
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
      const adapter = {
        async invoke(messages: Array<{ role: string; content: unknown }>) {
          const response = await rawInvoke.call(client, messages);
          return { content: response?.content };
        }
      } satisfies ChatModel;
      return adapter;
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

  private async ensureChatModel(): Promise<ChatModel> {
    if (this.chatModel) {
      return this.chatModel;
    }

    if (!this.chatModelFactory) {
      if (modelConfig.provider === 'ollama') {
        this.chatModelFactory = () => this.loadOllamaModel();
      } else if (modelConfig.provider === 'openai') {
        this.chatModelFactory = () => this.loadOpenAIModel();
      } else {
        throw new FlowError('MODEL_PROVIDER_UNSUPPORTED', `Unsupported model provider: ${modelConfig.provider}`, 500);
      }
    }

    this.chatModel = await this.chatModelFactory();
    return this.chatModel;
  }

  private async loadItemTarget(itemId: string): Promise<Record<string, unknown>> {
    let row: Record<string, unknown> | undefined;
    const parsed = parseSequentialItemUUID(itemId);
    if (parsed?.kind === 'artikelnummer') {
      try {
        row = getItem.get(itemId) as Record<string, unknown> | undefined;
      } catch (err) {
        this.logger.error?.({ err, msg: 'failed to load item for agentic invocation', itemId });
        throw new FlowError('ITEM_LOOKUP_FAILED', 'Failed to load item details', 500, { cause: err });
      }
    } else {
      try {
        const results = findByMaterial?.all ? (findByMaterial.all(itemId) as Record<string, unknown>[]) : [];
        row = Array.isArray(results) && results.length > 0 ? results[0] : undefined;
      } catch (err) {
        this.logger.error?.({ err, msg: 'failed to load item for agentic invocation by Artikel_Nummer', itemId });
        throw new FlowError('ITEM_LOOKUP_FAILED', 'Failed to load item details', 500, { cause: err });
      }
    }

    if (!row) {
      throw new FlowError('ITEM_NOT_FOUND', `Item ${itemId} not found`, 404);
    }

    return buildTargetFromRow(row, this.logger);
  }

  private mergeTargetWithRequestPayload(
    target: Record<string, unknown>,
    requestId: string | null | undefined
  ): Record<string, unknown> {
    const sanitizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
    if (!sanitizedRequestId) {
      return target;
    }

    let requestLog: { PayloadJson: string | null } | null;
    try {
      requestLog = getAgenticRequestLog(sanitizedRequestId);
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
      try {
        const rawNotes = input.review?.notes ?? null;
        if (typeof rawNotes === 'string') {
          const condensed = rawNotes.replace(/\s+/g, ' ').trim();
          normalizedReviewNotes = condensed ? condensed : null;
        }
      } catch (err) {
        this.logger.warn?.({ err, msg: 'failed to normalize review notes for agentic invocation', itemId: trimmedItemId });
      }

      let skipSearch = false;
      if (normalizedReviewNotes) {
        try {
          skipSearch = /skip\s+search|keine\s+suche|no\s+search/i.test(normalizedReviewNotes);
          this.logger.info?.({
            msg: 'agentic invocation received reviewer notes',
            itemId: trimmedItemId,
            skipSearchHint: skipSearch
          });
        } catch (err) {
          this.logger.warn?.({ err, msg: 'failed to evaluate skip search hint', itemId: trimmedItemId });
        }
      }

      let target = await this.loadItemTarget(trimmedItemId);
      // TODO(agent): Confirm target Artikel_Nummer normalization rules once identifier formatting is centralized.
      try {
        const existingArtikelNummer =
          typeof target.Artikel_Nummer === 'string' ? target.Artikel_Nummer.trim() : null;
        if (existingArtikelNummer && existingArtikelNummer !== trimmedItemId) {
          this.logger.warn?.({
            msg: 'agentic invocation target Artikel_Nummer mismatch; overwriting with request id',
            itemId: trimmedItemId,
            existingArtikelNummer
          });
        }
        target.Artikel_Nummer = trimmedItemId;
      } catch (err) {
        this.logger.warn?.({
          err,
          msg: 'failed to normalize target Artikel_Nummer for agentic invocation',
          itemId: trimmedItemId
        });
        target.Artikel_Nummer = trimmedItemId;
      }
      if (!target.Artikelbeschreibung && input.searchQuery) {
        target.Artikelbeschreibung = input.searchQuery;
      }
      target = this.mergeTargetWithRequestPayload({ ...target }, input.requestId ?? null);
      const llm = await this.ensureChatModel();
      const searchInvoker = this.ensureSearchInvoker();

      const payload = await runItemFlow(
        {
          target,
          search: input.searchQuery ?? null,
          reviewNotes: normalizedReviewNotes,
          skipSearch
        },
        {
          llm,
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
          persistLastError: this.persistAgenticRunError
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
