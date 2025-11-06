import type { AgenticModelInvocationInput, AgenticModelInvocationResult } from '../../models';
import {
  db,
  getItem,
  getAgenticRun,
  updateAgenticRunStatus,
  upsertAgenticRun,
  persistItemWithinTransaction,
  logEvent,
  getAgenticRequestLog,
  saveAgenticRequestPayload,
  markAgenticRequestNotificationSuccess,
  markAgenticRequestNotificationFailure
} from '../db';
import { modelConfig, searchConfig } from './config';
import { runItemFlow } from './flow/item-flow';
import type { ItemFlowLogger } from './flow/item-flow';
import type { ChatModel } from './flow/item-flow-extraction';
import { TavilySearchClient } from './tools/tavily-client';
import type { SearchResult } from './tools/tavily-client';
import { FlowError } from './flow/errors';
import type { AgenticResultPayload } from './utils/external-api';
import { handleAgenticResult } from './result-handler';

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

function buildTargetFromRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    itemUUid: normalizeString(row.ItemUUID),
    Artikelbeschreibung: normalizeString(row.Artikelbeschreibung),
    Marktpreis: normalizeNullableNumber(row.Verkaufspreis),
    Kurzbeschreibung: normalizeString(row.Kurzbeschreibung),
    Langtext: normalizeString(row.Langtext),
    Hersteller: normalizeString(row.Hersteller),
    Länge_mm: normalizeNullableNumber(row.Länge_mm),
    Breite_mm: normalizeNullableNumber(row.Breite_mm),
    Höhe_mm: normalizeNullableNumber(row.Höhe_mm),
    Gewicht_kg: normalizeNullableNumber(row.Gewicht_kg)
  };
}

export class AgenticModelInvoker {
  private readonly logger: AgenticModelInvokerLogger;
  private readonly searchClient: TavilySearchClient;
  private chatModel?: ChatModel;
  private chatModelFactory?: ChatModelFactory;
  private readonly applyAgenticResult: (payload: AgenticResultPayload) => void;

  constructor(options: AgenticModelInvokerOptions = {}) {
    this.logger = options.logger ?? console;
    this.searchClient = new TavilySearchClient({
      apiKey: searchConfig.tavilyApiKey,
      logger: this.logger
    });
    this.applyAgenticResult = (payload: AgenticResultPayload) => {
      try {
        handleAgenticResult(
          { itemId: payload.itemId, payload },
          {
            ctx: {
              db,
              getItem,
              getAgenticRun,
              persistItemWithinTransaction,
              updateAgenticRunStatus,
              upsertAgenticRun,
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
          itemId: payload.itemId
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
      return new ChatOllama({
        baseUrl: modelConfig.ollama.baseUrl,
        model: modelConfig.ollama.model
      });
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
      return new ChatOpenAI({
        openAIApiKey: modelConfig.openai.apiKey,
        baseUrl: modelConfig.openai.baseUrl,
        model: modelConfig.openai.model
      });
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
    try {
      row = getItem.get(itemId) as Record<string, unknown> | undefined;
    } catch (err) {
      this.logger.error?.({ err, msg: 'failed to load item for agentic invocation', itemId });
      throw new FlowError('ITEM_LOOKUP_FAILED', 'Failed to load item details', 500, { cause: err });
    }

    if (!row) {
      throw new FlowError('ITEM_NOT_FOUND', `Item ${itemId} not found`, 404);
    }

    return buildTargetFromRow(row);
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

      const target = await this.loadItemTarget(trimmedItemId);
      if (!target.Artikelbeschreibung && input.searchQuery) {
        target.Artikelbeschreibung = input.searchQuery;
      }
      const llm = await this.ensureChatModel();
      const searchInvoker = this.ensureSearchInvoker();

      const payload = await runItemFlow(
        {
          target,
          id: trimmedItemId,
          search: input.searchQuery ?? null
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
          markNotificationFailure: markAgenticRequestNotificationFailure
        }
      );

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
