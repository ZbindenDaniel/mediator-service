import { z } from 'zod';
import { modelConfig } from '../config';
import { FlowError } from './errors';
import type { ChatModel } from './item-flow-extraction';
import { parseJsonWithSanitizer, type ChatSessionSnapshot } from '../utils/json';
import { stringifyLangChainContent } from '../utils/langchain';
import { loadChatPrompt } from './prompts';
import { echoSqliteQuery, type SqliteEchoLogger, type SqliteEchoResult } from '../tools/sqlite-echo';

export interface ChatFlowLogger extends SqliteEchoLogger {
  info?: Console['info'];
  warn?: Console['warn'];
  error?: Console['error'];
}

export interface ChatFlowRequestMessage {
  role: string;
  content: string;
}

export interface ChatFlowDependencies {
  llm?: ChatModel;
  logger?: ChatFlowLogger;
  sqliteTool?: typeof echoSqliteQuery;
  persistSession?: (snapshot: ChatSessionSnapshot) => Promise<void> | void;
  loadChatModel?: (logger: ChatFlowLogger) => Promise<ChatModel>;
  loadChatPrompt?: (logger: ChatFlowLogger) => Promise<string>;
}

export interface ChatFlowResult {
  reply: string;
  sqliteQueries: string[];
  toolEchoes: SqliteEchoResult[];
}

const chatMessageSchema = z.object({
  role: z.string().trim().min(1),
  content: z.string().trim().min(1)
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1)
});

const agentResponseSchema = z.object({
  reply: z.string().min(1),
  sqliteQueries: z.array(z.string().min(1)).default([])
});

async function loadChatModel(logger: ChatFlowLogger): Promise<ChatModel> {
  if (modelConfig.provider === 'ollama') {
    try {
      const module = await import('@langchain/ollama');
      const ChatOllama = (module as { ChatOllama?: unknown }).ChatOllama as
        | (new (config: { baseUrl?: string; model?: string }) => { invoke(messages: Array<{ role: string; content: unknown }>): Promise<{ content?: unknown }> })
        | undefined;
      if (!ChatOllama) {
        throw new Error('ChatOllama constructor missing');
      }
      const client = new ChatOllama({ baseUrl: modelConfig.ollama.baseUrl, model: modelConfig.ollama.model });
      return {
        async invoke(messages) {
          const response = await client.invoke(messages);
          return { content: response?.content };
        }
      } satisfies ChatModel;
    } catch (err) {
      logger.error?.({ err, msg: 'ollama chat model unavailable' });
      throw new FlowError('CHAT_MODEL_UNAVAILABLE', 'Ollama provider unavailable', 500, { cause: err });
    }
  }

  if (modelConfig.provider === 'openai') {
    try {
      const module = await import('@langchain/openai');
      const ChatOpenAI = (module as { ChatOpenAI?: unknown }).ChatOpenAI as
        | (new (config: { apiKey?: string; baseUrl?: string; model?: string; configuration?: Record<string, unknown> }) => {
          invoke(messages: Array<{ role: string; content: unknown }>): Promise<{ content?: unknown }>;
        })
        | undefined;
      if (!ChatOpenAI) {
        throw new Error('ChatOpenAI constructor missing');
      }
      const configuration = modelConfig.openai.baseUrl ? { baseURL: modelConfig.openai.baseUrl } : undefined;
      const client = new ChatOpenAI({
        apiKey: modelConfig.openai.apiKey,
        model: modelConfig.openai.model,
        ...(configuration ? { configuration } : {})
      });
      return {
        async invoke(messages) {
          const response = await client.invoke(messages);
          return { content: response?.content };
        }
      } satisfies ChatModel;
    } catch (err) {
      logger.error?.({ err, msg: 'openai chat model unavailable' });
      throw new FlowError('CHAT_MODEL_UNAVAILABLE', 'OpenAI provider unavailable', 500, { cause: err });
    }
  }

  throw new FlowError('CHAT_MODEL_UNSUPPORTED', `Unsupported model provider: ${modelConfig.provider}`, 500);
}

function normaliseMessages(messages: ChatFlowRequestMessage[]): ChatFlowRequestMessage[] {
  return messages
    .map((message) => ({ role: message.role.trim(), content: message.content.trim() }))
    .filter((message) => message.role && message.content);
}

export async function runChatFlow(input: unknown, deps: ChatFlowDependencies = {}): Promise<ChatFlowResult> {
  const logger = deps.logger ?? console;
  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success) {
    logger.error?.({ msg: 'chat payload validation failed', issues: parsed.error.issues });
    throw new FlowError('CHAT_VALIDATION_FAILED', 'Invalid chat payload', 400, { context: { issues: parsed.error.issues } });
  }

  const messages = normaliseMessages(parsed.data.messages);
  if (!messages.some((message) => message.role === 'user')) {
    throw new FlowError('CHAT_VALIDATION_FAILED', 'At least one user message is required', 400);
  }

  const model = deps.llm ?? (deps.loadChatModel ? await deps.loadChatModel(logger) : await loadChatModel(logger));
  const sqliteTool = deps.sqliteTool ?? echoSqliteQuery;

  const systemPrompt = deps.loadChatPrompt
    ? await deps.loadChatPrompt(logger)
    : await loadChatPrompt({ logger });
  const promptMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((message) => ({ role: message.role, content: message.content }))
  ];

  let rawContent = '';
  try {
    const modelResponse = await model.invoke(promptMessages);
    rawContent = stringifyLangChainContent(modelResponse?.content ?? '', { logger, context: 'chat-flow.response' });
  } catch (err) {
    logger.error?.({ err, msg: 'chat model invocation failed' });
    throw new FlowError('CHAT_MODEL_ERROR', 'Chat model invocation failed', 500, { cause: err });
  }

  let parsedResponse: z.infer<typeof agentResponseSchema> | null = null;
  try {
    const json = parseJsonWithSanitizer(rawContent, { loggerInstance: logger, context: { stage: 'chat-flow-parse' } });
    parsedResponse = agentResponseSchema.parse(json);
  } catch (err) {
    logger.warn?.({ err, msg: 'chat agent response parsing failed', rawContent });
  }

  const sqliteQueries = parsedResponse?.sqliteQueries ?? [];
  const toolEchoes: SqliteEchoResult[] = [];
  for (const query of sqliteQueries) {
    try {
      const echo = await sqliteTool(query, { logger });
      toolEchoes.push(echo);
    } catch (err) {
      logger.warn?.({ err, msg: 'sqlite echo tool failed', queryPreview: query.slice(0, 120) });
    }
  }

  const reply = parsedResponse?.reply ?? rawContent;
  const result: ChatFlowResult = { reply, sqliteQueries, toolEchoes };

  try {
    const snapshot: ChatSessionSnapshot = {
      id: `chat-${Date.now()}`,
      createdAt: new Date().toISOString(),
      messages: [
        ...messages,
        {
          role: 'assistant',
          content: reply,
          proposedQueries: sqliteQueries
        }
      ]
    };
    await deps.persistSession?.(snapshot);
  } catch (err) {
    logger.warn?.({ err, msg: 'chat session persistence skipped' });
  }

  return result;
}

export { loadChatModel };
